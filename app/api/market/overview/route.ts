import { NextResponse } from "next/server";
import { getIndices, getRankList } from "@/lib/datasource/eastmoney";
import { getCryptoOverview } from "@/lib/datasource/crypto";
import { swrCache, peekCache } from "@/lib/cache";
import type { MarketOverview, RankItem } from "@/types/finsight";

// 始终执行 handler，由进程内 SWR 缓存控制对上游的真实请求频率。
export const dynamic = "force-dynamic";

// 新鲜期：略短于前端 30s 轮询间隔，保证轮询多数命中缓存，
// 过期后由后台刷新，用户始终拿到「上一次成功」的即时结果。
const FRESH_MS = 15_000;

const CACHE_KEY = "market:overview";

/**
 * 港股/美股涨跌幅榜天然被权证、认股权证、极低价「仙股」占据（这些标的没有涨跌停限制，
 * 单日 50%+ 波动很常见但对普通用户毫无展示价值），过滤掉以提升榜单可读性。
 */
function isJunkMover(item: RankItem): boolean {
  if (item.price > 0 && item.price < 0.5) return true;
  // 东财对权证/认股权证/待发行股份的中文名会保留英文后缀（Wt/Rt/WI 等），比猜代码后缀更可靠。
  if (/\b(Wt|Rt|WI|Warrant)\b/i.test(item.name)) return true;
  return false;
}

/** 涨幅榜 + 跌幅榜按 code 去重合并，供按市场展示个股的场景使用（如首页星图）。 */
function mergeUnique(...lists: RankItem[][]): RankItem[] {
  const seen = new Set<string>();
  const out: RankItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!item.code || seen.has(item.code) || isJunkMover(item)) continue;
      seen.add(item.code);
      out.push(item);
    }
  }
  return out;
}

async function buildOverview(): Promise<MarketOverview> {
  const [indices, gainers, losers, active, cryptoR, hkGainers, hkLosers, usGainers, usLosers] =
    await Promise.allSettled([
      getIndices(),
      getRankList("gainers", 10),
      getRankList("losers", 10),
      getRankList("active", 10),
      getCryptoOverview(10),
      getRankList("gainers", 12, "HK"),
      getRankList("losers", 12, "HK"),
      getRankList("gainers", 12, "US"),
      getRankList("losers", 12, "US"),
    ]);

  const settled = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === "fulfilled" ? r.value : []);

  // 各上游相互独立限流/抖动是常态（典型如 CoinGecko 免费额度被打到 429），
  // 不能因为某一个字段这一轮恰好抓空，就用空数组覆盖掉它上一轮抓到的好数据——
  // 那样会让「其它市场都正常、只有加密突然消失」这种体验 bug 复现。
  // 因此按字段取「这一轮结果」与「上一次缓存」中较好（非空）的那个。
  const prev = peekCache<MarketOverview>(CACHE_KEY);
  const preferFresh = <T,>(fresh: T[], stale: T[] | undefined): T[] =>
    fresh.length > 0 ? fresh : (stale ?? []);

  const overview: MarketOverview = {
    indices: preferFresh(settled(indices), prev?.indices),
    gainers: preferFresh(settled(gainers), prev?.gainers),
    losers: preferFresh(settled(losers), prev?.losers),
    active: preferFresh(settled(active), prev?.active),
    crypto: preferFresh(settled(cryptoR), prev?.crypto),
    hkStocks: preferFresh(mergeUnique(settled(hkGainers), settled(hkLosers)), prev?.hkStocks),
    usStocks: preferFresh(mergeUnique(settled(usGainers), settled(usLosers)), prev?.usStocks),
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
