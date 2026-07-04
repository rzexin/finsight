"use client";

import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { GlassCard, SectionTitle } from "@/components/ui/GlassCard";
import { LoadingPanel, ErrorPanel } from "@/components/ui/StateView";
import { fmtNum, fmtPct, fmtSigned, fmtMoney, changeClass, MARKET_BADGE, MARKET_CURRENCY } from "@/lib/format";
import { MARKET_LABEL, type MarketOverview, type RankItem } from "@/types/finsight";
import { IconArrow } from "@/components/ui/icons";

type Tab = "gainers" | "losers" | "active" | "marketCap";
const TABS: { id: Tab; label: string }[] = [
  { id: "gainers", label: "涨幅榜" },
  { id: "losers", label: "跌幅榜" },
  { id: "active", label: "成交活跃" },
  { id: "marketCap", label: "市值榜" },
];

type StockMarket = "CN" | "HK" | "US";
const MARKETS: { id: StockMarket; label: string }[] = [
  { id: "CN", label: "沪深京 A 股" },
  { id: "HK", label: "港股" },
  { id: "US", label: "美股" },
];

/** 指数按 region 而非 market 归类（IndexQuote 无 market 字段），映射到对应计价货币符号。 */
const INDEX_CURRENCY: Record<string, string> = {
  沪深: "¥",
  香港: "HK$",
  美国: "$",
};

/** 按 (市场, Tab) 从 overview 中取出对应榜单；CN 沿用原有字段，HK/US 取新增的分市场字段。 */
function pickRankData(data: MarketOverview | null | undefined, market: StockMarket, tab: Tab): RankItem[] {
  if (!data) return [];
  const key = {
    CN: { gainers: data.gainers, losers: data.losers, active: data.active, marketCap: data.marketCap },
    HK: { gainers: data.hkGainers, losers: data.hkLosers, active: data.hkActive, marketCap: data.hkMarketCap },
    US: { gainers: data.usGainers, losers: data.usLosers, active: data.usActive, marketCap: data.usMarketCap },
  } as const;
  return key[market][tab] ?? [];
}

function RankRow({ item, rank, valueKind = "price" }: { item: RankItem; rank: number; valueKind?: "price" | "marketCap" }) {
  const currency = MARKET_CURRENCY[item.market];
  const primaryValue =
    valueKind === "marketCap"
      ? item.marketCap != null
        ? fmtMoney(item.marketCap, currency)
        : "--"
      : `${currency}${fmtNum(item.price)}`;
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
      <span className="tnum text-sm font-semibold text-ink">{primaryValue}</span>
      <span className={`tnum w-16 text-right text-sm font-bold ${changeClass(item.changePct)}`}>
        {fmtPct(item.changePct)}
      </span>
    </Link>
  );
}

export default function MarketPage() {
  const { data, error, loading, reload } = useFetch<MarketOverview>("/api/market/overview", { pollMs: 20000 });
  const [tab, setTab] = useState<Tab>("gainers");
  const [market, setMarket] = useState<StockMarket>("CN");

  const rankData = pickRankData(data, market, tab);

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
                <p className="tnum mt-1 text-lg font-bold text-ink">
                  {INDEX_CURRENCY[idx.region] ?? ""}
                  {fmtNum(idx.price)}
                </p>
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
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
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-surface p-0.5">
              {MARKETS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMarket(m.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                    market === m.id ? "bg-primary/10 text-primary" : "text-faint hover:text-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {loading && <LoadingPanel rows={5} />}
          {error && !loading && <ErrorPanel detail={error} onRetry={reload} />}
          {data && (
            <div className="space-y-0.5">
              {rankData.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">暂无榜单数据</p>}
              {rankData.map((it, i) => (
                <RankRow
                  key={`${it.market}-${it.code}`}
                  item={it}
                  rank={i + 1}
                  valueKind={tab === "marketCap" ? "marketCap" : "price"}
                />
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
                <RankRow key={it.code} item={it} rank={i + 1} valueKind="marketCap" />
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
