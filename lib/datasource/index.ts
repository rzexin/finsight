import * as em from "@/lib/datasource/eastmoney";
import * as crypto from "@/lib/datasource/crypto";
import * as tencent from "@/lib/datasource/tencent";
import { resolveSecid } from "@/lib/datasource/symbol";
import { swrCache } from "@/lib/cache";
import type { Candle, KlinePeriod, Quote, SymbolRef } from "@/types/finsight";

// 归一化 market:code 用于匹配（港股 00700 与 700 视为同一标的）
const normKey = (market: string, code: string) =>
  `${market}:${code.toUpperCase().replace(/^0+(?=\d)/, "")}`;

/**
 * 混合市场批量报价：加密走 Binance，其余优先东方财富、失败/不全时降级腾讯财经。
 * 行情实时性较高，新鲜期取 8s（短于前端轮询间隔），过期由后台刷新、调用方秒回旧值。
 */
export async function getQuotesMixed(refs: SymbolRef[]): Promise<Quote[]> {
  if (refs.length === 0) return [];
  const key = "quotes:" + refs.map((r) => normKey(r.market, r.code)).sort().join(",");
  return swrCache(key, () => fetchQuotesMixed(refs), {
    freshMs: 8_000,
    shouldCache: (arr) => arr.length > 0,
  });
}

async function fetchQuotesMixed(refs: SymbolRef[]): Promise<Quote[]> {
  const cryptoRefs = refs.filter((r) => r.market === "CRYPTO");
  const otherRefs = refs.filter((r) => r.market !== "CRYPTO");
  const [c, o] = await Promise.allSettled([
    crypto.getCryptoQuotes(cryptoRefs.map((r) => r.code)),
    em.getQuotes(otherRefs),
  ]);
  const out: Quote[] = [];
  if (c.status === "fulfilled") out.push(...c.value);

  let others = o.status === "fulfilled" ? o.value : [];
  // 东财失败或返回不全时，用腾讯财经补齐缺失标的
  if (otherRefs.length > 0 && others.length < otherRefs.length) {
    const got = new Set(others.map((q) => normKey(q.market, q.code)));
    const missing = otherRefs.filter((r) => !got.has(normKey(r.market, r.code)));
    if (missing.length > 0) {
      const tx = await tencent.getTencentQuotes(missing).catch(() => [] as Quote[]);
      others = [...others, ...tx];
    }
  }
  out.push(...others);
  return out;
}

/**
 * 历史 K 线。K 线（尤其历史段）变化缓慢，新鲜期取 60s；
 * 空结果（标的临时无数据/上游失败）不写缓存，保留上一次的有效数据。
 */
export async function getKlineFor(
  market: SymbolRef["market"],
  code: string,
  period: KlinePeriod,
  limit = 240,
  secid?: string
): Promise<{ candles: Candle[]; secid?: string }> {
  const key = `kline:${market}:${code.toUpperCase()}:${period}:${limit}`;
  return swrCache(key, () => fetchKlineFor(market, code, period, limit, secid), {
    freshMs: 60_000,
    shouldCache: (r) => r.candles.length > 0,
  });
}

async function fetchKlineFor(
  market: SymbolRef["market"],
  code: string,
  period: KlinePeriod,
  limit = 240,
  secid?: string
): Promise<{ candles: Candle[]; secid?: string }> {
  if (market === "CRYPTO") {
    return { candles: await crypto.getCryptoKline(code, period, limit) };
  }
  const sid = secid ?? (await resolveSecid(market, code));
  if (!sid) return { candles: [] };
  // 优先东方财富，失败或空数据时降级腾讯财经
  let candles = await em.getKline(sid, period, limit).catch(() => [] as Candle[]);
  if (candles.length === 0) {
    candles = await tencent.getTencentKline(sid, period, limit).catch(() => [] as Candle[]);
  }
  return { candles, secid: sid };
}
