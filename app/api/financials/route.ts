import { NextRequest, NextResponse } from "next/server";
import { getFinancials } from "@/lib/datasource/eastmoney";
import { resolveSecid } from "@/lib/datasource/symbol";
import type { Market } from "@/types/finsight";

// /api/financials?market=CN&code=600000
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const market = sp.get("market")?.toUpperCase() as Market | undefined;
  const code = sp.get("code")?.trim();

  if (!market || !code) {
    return NextResponse.json({ error: "缺少 market/code 参数" }, { status: 400 });
  }
  if (market === "CRYPTO") {
    return NextResponse.json(
      { error: "加密货币暂无财务数据", detail: "加密资产无财报口径" },
      { status: 400 }
    );
  }
  try {
    const secid = await resolveSecid(market, code);
    if (!secid) {
      return NextResponse.json({ error: "无法解析该标的" }, { status: 404 });
    }
    const metrics = await getFinancials(secid);
    return NextResponse.json({ market, code, secid, metrics, updatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: "财务数据接口暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
