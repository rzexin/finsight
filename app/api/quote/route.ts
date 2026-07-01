import { NextRequest, NextResponse } from "next/server";
import { getQuotesMixed } from "@/lib/datasource";
import { parseSymbolToken, type SymbolRef } from "@/types/finsight";

// /api/quote?symbols=CN:600000,HK:00700,US:AAPL,CRYPTO:BTC
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "缺少 symbols 参数" }, { status: 400 });
  }
  const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 50);
  const refs: SymbolRef[] = [];
  for (const t of tokens) {
    const parsed = parseSymbolToken(t);
    if (parsed) refs.push({ ...parsed, name: parsed.code });
  }
  if (refs.length === 0) {
    return NextResponse.json({ error: "symbols 参数格式错误" }, { status: 400 });
  }
  try {
    const quotes = await getQuotesMixed(refs);
    if (quotes.length === 0) {
      return NextResponse.json(
        { error: "未获取到行情数据", detail: "上游接口无返回或标的不存在" },
        { status: 502 }
      );
    }
    return NextResponse.json({ quotes, updatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: "行情接口暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
