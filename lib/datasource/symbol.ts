import { fetchJson, EM_HEADERS } from "@/lib/http";
import { swrCache } from "@/lib/cache";
import type { Market, SymbolRef } from "@/types/finsight";

/** 从 secid 前缀判断市场 */
export function marketFromSecid(secid: string): Market | null {
  const prefix = secid.split(".")[0];
  if (prefix === "0" || prefix === "1") return "CN";
  if (prefix === "116" || prefix === "128") return "HK";
  if (prefix === "105" || prefix === "106" || prefix === "107") return "US";
  return null;
}

/** A股/港股 可由代码确定 secid；美股需联网解析 */
export function buildSecid(market: Market, code: string): string | null {
  const c = code.toUpperCase();
  if (market === "CN") {
    if (/^(5|6|9|11|68|110|113|118|15)/.test(c)) return `1.${c}`;
    return `0.${c}`;
  }
  if (market === "HK") {
    return `116.${c.padStart(5, "0")}`;
  }
  return null; // US 需解析
}

const secidCache = new Map<string, string>();

interface SuggestResp {
  QuotationCodeTable?: {
    Data?: Array<{
      Code: string;
      Name: string;
      QuoteID: string;
      Classify?: string;
      SecurityTypeName?: string;
    }>;
  };
}

async function emSuggest(input: string): Promise<SymbolRef[]> {
  const url =
    `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(input)}` +
    `&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=12`;
  const data = await fetchJson<SuggestResp>(url, { headers: EM_HEADERS, retries: 1 });
  const rows = data.QuotationCodeTable?.Data ?? [];
  const out: SymbolRef[] = [];
  for (const r of rows) {
    if (!r.QuoteID) continue;
    const market = marketFromSecid(r.QuoteID);
    if (!market) continue; // 仅保留 A/港/美 个股，跳过指数/基金/板块
    out.push({ code: r.Code, market, name: r.Name, secid: r.QuoteID, extra: r.SecurityTypeName });
  }
  return out;
}

/** 解析 secid（美股等需联网）；带内存缓存 */
export async function resolveSecid(market: Market, code: string): Promise<string | null> {
  const direct = buildSecid(market, code);
  if (direct) return direct;
  const key = `${market}:${code.toUpperCase()}`;
  if (secidCache.has(key)) return secidCache.get(key)!;
  const list = await emSuggest(code);
  const hit =
    list.find((s) => s.market === market && s.code.toUpperCase() === code.toUpperCase()) ??
    list.find((s) => s.market === market);
  if (hit?.secid) {
    secidCache.set(key, hit.secid);
    return hit.secid;
  }
  return null;
}

// ---------------- 加密货币搜索（CoinGecko） ----------------
interface CgSearchResp {
  coins?: Array<{ id: string; name: string; symbol: string; market_cap_rank?: number }>;
}

async function cryptoSuggest(input: string): Promise<SymbolRef[]> {
  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(input)}`;
  const data = await fetchJson<CgSearchResp>(url, { retries: 1 }).catch(() => null);
  if (!data?.coins) return [];
  return data.coins
    .filter((c) => c.market_cap_rank != null && c.market_cap_rank <= 400)
    .slice(0, 6)
    .map((c) => ({
      code: c.symbol.toUpperCase(),
      market: "CRYPTO" as Market,
      name: c.name,
      extra: c.id,
    }));
}

/** 统一搜索：A股/港股/美股(东财) + 加密(CoinGecko)。结果稳定，新鲜期取 5 分钟。 */
export async function searchSymbols(q: string): Promise<SymbolRef[]> {
  const key = `search:${q.trim().toUpperCase()}`;
  return swrCache(key, () => fetchSymbols(q), {
    freshMs: 300_000,
    shouldCache: (arr) => arr.length > 0,
  });
}

async function fetchSymbols(q: string): Promise<SymbolRef[]> {
  const [eq, cq] = await Promise.allSettled([emSuggest(q), cryptoSuggest(q)]);
  const a = eq.status === "fulfilled" ? eq.value : [];
  const c = cq.status === "fulfilled" ? cq.value : [];

  // 去重（同 market+code）
  const seen = new Set<string>();
  const dedup = (list: SymbolRef[]) =>
    list.filter((s) => {
      const k = `${s.market}:${s.code}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const stocks = dedup(a);
  const cryptos = dedup(c);

  // 代码完全匹配的优先（加密优先于同名个股，避免 BTC 被美股淹没）
  const qu = q.trim().toUpperCase();
  const isExact = (s: SymbolRef) => s.code.toUpperCase() === qu;
  const exact = [...cryptos.filter(isExact), ...stocks.filter(isExact)];
  const restCrypto = cryptos.filter((s) => !isExact(s));
  const restStock = stocks.filter((s) => !isExact(s));

  // 给加密保留前排名额，避免被最多 12 条个股截断
  const merged = [
    ...exact,
    ...restCrypto.slice(0, 3),
    ...restStock,
    ...restCrypto.slice(3),
  ];
  return merged.slice(0, 12);
}
