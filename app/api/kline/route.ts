import { NextRequest, NextResponse } from "next/server";
import { getKlineFor } from "@/lib/datasource";
import { computeIndicators } from "@/lib/indicators";
import type { KlinePeriod, Market } from "@/types/finsight";

const PERIODS: KlinePeriod[] = ["1d", "1w", "1M", "60m", "30m", "15m", "5m"];

// /api/kline?market=CN&code=600000&period=1d&limit=240&indicators=1
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = sp.get("market")?.toUpperCase() as Market | undefined;
  const code = sp.get("code")?.trim();
  const period = (sp.get("period") as KlinePeriod) || "1d";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 240, 10), 800);
  const wantIndicators = sp.get("indicators") === "1";

  if (!market || !code || !["CN", "HK", "US", "CRYPTO"].includes(market)) {
    return NextResponse.json({ error: "缺少或非法的 market/code 参数" }, { status: 400 });
  }
  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: "非法的 period 参数" }, { status: 400 });
  }

  try {
    const { candles, secid } = await getKlineFor(market, code, period, limit);
    if (candles.length === 0) {
      return NextResponse.json(
        { error: "未获取到 K 线数据", detail: "标的不存在或上游无数据" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      market,
      code,
      secid,
      period,
      candles,
      indicators: wantIndicators ? computeIndicators(candles) : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "K线接口暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
