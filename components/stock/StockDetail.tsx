"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import { addWatch, removeWatch, isWatched } from "@/lib/storage";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingPanel, ErrorPanel } from "@/components/ui/StateView";
import { KLineChart } from "@/components/charts/KLineChart";
import { NewsList } from "@/components/news/NewsList";
import {
  fmtNum,
  fmtPct,
  fmtSigned,
  fmtMoney,
  fmtVolume,
  changeClass,
  changeBg,
  MARKET_BADGE,
} from "@/lib/format";
import { MARKET_LABEL, type Market, type KlinePeriod, type Quote, type FinancialMetric, type Candle, type NewsItem } from "@/types/finsight";
import type { IndicatorBundle } from "@/lib/indicators";
import { IconSpark, IconArrow, IconEye } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/InfoTip";

const PERIODS: { id: KlinePeriod; label: string }[] = [
  { id: "1d", label: "日K" },
  { id: "1w", label: "周K" },
  { id: "1M", label: "月K" },
  { id: "60m", label: "60分" },
  { id: "15m", label: "15分" },
];

function Stat({
  label,
  value,
  tone,
  infoTerm,
}: {
  label: string;
  value: string;
  tone?: string;
  /** 传入即在标签旁显示「?」速查图标；不传则不展示（如「今开」等日常词不需要解释） */
  infoTerm?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] text-faint">
        {label}
        {infoTerm && <InfoTip term={infoTerm} label={label} />}
      </p>
      <p className={`tnum text-sm font-semibold ${tone ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

function fmtMetric(m: FinancialMetric): string {
  if (m.value == null) return "--";
  if (m.unit === "元" && Math.abs(m.value) >= 1e8) return fmtMoney(m.value);
  if (m.unit === "股" && Math.abs(m.value) >= 1e4) return fmtVolume(m.value);
  if (m.unit === "%") return `${fmtNum(m.value)}%`;
  return fmtNum(m.value);
}

export function StockDetail({ market, code }: { market: Market; code: string }) {
  const [period, setPeriod] = useState<KlinePeriod>("1d");

  const quoteRes = useFetch<{ quotes: Quote[] }>(`/api/quote?symbols=${market}:${code}`, { pollMs: 15000 });
  const klineRes = useFetch<{ candles: Candle[]; indicators?: IndicatorBundle }>(
    `/api/kline?market=${market}&code=${encodeURIComponent(code)}&period=${period}&limit=240&indicators=1`
  );
  const finRes = useFetch<{ metrics: FinancialMetric[] }>(
    market === "CRYPTO" ? null : `/api/financials?market=${market}&code=${encodeURIComponent(code)}`
  );
  const quote = quoteRes.data?.quotes?.[0];
  const name = quote?.name ?? code;
  const newsRes = useFetch<{ items: NewsItem[] }>(
    quote ? `/api/news?keyword=${encodeURIComponent(name.replace("/USDT", ""))}&limit=10` : null
  );

  const ind = klineRes.data?.indicators;
  const last = (klineRes.data?.candles?.length ?? 0) - 1;
  const pick = (a?: (number | null)[]) => (a && last >= 0 ? a[last] : null);

  const [watched, setWatched] = useState(false);
  useEffect(() => {
    setWatched(isWatched(market, code));
  }, [market, code]);
  const toggleWatch = () => {
    if (watched) {
      removeWatch(market, code);
      setWatched(false);
    } else {
      addWatch({ market, code, name });
      setWatched(true);
    }
  };

  return (
    <div className="animate-rise space-y-5">
      {/* 头部 */}
      <GlassCard neon className="p-6">
        {quoteRes.loading && <LoadingPanel rows={2} />}
        {quoteRes.error && !quoteRes.loading && <ErrorPanel message="行情加载失败" detail={quoteRes.error} onRetry={quoteRes.reload} />}
        {quote && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${MARKET_BADGE[market]}`}>
                  {MARKET_LABEL[market]}
                </span>
                <span className="tnum text-sm text-muted">{code}</span>
              </div>
              <h1 className="mt-1.5 font-display text-3xl font-bold text-ink">{name}</h1>
              <div className="mt-2 flex items-end gap-3">
                <span className={`tnum text-4xl font-bold ${changeClass(quote.changePct)}`}>{fmtNum(quote.price)}</span>
                <span className={`tnum mb-1 rounded-lg px-2 py-1 text-sm font-bold ${changeBg(quote.changePct)}`}>
                  {fmtSigned(quote.change)} · {fmtPct(quote.changePct)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={toggleWatch} className={watched ? "btn-ghost border-primary/40 text-primary" : "btn-ghost"}>
                <IconEye width={17} height={17} />
                {watched ? "已在观察池" : "加入观察池"}
              </button>
              <Link
                href={`/assistant?symbol=${market}:${code}&name=${encodeURIComponent(name)}`}
                className="btn-neon"
              >
                <IconSpark width={18} height={18} />
                AI 一键深研
                <IconArrow width={15} height={15} />
              </Link>
            </div>
          </div>
        )}
        {quote && (
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4 sm:grid-cols-6">
            <Stat label="今开" value={fmtNum(quote.open)} />
            <Stat label="最高" value={fmtNum(quote.high)} tone="up" />
            <Stat label="最低" value={fmtNum(quote.low)} tone="down" />
            <Stat label="昨收" value={fmtNum(quote.prevClose)} />
            <Stat label="成交量" value={fmtVolume(quote.volume)} />
            <Stat label="成交额" value={fmtMoney(quote.turnover, quote.currency ? "" : "¥")} />
          </div>
        )}
      </GlassCard>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* K线 */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  period === p.id ? "bg-primary/10 text-primary" : "text-muted hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {klineRes.loading && <LoadingPanel rows={4} />}
          {klineRes.error && !klineRes.loading && <ErrorPanel message="K线加载失败" detail={klineRes.error} onRetry={klineRes.reload} />}
          {klineRes.data && klineRes.data.candles.length > 0 && (
            <KLineChart candles={klineRes.data.candles} indicators={ind} period={period} />
          )}
        </GlassCard>

        {/* 技术指标 + 基本面 */}
        <div className="space-y-5">
          <GlassCard className="p-5">
            <h3 className="mb-3 font-display text-sm font-bold text-ink">技术指标（最新）</h3>
            {ind ? (
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <Stat label="MA5 / MA20" infoTerm="MA5 / MA20" value={`${fmtNum(pick(ind.ma5))} / ${fmtNum(pick(ind.ma20))}`} />
                <Stat label="RSI(14)" infoTerm="RSI(14)" value={fmtNum(pick(ind.rsi14))} />
                <Stat label="MACD DIF/DEA" infoTerm="MACD DIF/DEA" value={`${fmtNum(pick(ind.macd.dif))} / ${fmtNum(pick(ind.macd.dea))}`} />
                <Stat label="KDJ J" infoTerm="KDJ J" value={fmtNum(pick(ind.kdj.j))} />
                <Stat label="BOLL 上轨" infoTerm="BOLL 上轨" value={fmtNum(pick(ind.boll.upper))} tone="up" />
                <Stat label="BOLL 下轨" infoTerm="BOLL 下轨" value={fmtNum(pick(ind.boll.lower))} tone="down" />
              </div>
            ) : (
              <p className="text-sm text-muted">加载中…</p>
            )}
          </GlassCard>

          {market !== "CRYPTO" && (
            <GlassCard className="p-5">
              <h3 className="mb-3 font-display text-sm font-bold text-ink">估值与基本面</h3>
              {finRes.loading && <LoadingPanel rows={3} />}
              {finRes.error && !finRes.loading && <ErrorPanel message="基本面加载失败" detail={finRes.error} onRetry={finRes.reload} />}
              {finRes.data && (
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  {finRes.data.metrics.slice(0, 10).map((m) => (
                    <Stat key={m.label} label={m.label} infoTerm={m.label} value={fmtMetric(m)} />
                  ))}
                </div>
              )}
            </GlassCard>
          )}
        </div>
      </div>

      {/* 资讯 */}
      <GlassCard className="p-5">
        <h3 className="mb-1 font-display text-sm font-bold text-ink">相关资讯</h3>
        {newsRes.loading && <LoadingPanel rows={3} />}
        {newsRes.error && !newsRes.loading && <ErrorPanel detail={newsRes.error} onRetry={newsRes.reload} />}
        {newsRes.data && <NewsList items={newsRes.data.items} />}
      </GlassCard>
    </div>
  );
}
