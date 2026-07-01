import type { Candle } from "@/types/finsight";
import { sma, rsi } from "@/lib/indicators";

export type StrategyId = "ma_cross" | "rsi_reversal" | "breakout";

export interface BacktestParams {
  fast?: number;
  slow?: number;
  rsiPeriod?: number;
  rsiLow?: number;
  rsiHigh?: number;
  window?: number;
}

export interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  ret: number;
}

export interface EquityPoint {
  date: string;
  strategy: number;
  benchmark: number;
}

export interface BacktestResult {
  strategy: StrategyId;
  params: BacktestParams;
  equity: EquityPoint[];
  trades: Trade[];
  metrics: {
    totalReturn: number;
    benchmarkReturn: number;
    annualizedReturn: number;
    maxDrawdown: number;
    winRate: number;
    tradeCount: number;
    sharpe: number;
  };
}

/** 计算每根 K 线的目标仓位（0 或 1），仅做多 */
function positions(candles: Candle[], strategy: StrategyId, p: BacktestParams): number[] {
  const close = candles.map((c) => c.close);
  const n = candles.length;
  const pos = new Array(n).fill(0);

  if (strategy === "ma_cross") {
    const fast = sma(close, p.fast ?? 5);
    const slow = sma(close, p.slow ?? 20);
    for (let i = 0; i < n; i++) {
      if (fast[i] != null && slow[i] != null) {
        pos[i] = (fast[i] as number) > (slow[i] as number) ? 1 : 0;
      }
    }
  } else if (strategy === "rsi_reversal") {
    const r = rsi(close, p.rsiPeriod ?? 14);
    const low = p.rsiLow ?? 30;
    const high = p.rsiHigh ?? 70;
    let holding = 0;
    for (let i = 0; i < n; i++) {
      const v = r[i];
      if (v != null) {
        if (v < low) holding = 1;
        else if (v > high) holding = 0;
      }
      pos[i] = holding;
    }
  } else if (strategy === "breakout") {
    const w = p.window ?? 20;
    for (let i = 0; i < n; i++) {
      if (i < w) continue;
      const prevHigh = Math.max(...close.slice(i - w, i));
      const prevLow = Math.min(...close.slice(i - w, i));
      if (close[i] > prevHigh) pos[i] = 1;
      else if (close[i] < prevLow) pos[i] = 0;
      else pos[i] = pos[i - 1];
    }
  }
  return pos;
}

export function runBacktest(
  candles: Candle[],
  strategy: StrategyId,
  params: BacktestParams = {}
): BacktestResult {
  const n = candles.length;
  const pos = positions(candles, strategy, params);

  let stratEquity = 1;
  let benchEquity = 1;
  const equity: EquityPoint[] = [];
  const stratReturns: number[] = [];
  const trades: Trade[] = [];
  let entryIdx = -1;

  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const r = candles[i].close / candles[i - 1].close - 1;
      benchEquity *= 1 + r;
      // 用前一根的仓位决定本根收益，避免未来函数
      const held = pos[i - 1];
      const sr = held === 1 ? r : 0;
      stratEquity *= 1 + sr;
      stratReturns.push(sr);
    }
    equity.push({
      date: candles[i].date,
      strategy: Number(stratEquity.toFixed(4)),
      benchmark: Number(benchEquity.toFixed(4)),
    });

    // 记录交易
    const prev = i === 0 ? 0 : pos[i - 1];
    if (prev === 0 && pos[i] === 1) entryIdx = i;
    if (prev === 1 && pos[i] === 0 && entryIdx >= 0) {
      const entry = candles[entryIdx];
      const exit = candles[i];
      trades.push({
        entryDate: entry.date,
        entryPrice: entry.close,
        exitDate: exit.date,
        exitPrice: exit.close,
        ret: exit.close / entry.close - 1,
      });
      entryIdx = -1;
    }
  }
  // 末尾仍持仓则平仓
  if (entryIdx >= 0 && entryIdx < n - 1) {
    const entry = candles[entryIdx];
    const exit = candles[n - 1];
    trades.push({
      entryDate: entry.date,
      entryPrice: entry.close,
      exitDate: exit.date,
      exitPrice: exit.close,
      ret: exit.close / entry.close - 1,
    });
  }

  // 指标
  let peak = -Infinity;
  let maxDd = 0;
  for (const pt of equity) {
    peak = Math.max(peak, pt.strategy);
    maxDd = Math.min(maxDd, pt.strategy / peak - 1);
  }
  const days = Math.max(n, 1);
  const totalReturn = stratEquity - 1;
  const annualized = Math.pow(stratEquity, 252 / days) - 1;
  const wins = trades.filter((t) => t.ret > 0).length;
  const winRate = trades.length ? wins / trades.length : 0;
  const mean = stratReturns.reduce((a, b) => a + b, 0) / (stratReturns.length || 1);
  const variance =
    stratReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (stratReturns.length || 1);
  const sd = Math.sqrt(variance);
  const sharpe = sd === 0 ? 0 : (mean / sd) * Math.sqrt(252);

  return {
    strategy,
    params,
    equity,
    trades,
    metrics: {
      totalReturn,
      benchmarkReturn: benchEquity - 1,
      annualizedReturn: annualized,
      maxDrawdown: maxDd,
      winRate,
      tradeCount: trades.length,
      sharpe,
    },
  };
}
