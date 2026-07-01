import { NextRequest, NextResponse } from "next/server";
import { getKuaixun, getStockNews } from "@/lib/datasource/eastmoney";

// /api/news            -> 7x24 快讯
// /api/news?keyword=贵州茅台  -> 个股/主题资讯
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const keyword = sp.get("keyword")?.trim();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 5), 60);

  try {
    const items = keyword ? await getStockNews(keyword, limit) : await getKuaixun(limit);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "暂无资讯", detail: "上游接口无返回" },
        { status: 502 }
      );
    }
    return NextResponse.json({ items, keyword: keyword ?? null, updatedAt: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: "资讯接口暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
