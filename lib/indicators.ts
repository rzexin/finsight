import type { Candle } from "@/types/finsight";

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (prev == null) {
      // 用前 period 个的均值作为种子
      if (i >= period - 1) {
        const seed = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        prev = seed;
        out.push(seed);
      } else {
        out.push(null);
      }
    } else {
      prev = values[i] * k + prev * (1 - k);
      out.push(prev);
    }
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
      } else {
        out.push(null);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const dif = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );
  const difClean = dif.map((v) => v ?? 0);
  const dea = ema(difClean, signal);
  const hist = dif.map((v, i) =>
    v != null && dea[i] != null ? (v - (dea[i] as number)) * 2 : null
  );
  return { dif, dea, hist };
}

export function boll(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i >= period - 1 && mid[i] != null) {
      const slice = values.slice(i - period + 1, i + 1);
      const m = mid[i] as number;
      const variance = slice.reduce((a, b) => a + (b - m) ** 2, 0) / period;
      const sd = Math.sqrt(variance);
      upper.push(m + mult * sd);
      lower.push(m - mult * sd);
    } else {
      upper.push(null);
      lower.push(null);
    }
  }
  return { mid, upper, lower };
}

export function kdj(candles: Candle[], period = 9) {
  const k: (number | null)[] = [];
  const d: (number | null)[] = [];
  const j: (number | null)[] = [];
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      k.push(null);
      d.push(null);
      j.push(null);
      continue;
    }
    const slice = candles.slice(i - period + 1, i + 1);
    const low = Math.min(...slice.map((c) => c.low));
    const high = Math.max(...slice.map((c) => c.high));
    const rsv = high === low ? 0 : ((candles[i].close - low) / (high - low)) * 100;
    const curK = (2 / 3) * prevK + (1 / 3) * rsv;
    const curD = (2 / 3) * prevD + (1 / 3) * curK;
    k.push(curK);
    d.push(curD);
    j.push(3 * curK - 2 * curD);
    prevK = curK;
    prevD = curD;
  }
  return { k, d, j };
}

export interface IndicatorBundle {
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma60: (number | null)[];
  rsi14: (number | null)[];
  macd: ReturnType<typeof macd>;
  boll: ReturnType<typeof boll>;
  kdj: ReturnType<typeof kdj>;
}

export function computeIndicators(candles: Candle[]): IndicatorBundle {
  const close = candles.map((c) => c.close);
  return {
    ma5: sma(close, 5),
    ma10: sma(close, 10),
    ma20: sma(close, 20),
    ma60: sma(close, 60),
    rsi14: rsi(close, 14),
    macd: macd(close),
    boll: boll(close, 20, 2),
    kdj: kdj(candles, 9),
  };
}
