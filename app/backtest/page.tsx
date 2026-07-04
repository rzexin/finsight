"use client";

import { useState } from "react";
import Link from "next/link";
import { GlassCard, SectionTitle } from "@/components/ui/GlassCard";
import {
  LoadingPanel,
  ErrorPanel,
  EmptyPanel,
} from "@/components/ui/StateView";
import { AddSymbol } from "@/components/watchlist/AddSymbol";
import { EquityChart } from "@/components/charts/EquityChart";
import { fmtPct, fmtNum, changeClass, MARKET_BADGE } from "@/lib/format";
import { MARKET_LABEL, type Market } from "@/types/finsight";
import type { BacktestResult } from "@/lib/backtest";
import { IconSpark, IconArrow, IconFlask } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/InfoTip";

type Picked = { market: Market; code: string; name: string };

const STRATEGIES = [
  { id: "ma_cross", label: "均线交叉", desc: "MA 快线上穿/下穿慢线" },
  { id: "rsi_reversal", label: "RSI 反转", desc: "超卖买入、超买卖出" },
  { id: "breakout", label: "通道突破", desc: "突破 N 日高点买入" },
] as const;

type StrategyId = (typeof STRATEGIES)[number]["id"];

function Metric({
  label,
  value,
  tone,
  infoTerm,
}: {
  label: string;
  value: string;
  tone?: string;
  infoTerm?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="flex items-center gap-1 text-[11px] text-faint">
        {label}
        {infoTerm && <InfoTip term={infoTerm} label={label} />}
      </p>
      <p className={`tnum mt-1 text-xl font-bold ${tone ?? "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

export default function BacktestPage() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [strategy, setStrategy] = useState<StrategyId>("ma_cross");
  const [fast, setFast] = useState(5);
  const [slow, setSlow] = useState(20);
  const [window, setWindow] = useState(20);
  const [result, setResult] = useState<
    | (BacktestResult & { range?: { from: string; to: string; bars: number } })
    | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!picked) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const params = new URLSearchParams({
      market: picked.market,
      code: picked.code,
      strategy,
    });
    if (strategy === "ma_cross") {
      params.set("fast", String(fast));
      params.set("slow", String(slow));
    } else if (strategy === "breakout") {
      params.set("window", String(window));
    }
    const res = await fetch(`/api/backtest?${params}`).catch(() => null);
    setLoading(false);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => null) : null;
      setError(
        j?.error ? `${j.error}${j.detail ? "：" + j.detail : ""}` : "回测失败",
      );
      return;
    }
    setResult(await res.json());
  };

  const m = result?.metrics;
  const aiPrompt =
    result && picked && m
      ? `我用「${STRATEGIES.find((s) => s.id === strategy)?.label}」策略回测了 ${picked.name}（${picked.market}:${picked.code}），结果：总收益 ${(m.totalReturn * 100).toFixed(1)}%，基准(买入持有) ${(m.benchmarkReturn * 100).toFixed(1)}%，最大回撤 ${(m.maxDrawdown * 100).toFixed(1)}%，胜率 ${(m.winRate * 100).toFixed(0)}%，夏普 ${m.sharpe.toFixed(2)}，共 ${m.tradeCount} 次交易。请帮我复盘该策略的优劣、适用性与改进方向。`
      : "";

  return (
    <div className="animate-rise space-y-6">
      <SectionTitle
        kicker="Strategy Backtest"
        title="策略回测 + 复盘"
        desc="基于历史 K 线运行可配置策略，输出净值曲线、最大回撤、胜率与夏普，并交给 AI 复盘。"
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        {/* 配置 */}
        <GlassCard className="space-y-4 p-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">
              1. 选择标的
            </p>
            <AddSymbol onAdd={(it) => setPicked(it)} />
            {picked && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MARKET_BADGE[picked.market]}`}
                >
                  {MARKET_LABEL[picked.market]}
                </span>
                <span className="text-sm font-semibold text-ink">
                  {picked.name}
                </span>
                <span className="tnum text-xs text-faint">{picked.code}</span>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">
              2. 选择策略
            </p>
            <div className="space-y-2">
              {STRATEGIES.map((s) => (
                // 用 div 而非 button 承载整块点击区域，避免和内部 InfoTip 的「?」按钮形成嵌套 <button>
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setStrategy(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setStrategy(s.id);
                  }}
                  className={`block w-full rounded-lg border px-3 py-2 text-left transition cursor-pointer ${
                    strategy === s.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-line hover:border-primary/30"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-ink">{s.label}</span>
                    <InfoTip term={s.label} />
                  </span>
                  <p className="text-[11px] text-muted">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {strategy === "ma_cross" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  快线周期
                  <InfoTip term="快线周期" />
                </span>
                <input
                  type="number"
                  value={fast}
                  min={2}
                  max={60}
                  onChange={(e) => setFast(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary/50"
                />
              </label>
              <label className="text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  慢线周期
                  <InfoTip term="慢线周期" />
                </span>
                <input
                  type="number"
                  value={slow}
                  min={3}
                  max={250}
                  onChange={(e) => setSlow(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary/50"
                />
              </label>
            </div>
          )}
          {strategy === "breakout" && (
            <label className="block text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                突破窗口 (日)
                <InfoTip term="突破窗口(日)" />
              </span>
              <input
                type="number"
                value={window}
                min={5}
                max={120}
                onChange={(e) => setWindow(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary/50"
              />
            </label>
          )}

          <button
            onClick={run}
            disabled={!picked || loading}
            className="btn-neon w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconFlask width={17} height={17} />
            {loading ? "回测中…" : "运行回测"}
          </button>
        </GlassCard>

        {/* 结果 */}
        <div className="space-y-5">
          {!result && !loading && !error && (
            <GlassCard className="flex min-h-[360px] items-center justify-center p-5">
              <EmptyPanel
                title="选择标的与策略后开始回测"
                desc="所有回测均基于历史行情数据"
              />
            </GlassCard>
          )}
          {loading && (
            <GlassCard className="p-5">
              <LoadingPanel rows={5} label="正在拉取历史数据并回测…" />
            </GlassCard>
          )}
          {error && (
            <GlassCard className="p-5">
              <ErrorPanel detail={error} onRetry={run} />
            </GlassCard>
          )}

          {result && m && (
            <>
              <GlassCard className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-ink">
                    回测结果
                  </h3>
                  {result.range && (
                    <span className="text-[11px] text-faint">
                      {result.range.from} ~ {result.range.to} ·{" "}
                      {result.range.bars} 根
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Metric
                    label="策略总收益"
                    infoTerm="策略总收益"
                    value={fmtPct(m.totalReturn * 100)}
                    tone={changeClass(m.totalReturn)}
                  />
                  <Metric
                    label="基准(买入持有)"
                    infoTerm="基准(买入持有)"
                    value={fmtPct(m.benchmarkReturn * 100)}
                    tone={changeClass(m.benchmarkReturn)}
                  />
                  <Metric
                    label="年化收益"
                    infoTerm="年化收益"
                    value={fmtPct(m.annualizedReturn * 100)}
                    tone={changeClass(m.annualizedReturn)}
                  />
                  <Metric
                    label="最大回撤"
                    infoTerm="最大回撤"
                    value={fmtPct(m.maxDrawdown * 100)}
                    tone="down"
                  />
                  <Metric
                    label="胜率"
                    infoTerm="胜率"
                    value={`${(m.winRate * 100).toFixed(0)}%`}
                  />
                  <Metric
                    label="夏普比率"
                    infoTerm="夏普比率"
                    value={fmtNum(m.sharpe)}
                    tone={changeClass(m.sharpe)}
                  />
                </div>
                <div className="mt-4">
                  <EquityChart data={result.equity} />
                </div>
                <Link
                  href={`/assistant?q=${encodeURIComponent(aiPrompt)}`}
                  className="btn-ghost mt-4 w-full justify-center"
                >
                  <IconSpark width={16} height={16} /> 让 AI 复盘这次回测{" "}
                  <IconArrow width={14} height={14} />
                </Link>
              </GlassCard>

              {result.trades.length > 0 && (
                <GlassCard className="p-5">
                  <h3 className="mb-3 font-display text-sm font-bold text-ink">
                    交易记录（{result.trades.length}）
                  </h3>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[11px] text-faint">
                        <tr className="text-left">
                          <th className="py-1.5 font-medium">买入日</th>
                          <th className="font-medium">买入价</th>
                          <th className="font-medium">卖出日</th>
                          <th className="font-medium">卖出价</th>
                          <th className="text-right font-medium">收益</th>
                        </tr>
                      </thead>
                      <tbody className="tnum">
                        {result.trades.map((t, i) => (
                          <tr key={i} className="border-t border-line">
                            <td className="py-1.5">{t.entryDate}</td>
                            <td>{fmtNum(t.entryPrice)}</td>
                            <td>{t.exitDate}</td>
                            <td>{fmtNum(t.exitPrice)}</td>
                            <td
                              className={`text-right font-semibold ${changeClass(t.ret)}`}
                            >
                              {fmtPct(t.ret * 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
