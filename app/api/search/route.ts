import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/datasource/symbol";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [] });
  try {
    const items = await searchSymbols(q);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: "搜索服务暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
