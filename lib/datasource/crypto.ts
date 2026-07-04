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

async function getCryptoQuotesFromBinance(codes: string[]): Promise<Quote[]> {
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

async function getCryptoQuotesFromHuobi(codes: string[]): Promise<Quote[]> {
  const data = await fetchJson<{ status?: string; data?: HuobiTicker[] }>(
    "https://api.huobi.pro/market/tickers",
    { retries: 1 },
  );
  if (data.status !== "ok") throw new Error("火币行情接口返回异常");
  const wanted = new Set(codes.map((c) => c.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  const rows = data.data ?? [];
  return rows
    .filter((t) => t.symbol?.endsWith("usdt"))
    .map((t) => ({ code: t.symbol.slice(0, -4).toUpperCase(), t }))
    .filter(({ code }) => wanted.has(code))
    .map(({ code, t }) => ({
      code,
      market: "CRYPTO" as const,
      name: `${code}/USDT`,
      price: t.close,
      change: t.close - t.open,
      changePct: t.open ? ((t.close - t.open) / t.open) * 100 : 0,
      open: t.open,
      high: t.high,
      low: t.low,
      prevClose: t.open,
      volume: t.vol,
      turnover: t.amount ?? t.vol,
      currency: "USDT",
      ts: Date.now(),
    }));
}

async function getCryptoQuotesFromCoinGecko(codes: string[]): Promise<Quote[]> {
  const symbols = codes.map((c) => c.toLowerCase()).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${encodeURIComponent(symbols)}`;
  const data = await fetchJson<CgQuoteMarket[]>(url, { retries: 1 });
  return data.map((c) => ({
    code: c.symbol.toUpperCase(),
    market: "CRYPTO" as const,
    name: `${c.symbol.toUpperCase()}/USD`,
    price: num(c.current_price),
    change: num(c.price_change_24h),
    changePct: num(c.price_change_percentage_24h),
    open: num(c.current_price) - num(c.price_change_24h),
    high: num(c.high_24h),
    low: num(c.low_24h),
    prevClose: num(c.current_price) - num(c.price_change_24h),
    volume: num(c.total_volume),
    turnover: num(c.total_volume),
    currency: "USD",
    ts: Date.now(),
  }));
}

/**
 * 加密行情三源兜底，按实测连通性排序：火币(HTX) → 币安 Binance → CoinGecko。
 * 币安在国内网络环境下经常直接连接失败(fetch failed)；CoinGecko 免费额度容易被限流(429)，
 * 但两者都能作为火币异常时的补充，任一源成功即返回，全部失败才回空数组。
 */
export async function getCryptoQuotes(codes: string[]): Promise<Quote[]> {
  if (codes.length === 0) return [];
  const sources: [string, () => Promise<Quote[]>][] = [
    ["火币", () => getCryptoQuotesFromHuobi(codes)],
    ["币安", () => getCryptoQuotesFromBinance(codes)],
    ["CoinGecko", () => getCryptoQuotesFromCoinGecko(codes)],
  ];
  for (const [name, fn] of sources) {
    try {
      const quotes = await fn();
      if (quotes.length > 0) return quotes;
    } catch (err) {
      console.error(`[crypto] ${name} 行情获取失败:`, (err as Error).message);
    }
  }
  return [];
}

const HUOBI_PERIOD: Record<KlinePeriod, string> = {
  "1d": "1day",
  "1w": "1week",
  "1M": "1mon",
  "60m": "60min",
  "30m": "30min",
  "15m": "15min",
  "5m": "5min",
};

interface HuobiKlineRow {
  id: number;
  open: number;
  close: number;
  low: number;
  high: number;
  amount: number;
  vol: number;
}

async function getCryptoKlineFromBinance(
  code: string,
  period: KlinePeriod,
  limit: number,
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

async function getCryptoKlineFromHuobi(
  code: string,
  period: KlinePeriod,
  limit: number,
): Promise<Candle[]> {
  const symbol = toBinanceSymbol(code).toLowerCase();
  const interval = HUOBI_PERIOD[period];
  const size = Math.min(Math.max(limit, 1), 2000);
  const url = `https://api.huobi.pro/market/history/kline?symbol=${symbol}&period=${interval}&size=${size}`;
  const data = await fetchJson<{ status?: string; data?: HuobiKlineRow[] }>(url, { retries: 1 });
  if (data.status !== "ok") throw new Error("火币K线接口返回异常");
  const rows = data.data ?? [];
  return rows
    .map((r) => {
      const ts = r.id * 1000;
      return {
        ts,
        date: new Date(ts).toISOString().slice(0, 10),
        open: num(r.open),
        high: num(r.high),
        low: num(r.low),
        close: num(r.close),
        volume: num(r.vol),
        turnover: num(r.amount),
      } satisfies Candle;
    })
    .reverse(); // 火币按时间倒序返回，统一成升序
}

/** symbols= 可能匹配到多个同代码的小币种，取市值排名最靠前（数字最小）的一个 */
async function resolveCoinGeckoId(code: string): Promise<string | null> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${encodeURIComponent(
    code.toLowerCase(),
  )}`;
  const data = await fetchJson<{ id: string; market_cap_rank: number | null }[]>(url, { retries: 1 });
  if (data.length === 0) return null;
  const sorted = [...data].sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity));
  return sorted[0].id;
}

/** CoinGecko /ohlc 的 days 只接受几个离散档位，按所需根数就近取一档，避免请求参数不合法 */
function cgOhlcDays(period: KlinePeriod, limit: number): number {
  const barsPerDay: Record<KlinePeriod, number> = {
    "5m": 288,
    "15m": 96,
    "30m": 48,
    "60m": 24,
    "1d": 1,
    "1w": 1 / 7,
    "1M": 1 / 30,
  };
  const wantedDays = Math.ceil(limit / barsPerDay[period]);
  const tiers = [1, 7, 14, 30, 90, 180, 365];
  return tiers.find((t) => t >= wantedDays) ?? 365;
}

async function getCryptoKlineFromCoinGecko(
  code: string,
  period: KlinePeriod,
  limit: number,
): Promise<Candle[]> {
  const id = await resolveCoinGeckoId(code);
  if (!id) return [];
  const days = cgOhlcDays(period, limit);
  const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
  const data = await fetchJson<[number, number, number, number, number][]>(url, { retries: 1 });
  return data.slice(-limit).map(
    ([ts, open, high, low, close]) =>
      ({
        ts,
        date: new Date(ts).toISOString().slice(0, 10),
        open: num(open),
        high: num(high),
        low: num(low),
        close: num(close),
        // OHLC 端点不含成交量；本项目指标/回测均只依赖价格，置 0 无影响
        volume: 0,
        turnover: 0,
      }) satisfies Candle,
  );
}

/**
 * 与 getCryptoQuotes 相同的三源优先级：火币(HTX) → 币安 Binance → CoinGecko OHLC。
 * CoinGecko 的 K 线粒度较粗（按 days 分档，非任意周期），仅作最后兜底。
 */
export async function getCryptoKline(
  code: string,
  period: KlinePeriod,
  limit = 240,
): Promise<Candle[]> {
  const sources: [string, () => Promise<Candle[]>][] = [
    ["火币", () => getCryptoKlineFromHuobi(code, period, limit)],
    ["币安", () => getCryptoKlineFromBinance(code, period, limit)],
    ["CoinGecko", () => getCryptoKlineFromCoinGecko(code, period, limit)],
  ];
  for (const [name, fn] of sources) {
    try {
      const candles = await fn();
      if (candles.length > 0) return candles;
    } catch (err) {
      console.error(`[crypto] ${name} K线获取失败:`, (err as Error).message);
    }
  }
  return [];
}

interface CgMarket {
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
}

interface CgQuoteMarket {
  symbol: string;
  current_price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  total_volume: number;
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
      marketCap: num(c.market_cap),
    }))
    .filter((c) => !STABLECOINS.has(c.code))
    .slice(0, limit);
}

interface HuobiTicker {
  symbol: string;
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
  amount?: number;
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
