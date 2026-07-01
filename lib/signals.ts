import type { Candle, Market } from "@/types/finsight";
import { computeIndicators } from "@/lib/indicators";

export interface SignalConfig {
  changePct: number; // 异动阈值（%）
  breakoutWindow: number; // 突破/回撤窗口（日）
  volMultiple: number; // 放量倍数
  drawdownPct: number; // 回撤预警阈值（%）
  rsiHigh: number;
  rsiLow: number;
}

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
  changePct: 5,
  breakoutWindow: 20,
  volMultiple: 2,
  drawdownPct: 10,
  rsiHigh: 70,
  rsiLow: 30,
};

export type SignalLevel = "bullish" | "bearish" | "warn" | "info";

export interface Signal {
  code: string;
  market: Market;
  name?: string;
  type: string;
  level: SignalLevel;
  title: string;
  detail: string;
}

export function evaluateSignals(
  ctx: { code: string; market: Market; name?: string; candles: Candle[] },
  config: SignalConfig
): Signal[] {
  const { candles } = ctx;
  const out: Signal[] = [];
  if (candles.length < 5) return out;
  const meta = { code: ctx.code, market: ctx.market, name: ctx.name };

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const dayPct = ((last.close - prev.close) / prev.close) * 100;

  // 异动
  if (Math.abs(dayPct) >= config.changePct) {
    out.push({
      ...meta,
      type: "abnormal",
      level: dayPct > 0 ? "bullish" : "bearish",
      title: dayPct > 0 ? "放量异动·大涨" : "异动·大跌",
      detail: `最新涨跌幅 ${dayPct.toFixed(2)}%，超过阈值 ±${config.changePct}%`,
    });
  }

  // 突破 / 回撤
  const w = Math.min(config.breakoutWindow, candles.length - 1);
  const window = candles.slice(-w - 1, -1);
  const hi = Math.max(...window.map((c) => c.high));
  const lo = Math.min(...window.map((c) => c.low));
  if (last.close > hi) {
    out.push({ ...meta, type: "breakout_up", level: "bullish", title: `向上突破 ${w} 日新高`, detail: `现价 ${last.close} 突破前 ${w} 日高点 ${hi.toFixed(2)}` });
  } else if (last.close < lo) {
    out.push({ ...meta, type: "breakout_down", level: "bearish", title: `跌破 ${w} 日新低`, detail: `现价 ${last.close} 跌破前 ${w} 日低点 ${lo.toFixed(2)}` });
  }

  const recentHigh = Math.max(...candles.slice(-w - 1).map((c) => c.high));
  const dd = ((last.close - recentHigh) / recentHigh) * 100;
  if (dd <= -config.drawdownPct) {
    out.push({ ...meta, type: "drawdown", level: "warn", title: "高位回撤预警", detail: `较 ${w} 日高点回撤 ${dd.toFixed(2)}%` });
  }

  // 放量
  const volWindow = candles.slice(-config.breakoutWindow - 1, -1);
  const avgVol = volWindow.reduce((a, c) => a + c.volume, 0) / (volWindow.length || 1);
  if (avgVol > 0 && last.volume >= avgVol * config.volMultiple) {
    out.push({ ...meta, type: "volume_spike", level: "info", title: "放量", detail: `成交量为近期均量的 ${(last.volume / avgVol).toFixed(1)} 倍` });
  }

  // 均线金叉 / 死叉 & RSI
  const ind = computeIndicators(candles);
  const i = candles.length - 1;
  const ma5 = ind.ma5[i], ma20 = ind.ma20[i], pMa5 = ind.ma5[i - 1], pMa20 = ind.ma20[i - 1];
  if (ma5 != null && ma20 != null && pMa5 != null && pMa20 != null) {
    if (pMa5 <= pMa20 && ma5 > ma20) out.push({ ...meta, type: "golden_cross", level: "bullish", title: "MA5 上穿 MA20·金叉", detail: "短期均线上穿中期均线，趋势转强信号" });
    if (pMa5 >= pMa20 && ma5 < ma20) out.push({ ...meta, type: "death_cross", level: "bearish", title: "MA5 下穿 MA20·死叉", detail: "短期均线下穿中期均线，趋势转弱信号" });
  }
  const rsi = ind.rsi14[i];
  if (rsi != null) {
    if (rsi >= config.rsiHigh) out.push({ ...meta, type: "rsi_high", level: "warn", title: "RSI 超买", detail: `RSI(14) = ${rsi.toFixed(1)}，进入超买区` });
    if (rsi <= config.rsiLow) out.push({ ...meta, type: "rsi_low", level: "info", title: "RSI 超卖", detail: `RSI(14) = ${rsi.toFixed(1)}，进入超卖区` });
  }

  return out;
}
