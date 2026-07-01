import { NextResponse } from "next/server";
import { getIndices, getRankList } from "@/lib/datasource/eastmoney";
import { getCryptoOverview } from "@/lib/datasource/crypto";
import { swrCache } from "@/lib/cache";
import type { MarketOverview } from "@/types/finsight";

// 始终执行 handler，由进程内 SWR 缓存控制对上游的真实请求频率。
export const dynamic = "force-dynamic";

// 新鲜期：略短于前端 30s 轮询间隔，保证轮询多数命中缓存，
// 过期后由后台刷新，用户始终拿到「上一次成功」的即时结果。
const FRESH_MS = 15_000;

const CACHE_KEY = "market:overview";

async function buildOverview(): Promise<MarketOverview> {
  const [indices, gainers, losers, active, cryptoR] = await Promise.allSettled([
    getIndices(),
    getRankList("gainers", 10),
    getRankList("losers", 10),
    getRankList("active", 10),
    getCryptoOverview(10),
  ]);

  const overview: MarketOverview = {
    indices: indices.status === "fulfilled" ? indices.value : [],
    gainers: gainers.status === "fulfilled" ? gainers.value : [],
    losers: losers.status === "fulfilled" ? losers.value : [],
    active: active.status === "fulfilled" ? active.value : [],
    crypto: cryptoR.status === "fulfilled" ? cryptoR.value : [],
    updatedAt: Date.now(),
  };

  const allEmpty =
    overview.indices.length === 0 &&
    overview.gainers.length === 0 &&
    overview.crypto.length === 0;
  // 全空视为本次抓取失败：抛错使其不被写入缓存，从而保留上一次成功的旧值。
  if (allEmpty) throw new Error("所有上游接口均无返回");

  return overview;
}

export async function GET() {
  try {
    const overview = await swrCache(CACHE_KEY, buildOverview, { freshMs: FRESH_MS });
    return NextResponse.json(overview, {
      // 客户端轮询应始终回源到本接口（由服务端 SWR 决定快慢），避免浏览器缓存返回更旧数据。
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "行情概览暂不可用", detail: (err as Error).message },
      { status: 502 }
    );
  }
}
