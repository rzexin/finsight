import { fetchJson } from "@/lib/http";
import type { Candle, KlinePeriod, Quote, RankItem } from "@/types/finsight";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

const INTERVAL: Record<KlinePeriod, string> = {
  "1d": "1d",
  "1w": "1w",
  "1M": "1M",
  "60m": "1h",
  "30m": "30m",
  "15m": "15m",
  "5m": "5m",
};

export function toBinanceSymbol(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.endsWith("USDT") || c.endsWith("BUSD") || c.endsWith("USDC")) return c;
  return `${c}USDT`;
}

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  prevClosePrice: string;
  volume: string;
  quoteVolume: string;
}

export async function getCryptoQuotes(codes: string[]): Promise<Quote[]> {
  if (codes.length === 0) return [];
  const symbols = codes.map(toBinanceSymbol);
  const param = JSON.stringify(symbols);
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(param)}`;
  const data = await fetchJson<BinanceTicker[]>(url, { retries: 2 });
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((t) => ({
    code: t.symbol.replace(/USDT$/, ""),
    market: "CRYPTO" as const,
    name: t.symbol.replace(/USDT$/, "") + "/USDT",
    price: num(t.lastPrice),
    change: num(t.priceChange),
    changePct: num(t.priceChangePercent),
    open: num(t.openPrice),
    high: num(t.highPrice),
    low: num(t.lowPrice),
    prevClose: num(t.prevClosePrice),
    volume: num(t.volume),
    turnover: num(t.quoteVolume),
    currency: "USDT",
    ts: Date.now(),
  }));
}

export async function getCryptoKline(
  code: string,
  period: KlinePeriod,
  limit = 240,
): Promise<Candle[]> {
  const symbol = toBinanceSymbol(code);
  const interval = INTERVAL[period];
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const data = await fetchJson<unknown[][]>(url, { retries: 2 });
  return data.map((k) => {
    const ts = Number(k[0]);
    return {
      ts,
      date: new Date(ts).toISOString().slice(0, 10),
      open: num(k[1]),
      high: num(k[2]),
      low: num(k[3]),
      close: num(k[4]),
      volume: num(k[5]),
      turnover: num(k[7]),
    } satisfies Candle;
  });
}

interface CgMarket {
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
}

/** 稳定币：价格锚定 1 美元、几乎无波动，对行情概览无展示价值，予以剔除 */
const STABLECOINS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "FDUSD",
  "USDE",
  "USDS",
  "PYUSD",
  "USDD",
]);

/** 交易所自家平台币/激励代币，成交额虚高但不是普通用户关心的「主流币」，予以剔除 */
const EXCHANGE_JUNK = new Set(["HTX", "HT"]);

async function getCryptoOverviewFromCoinGecko(
  limit: number,
): Promise<RankItem[]> {
  // 多取一些以补足被剔除的稳定币名额
  const perPage = Math.min(50, limit + 12);
  const url =
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc` +
    `&per_page=${perPage}&page=1&price_change_percentage=24h`;
  const data = await fetchJson<CgMarket[]>(url, { retries: 1 });
  return data
    .map((c) => ({
      code: c.symbol.toUpperCase(),
      market: "CRYPTO" as const,
      name: c.name,
      price: num(c.current_price),
      changePct: num(c.price_change_percentage_24h),
    }))
    .filter((c) => !STABLECOINS.has(c.code))
    .slice(0, limit);
}

interface HuobiTicker {
  symbol: string;
  open: number;
  close: number;
  vol: number;
}

/**
 * CoinGecko 免费额度极容易被限流（一个共享出口 IP 被打满后就是长期性的 429，
 * 不是重试几次能解决的），Binance 在国内网络环境下又经常直接连接失败——
 * 火币(HTX)的公开行情接口没有 CoinGecko 那么低的限流阈值，连通性也比 Binance 稳定，
 * 缺点是没有市值排名/币种全名，只能退而求其次按 24h 成交额排序做「主流币」近似。
 */
async function getCryptoOverviewFromHuobi(limit: number): Promise<RankItem[]> {
  const data = await fetchJson<{ status?: string; data?: HuobiTicker[] }>(
    "https://api.huobi.pro/market/tickers",
    { retries: 1 },
  );
  if (data.status !== "ok") throw new Error("火币行情接口返回异常");
  const rows = data.data ?? [];
  const mapped = rows
    .filter((t) => t.symbol?.endsWith("usdt") && t.close > 0 && t.open > 0)
    .map((t) => {
      const code = t.symbol.slice(0, -4).toUpperCase();
      return {
        code,
        market: "CRYPTO" as const,
        name: code,
        price: t.close,
        changePct: ((t.close - t.open) / t.open) * 100,
        turnover: t.vol,
      };
    })
    .filter(
      (c) =>
        !STABLECOINS.has(c.code) &&
        !EXCHANGE_JUNK.has(c.code) &&
        c.price >= 0.0001,
    );

  mapped.sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0));
  return mapped.slice(0, limit).map(({ turnover: _turnover, ...item }) => item);
}

export async function getCryptoOverview(limit = 10): Promise<RankItem[]> {
  try {
    const primary = await getCryptoOverviewFromCoinGecko(limit);
    if (primary.length > 0) return primary;
  } catch {
    // CoinGecko 挂了（常见于被限流）就直接落到火币兜底，不在这里重复重试浪费时间。
  }
  return getCryptoOverviewFromHuobi(limit).catch(() => []);
}
