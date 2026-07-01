import { NextRequest, NextResponse } from "next/server";
import { getKlineFor } from "@/lib/datasource";
import { computeIndicators } from "@/lib/indicators";
import type { KlinePeriod, Market } from "@/types/finsight";

// /api/indicators?market=CN&code=600000&period=1d
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = sp.get("market")?.toUpperCase() as Market | undefined;
  const code = sp.get("code")?.trim();
  const period = (sp.get("period") as KlinePeriod) || "1d";

  if (!market || !code) {
    return NextResponse.json({ error: "缺少 market/code 参数" }, { status: 400 });
  }
  try {
    const { candles } = await getKlineFor(market, code, period, 250);
    if (candles.length === 0) {
      return NextResponse.json({ error: "未获取到 K 线数据" }, { status: 502 });
    }
    const ind = computeIndicators(candles);
    const last = candles.length - 1;
    const pick = (a: (number | null)[]) => a[last];
    const summary = {
      close: candles[last].close,
      ma5: pick(ind.ma5),
      ma10: pick(ind.ma10),
      ma20: pick(ind.ma20),
      ma60: pick(ind.ma60),
      rsi14: pick(ind.rsi14),
      macd: { dif: pick(ind.macd.dif), dea: pick(ind.macd.dea), hist: pick(ind.macd.hist) },
      kdj: { k: pick(ind.kdj.k), d: pick(ind.kdj.d), j: pick(ind.kdj.j) },
      boll: { upper: pick(ind.boll.upper), mid: pick(ind.boll.mid), lower: pick(ind.boll.lower) },
    };
    return NextResponse.json({ market, code, period, summary });
  } catch (err) {
    return NextResponse.json(
      { error: "指标接口暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
