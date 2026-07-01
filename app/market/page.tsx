"use client";

import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { GlassCard, SectionTitle } from "@/components/ui/GlassCard";
import { LoadingPanel, ErrorPanel } from "@/components/ui/StateView";
import { fmtNum, fmtPct, fmtSigned, changeClass, MARKET_BADGE } from "@/lib/format";
import { MARKET_LABEL, type MarketOverview, type RankItem } from "@/types/finsight";
import { IconArrow } from "@/components/ui/icons";

type Tab = "gainers" | "losers" | "active";
const TABS: { id: Tab; label: string }[] = [
  { id: "gainers", label: "涨幅榜" },
  { id: "losers", label: "跌幅榜" },
  { id: "active", label: "成交活跃" },
];

function RankRow({ item, rank }: { item: RankItem; rank: number }) {
  return (
    <Link
      href={`/stock/${item.market}/${item.code}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-primary/5"
    >
      <span className="w-5 text-center font-display text-sm font-bold text-faint">{rank}</span>
      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MARKET_BADGE[item.market]}`}>
        {MARKET_LABEL[item.market]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
        <p className="tnum text-[11px] text-faint">{item.code}</p>
      </div>
      <span className="tnum text-sm font-semibold text-ink">{fmtNum(item.price)}</span>
      <span className={`tnum w-16 text-right text-sm font-bold ${changeClass(item.changePct)}`}>
        {fmtPct(item.changePct)}
      </span>
    </Link>
  );
}

export default function MarketPage() {
  const { data, error, loading, reload } = useFetch<MarketOverview>("/api/market/overview", { pollMs: 20000 });
  const [tab, setTab] = useState<Tab>("gainers");

  const rankData = data ? data[tab] : [];

  return (
    <div className="animate-rise space-y-7">
      <SectionTitle
        kicker="Market Dashboard"
        title="全市场行情看板"
        desc="A股 / 港股 / 美股核心指数与个股榜单，加密货币市值榜，实时刷新。"
        action={
          <span className="chip">
            <span className="h-1.5 w-1.5 rounded-full bg-down" style={{ animation: "fs-pulse 1.6s infinite" }} />
            20s 自动刷新
          </span>
        }
      />

      {/* 指数 */}
      <GlassCard className="p-5">
        <h3 className="mb-4 font-display text-sm font-bold text-ink">核心指数</h3>
        {loading && <LoadingPanel rows={2} />}
        {error && !loading && <ErrorPanel detail={error} onRetry={reload} />}
        {data && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {data.indices.map((idx) => (
              <div key={idx.code} className="rounded-xl border border-line bg-surface p-3.5 transition hover:border-primary/30">
                <p className="text-xs text-muted">{idx.name}</p>
                <p className="tnum mt-1 text-lg font-bold text-ink">{fmtNum(idx.price)}</p>
                <p className={`tnum text-xs font-semibold ${changeClass(idx.changePct)}`}>
                  {fmtSigned(idx.change)} ({fmtPct(idx.changePct)})
                </p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* 榜单 */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer ${
                  tab === t.id ? "bg-primary/10 text-primary" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-faint">沪深京 A 股</span>
          </div>
          {loading && <LoadingPanel rows={5} />}
          {error && !loading && <ErrorPanel detail={error} onRetry={reload} />}
          {data && (
            <div className="space-y-0.5">
              {rankData.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">暂无榜单数据</p>}
              {rankData.map((it, i) => (
                <RankRow key={`${it.market}-${it.code}`} item={it} rank={i + 1} />
              ))}
            </div>
          )}
        </GlassCard>

        {/* 加密 */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">加密货币 · 市值榜</h3>
            <span className="text-[11px] text-faint">CoinGecko</span>
          </div>
          {loading && <LoadingPanel rows={5} />}
          {data && (
            <div className="space-y-0.5">
              {data.crypto.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">暂无加密数据</p>}
              {data.crypto.map((it, i) => (
                <RankRow key={it.code} item={it} rank={i + 1} />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <div className="flex justify-center">
        <Link href="/assistant" className="btn-ghost">
          想深入研究某只标的？交给 AI 研究助手
          <IconArrow width={15} height={15} />
        </Link>
      </div>
    </div>
  );
}
