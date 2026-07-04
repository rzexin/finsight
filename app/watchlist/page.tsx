"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, SectionTitle } from "@/components/ui/GlassCard";
import { InfoTip } from "@/components/ui/InfoTip";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  LoadingPanel,
  ErrorPanel,
  EmptyPanel,
} from "@/components/ui/StateView";
import { AddSymbol } from "@/components/watchlist/AddSymbol";
import { useFetch } from "@/lib/useFetch";
import {
  getWatchlist,
  addWatch,
  removeWatch,
  getSignalConfig,
  saveSignalConfig,
  type WatchItem,
} from "@/lib/storage";
import {
  DEFAULT_SIGNAL_CONFIG,
  type Signal,
  type SignalConfig,
  type SignalLevel,
} from "@/lib/signals";
import { fmtNum, fmtPct, changeClass, MARKET_BADGE } from "@/lib/format";
import { MARKET_LABEL, type Market, type Quote } from "@/types/finsight";
import {
  IconSpark,
  IconClose,
  IconBolt,
  IconArrow,
  IconTrendUp,
  IconTrendDown,
  IconBars,
  IconWarnTriangle,
  IconRefresh,
} from "@/components/ui/icons";

const LEVEL_STYLE: Record<SignalLevel, string> = {
  bullish: "border-up/30 bg-up/5 text-up",
  bearish: "border-down/30 bg-down/5 text-down",
  warn: "border-warn/40 bg-warn/5 text-warn",
  info: "border-primary/30 bg-primary/5 text-primary",
};

// 除了颜色，额外用文案 + 图标兜底方向语义（红涨绿跌的配色对美股/加密用户不直觉）
const LEVEL_LABEL: Record<SignalLevel, string> = {
  bullish: "看多",
  bearish: "看空",
  warn: "预警",
  info: "提示",
};

// 展示优先级：预警 / 看空类风险信号优先露出，其次是看多机会，最后是中性提示
const LEVEL_PRIORITY: Record<SignalLevel, number> = {
  warn: 0,
  bearish: 1,
  bullish: 2,
  info: 3,
};

const LEVEL_TAB_STYLE: Record<SignalLevel, string> = {
  bullish: "bg-up/10 text-up",
  bearish: "bg-down/10 text-down",
  warn: "bg-warn/10 text-warn",
  info: "bg-primary/10 text-primary",
};

function getSignalIcon(s: Signal) {
  switch (s.type) {
    case "abnormal":
      return s.level === "bullish" ? IconTrendUp : IconTrendDown;
    case "breakout_up":
    case "golden_cross":
      return IconTrendUp;
    case "breakout_down":
    case "death_cross":
    case "rsi_low":
      return IconTrendDown;
    case "volume_spike":
      return IconBars;
    case "drawdown":
    case "rsi_high":
      return IconWarnTriangle;
    default:
      return IconSpark;
  }
}

const CFG_FIELDS: {
  key: keyof SignalConfig;
  label: string;
  infoTerm: string;
  min: number;
  max: number;
  step: number;
  hint: (v: number) => string;
}[] = [
  {
    key: "changePct",
    label: "异动涨跌幅阈值 (%)",
    infoTerm: "异动",
    min: 1,
    max: 20,
    step: 0.5,
    hint: (v) => (v <= 3 ? "灵敏 · 信号较多" : v <= 8 ? "适中" : "严格 · 仅剧烈异动"),
  },
  {
    key: "breakoutWindow",
    label: "突破/回撤窗口 (日)",
    infoTerm: "突破窗口(日)",
    min: 5,
    max: 60,
    step: 1,
    hint: (v) => (v <= 10 ? "短线视角" : v <= 30 ? "中线视角" : "长线视角"),
  },
  {
    key: "volMultiple",
    label: "放量倍数",
    infoTerm: "放量",
    min: 1.2,
    max: 5,
    step: 0.1,
    hint: (v) => (v <= 1.8 ? "灵敏 · 信号较多" : v <= 3 ? "适中" : "严格 · 仅明显放量"),
  },
  {
    key: "drawdownPct",
    label: "回撤预警 (%)",
    infoTerm: "回撤预警",
    min: 5,
    max: 40,
    step: 1,
    hint: (v) => (v <= 10 ? "灵敏 · 信号较多" : v <= 20 ? "适中" : "严格 · 仅大幅回撤"),
  },
];

// 信号卡片标题是拼接了具体数值的动态文案（如"MA5 上穿 MA20·金叉"），
// 按信号类型固定映射到术语库词条，而不是直接对动态文案做模糊匹配
const SIGNAL_TERM: Record<string, string> = {
  abnormal: "异动",
  breakout_up: "突破 / 跌破",
  breakout_down: "突破 / 跌破",
  drawdown: "回撤预警",
  volume_spike: "放量",
  golden_cross: "金叉",
  death_cross: "死叉",
  rsi_high: "超买",
  rsi_low: "超卖",
};

export default function WatchlistPage() {
  const router = useRouter();
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [config, setConfig] = useState<SignalConfig>(DEFAULT_SIGNAL_CONFIG);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalErr, setEvalErr] = useState<string | null>(null);
  const [evaluatedAt, setEvaluatedAt] = useState<number | null>(null);
  const [levelFilter, setLevelFilter] = useState<SignalLevel | "all">("all");
  const [sparkMap, setSparkMap] = useState<Map<string, number[]>>(new Map());

  useEffect(() => {
    setWatch(getWatchlist());
    setConfig(getSignalConfig());
  }, []);

  const symbolsParam = watch.map((w) => `${w.market}:${w.code}`).join(",");
  const quoteRes = useFetch<{ quotes: Quote[] }>(
    watch.length ? `/api/quote?symbols=${symbolsParam}` : null,
    { pollMs: 15000 },
  );
  const quoteMap = useMemo(() => {
    const m = new Map<string, Quote>();
    quoteRes.data?.quotes?.forEach((q) => m.set(`${q.market}:${q.code}`, q));
    return m;
  }, [quoteRes.data]);

  // 迷你走势图：观察池变化时各拉一段近 20 日收盘价，仅用于形状感知，无需跟随行情轮询
  useEffect(() => {
    if (watch.length === 0) {
      setSparkMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        watch.map(async (w) => {
          const res = await fetch(
            `/api/kline?market=${w.market}&code=${encodeURIComponent(w.code)}&period=1d&limit=20`,
          ).catch(() => null);
          if (!res || !res.ok) return null;
          const json = await res.json().catch(() => null);
          const closes = (json?.candles ?? []).map(
            (c: { close: number }) => c.close,
          );
          return [`${w.market}:${w.code}`, closes] as const;
        }),
      );
      if (cancelled) return;
      const m = new Map<string, number[]>();
      entries.forEach((e) => {
        if (e && e[1]?.length > 1) m.set(e[0], e[1]);
      });
      setSparkMap(m);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsParam]);

  const add = (it: {
    market: WatchItem["market"];
    code: string;
    name: string;
  }) => setWatch(addWatch(it));
  const remove = (m: WatchItem["market"], c: string) =>
    setWatch(removeWatch(m, c));

  const updateCfg = (key: keyof SignalConfig, value: number) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    saveSignalConfig(next);
  };

  const resetCfg = () => {
    setConfig(DEFAULT_SIGNAL_CONFIG);
    saveSignalConfig(DEFAULT_SIGNAL_CONFIG);
  };

  const evaluate = async () => {
    if (watch.length === 0) return;
    setEvaluating(true);
    setEvalErr(null);
    setSignals(null);
    setLevelFilter("all");
    const res = await fetch("/api/signals/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: watch.map((w) => ({
          market: w.market,
          code: w.code,
          name: w.name,
        })),
        config,
      }),
    }).catch(() => null);
    setEvaluating(false);
    if (!res || !res.ok) {
      setEvalErr("信号评估失败，请稍后重试");
      return;
    }
    const data = await res.json();
    setSignals(data.signals ?? []);
    setEvaluatedAt(Date.now());
  };

  const levelCounts = useMemo(() => {
    const c: Record<SignalLevel, number> = { bullish: 0, bearish: 0, warn: 0, info: 0 };
    signals?.forEach((s) => c[s.level]++);
    return c;
  }, [signals]);

  const filteredSignals = useMemo(() => {
    if (!signals) return null;
    if (levelFilter === "all") return signals;
    return signals.filter((s) => s.level === levelFilter);
  }, [signals, levelFilter]);

  // 按标的分组，并把风险/看空类信号较多的标的排到前面，方便优先关注
  const groupedSignals = useMemo(() => {
    if (!filteredSignals) return [];
    const map = new Map<
      string,
      { code: string; market: Market; name?: string; items: Signal[] }
    >();
    filteredSignals.forEach((s) => {
      const key = `${s.market}:${s.code}`;
      if (!map.has(key)) map.set(key, { code: s.code, market: s.market, name: s.name, items: [] });
      map.get(key)!.items.push(s);
    });
    const groups = Array.from(map.values()).map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level]),
    }));
    groups.sort(
      (a, b) =>
        Math.min(...a.items.map((i) => LEVEL_PRIORITY[i.level])) -
        Math.min(...b.items.map((i) => LEVEL_PRIORITY[i.level])),
    );
    return groups;
  }, [filteredSignals]);

  const aiPrompt =
    signals && signals.length
      ? `我的观察池触发了以下信号：${signals.map((s) => `${s.name ?? s.code}「${s.title}」`).join("；")}。请解读这些信号的含义、可能的市场逻辑与应对思路。`
      : "";

  return (
    <div className="animate-rise space-y-6">
      <SectionTitle
        kicker="Watchlist · Signals"
        title="智能观察池 + 信号提醒"
        desc="自选标的实时盯盘，按需评估异动、突破、放量、均线金叉/死叉、RSI、回撤等信号，并由 AI 解读。"
      />

      <AddSymbol onAdd={add} />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* 观察池表格 */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">
              我的观察池
            </h3>
            <span className="text-[11px] text-faint">
              {watch.length} 个标的 · 15s 刷新
            </span>
          </div>
          {watch.length === 0 ? (
            <EmptyPanel
              title="观察池为空"
              desc="使用上方搜索框添加你关注的股票或加密货币"
            />
          ) : (
            <div className="space-y-0.5">
              {watch.map((w) => {
                const q = quoteMap.get(`${w.market}:${w.code}`);
                return (
                  <div
                    key={`${w.market}-${w.code}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-primary/5"
                  >
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MARKET_BADGE[w.market]}`}
                    >
                      {MARKET_LABEL[w.market]}
                    </span>
                    <Link
                      href={`/stock/${w.market}/${w.code}`}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-sm font-semibold text-ink hover:text-primary">
                        {w.name}
                      </p>
                      <p className="tnum text-[11px] text-faint">{w.code}</p>
                    </Link>
                    <span className="hidden shrink-0 sm:block">
                      {(() => {
                        const spark = sparkMap.get(`${w.market}:${w.code}`);
                        if (!spark) {
                          return <span className="block h-6 w-[60px]" />;
                        }
                        const up = spark[spark.length - 1] >= spark[0];
                        return (
                          <Sparkline
                            points={spark}
                            className={up ? "text-up" : "text-down"}
                          />
                        );
                      })()}
                    </span>
                    <span className="tnum text-sm font-semibold text-ink">
                      {q ? fmtNum(q.price) : "--"}
                    </span>
                    <span
                      className={`tnum w-16 text-right text-sm font-bold ${changeClass(q?.changePct)}`}
                    >
                      {q ? fmtPct(q.changePct) : "--"}
                    </span>
                    <button
                      onClick={() => remove(w.market, w.code)}
                      className="text-faint hover:text-up cursor-pointer"
                      aria-label="移除"
                    >
                      <IconClose width={15} height={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {quoteRes.error && (
            <p className="mt-2 text-xs text-up">{quoteRes.error}</p>
          )}
        </GlassCard>

        {/* 信号配置 */}
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">
              信号规则
            </h3>
            <button
              onClick={resetCfg}
              className="flex items-center gap-1 text-[11px] text-faint transition hover:text-primary cursor-pointer"
            >
              <IconRefresh width={12} height={12} /> 重置默认
            </button>
          </div>
          <p className="mb-3 text-[11px] text-faint">
            作用于当前 {watch.length} 个自选标的，评估时按下方阈值实时计算。
          </p>
          <div className="space-y-4">
            {CFG_FIELDS.map((f) => (
              <div key={f.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted">
                    {f.label}
                    <InfoTip term={f.infoTerm} label={f.label} />
                  </span>
                  <span className="tnum font-semibold text-primary">
                    {config[f.key]}
                  </span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={config[f.key]}
                  onChange={(e) => updateCfg(f.key, Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="mt-1 text-right text-[10px] text-faint">
                  {f.hint(config[f.key])}
                </div>
              </div>
            ))}
            <p className="flex flex-wrap items-center gap-1 text-[11px] text-faint">
              <span>同时评估：均线</span>
              <span className="inline-flex items-center gap-0.5">
                金叉<InfoTip term="金叉" />
              </span>
              <span>/</span>
              <span className="inline-flex items-center gap-0.5">
                死叉<InfoTip term="死叉" />
              </span>
              <span>、RSI</span>
              <span className="inline-flex items-center gap-0.5">
                超买<InfoTip term="超买" />
              </span>
              <span>/</span>
              <span className="inline-flex items-center gap-0.5">
                超卖<InfoTip term="超卖" />
              </span>
              <span>
                （默认 {config.rsiHigh}/{config.rsiLow}）。
              </span>
            </p>
            <button
              onClick={evaluate}
              disabled={evaluating || watch.length === 0}
              className="btn-neon w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {evaluating ? (
                <span className="animate-spin-slow">
                  <IconBolt width={16} height={16} />
                </span>
              ) : (
                <IconBolt width={16} height={16} />
              )}
              {evaluating ? "评估中…" : "评估信号"}
            </button>
          </div>
        </GlassCard>
      </div>

      {/* 信号结果 */}
      {(evaluating || signals || evalErr) && (
        <GlassCard className="p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-bold text-ink">
                触发的信号
              </h3>
              {signals && evaluatedAt && (
                <span className="text-[11px] text-faint">
                  评估于{" "}
                  {new Date(evaluatedAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              )}
            </div>
            {signals && signals.length > 0 && (
              <Link
                href={`/assistant?q=${encodeURIComponent(aiPrompt)}`}
                className="btn-ghost text-xs"
              >
                <IconSpark width={14} height={14} /> AI 解读这些信号{" "}
                <IconArrow width={13} height={13} />
              </Link>
            )}
          </div>
          {evaluating && (
            <LoadingPanel rows={3} label="正在基于历史数据评估…" />
          )}
          {evalErr && <ErrorPanel detail={evalErr} onRetry={evaluate} />}
          {signals && signals.length === 0 && !evaluating && (
            <p className="px-2 py-6 text-center text-sm text-muted">
              当前观察池未触发任何信号
            </p>
          )}
          {signals && signals.length > 0 && (
            <>
              <div className="mb-4 mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setLevelFilter("all")}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                    levelFilter === "all"
                      ? "bg-primary text-white"
                      : "bg-primary/5 text-muted hover:bg-primary/10"
                  }`}
                >
                  全部 {signals.length}
                </button>
                {(["warn", "bearish", "bullish", "info"] as SignalLevel[]).map((lv) => {
                  const count = levelCounts[lv];
                  if (count === 0) return null;
                  const active = levelFilter === lv;
                  return (
                    <button
                      key={lv}
                      onClick={() => setLevelFilter(lv)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                        active ? LEVEL_TAB_STYLE[lv] + " ring-1 ring-current" : "bg-primary/5 text-muted hover:bg-primary/10"
                      }`}
                    >
                      {LEVEL_LABEL[lv]} {count}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3">
                {groupedSignals.map((g) => {
                  const q = quoteMap.get(`${g.market}:${g.code}`);
                  return (
                    <div
                      key={`${g.market}-${g.code}`}
                      className="rounded-xl border border-line/60 p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MARKET_BADGE[g.market]}`}
                        >
                          {MARKET_LABEL[g.market]}
                        </span>
                        <button
                          onClick={() => router.push(`/stock/${g.market}/${g.code}`)}
                          className="text-sm font-bold text-ink hover:text-primary cursor-pointer"
                        >
                          {g.name ?? g.code}
                        </button>
                        <span className="text-[11px] text-faint">{g.code}</span>
                        {q && (
                          <span className={`tnum text-xs font-semibold ${changeClass(q.changePct)}`}>
                            {fmtPct(q.changePct)}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-faint">
                          {g.items.length} 条信号
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {g.items.map((s, i) => {
                          const Icon = getSignalIcon(s);
                          return (
                            // 用 div 承载跳转（而非 <Link> 包裹一切），避免和内部 InfoTip 的「?」按钮形成嵌套可交互元素
                            <div
                              key={i}
                              role="link"
                              tabIndex={0}
                              onClick={() => router.push(`/stock/${s.market}/${s.code}`)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  router.push(`/stock/${s.market}/${s.code}`);
                              }}
                              className={`rounded-lg border px-3 py-2 transition hover:-translate-y-0.5 cursor-pointer ${LEVEL_STYLE[s.level]}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                                  <Icon width={13} height={13} className="shrink-0" />
                                  <span className="truncate">{s.title}</span>
                                  {SIGNAL_TERM[s.type] && <InfoTip term={SIGNAL_TERM[s.type]} />}
                                </span>
                                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold opacity-80">
                                  {LEVEL_LABEL[s.level]}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs opacity-80">{s.detail}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </GlassCard>
      )}
    </div>
  );
}
