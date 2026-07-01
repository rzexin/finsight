import { NextRequest, NextResponse } from "next/server";
import { getKlineFor } from "@/lib/datasource";
import { runBacktest, type StrategyId } from "@/lib/backtest";
import type { Market } from "@/types/finsight";

const STRATEGIES: StrategyId[] = ["ma_cross", "rsi_reversal", "breakout"];

// /api/backtest?market=CN&code=600519&strategy=ma_cross&fast=5&slow=20&limit=500
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = sp.get("market")?.toUpperCase() as Market | undefined;
  const code = sp.get("code")?.trim();
  const strategy = (sp.get("strategy") as StrategyId) || "ma_cross";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 500, 60), 800);

  if (!market || !code) {
    return NextResponse.json({ error: "缺少 market/code 参数" }, { status: 400 });
  }
  if (!STRATEGIES.includes(strategy)) {
    return NextResponse.json({ error: "非法的 strategy" }, { status: 400 });
  }

  const params = {
    fast: Number(sp.get("fast")) || undefined,
    slow: Number(sp.get("slow")) || undefined,
    rsiPeriod: Number(sp.get("rsiPeriod")) || undefined,
    rsiLow: Number(sp.get("rsiLow")) || undefined,
    rsiHigh: Number(sp.get("rsiHigh")) || undefined,
    window: Number(sp.get("window")) || undefined,
  };

  try {
    const { candles } = await getKlineFor(market, code, "1d", limit);
    if (candles.length < 30) {
      return NextResponse.json({ error: "历史数据不足以回测" }, { status: 502 });
    }
    const result = runBacktest(candles, strategy, params);
    return NextResponse.json({
      market,
      code,
      range: { from: candles[0].date, to: candles[candles.length - 1].date, bars: candles.length },
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "回测接口暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
