// FinSight 统一数据模型 —— 所有数据源适配后归一化为以下类型

export type Market = "CN" | "HK" | "US" | "CRYPTO";

export const MARKET_LABEL: Record<Market, string> = {
  CN: "A股",
  HK: "港股",
  US: "美股",
  CRYPTO: "加密",
};

export interface SymbolRef {
  code: string;
  market: Market;
  name: string;
  /** 东方财富 secid，如 1.600000 / 116.00700 / 105.AAPL */
  secid?: string;
  extra?: string;
}

export interface Quote {
  code: string;
  market: Market;
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  /** 成交量（股/张） */
  volume?: number;
  /** 成交额（计价货币） */
  turnover?: number;
  /** 总市值 */
  marketCap?: number;
  pe?: number;
  pb?: number;
  turnoverRate?: number;
  amplitude?: number;
  currency?: string;
  ts: number;
}

export type KlinePeriod = "1d" | "1w" | "1M" | "60m" | "30m" | "15m" | "5m";

export interface Candle {
  ts: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
}

export interface KlineResult {
  symbol: SymbolRef;
  period: KlinePeriod;
  candles: Candle[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  source?: string;
  url?: string;
  ts: number;
  tickers?: string[];
  /** AI 情绪打分 -1..1（由 AI 模块填充） */
  sentiment?: number;
}

export interface FinancialMetric {
  label: string;
  value: number | null;
  unit?: string;
  /** 用于展示的格式化字符串 */
  display?: string;
}

export interface FinancialSummary {
  symbol: SymbolRef;
  /** 估值与基本面关键指标 */
  metrics: FinancialMetric[];
  updatedAt: number;
}

export interface IndexQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  region: string;
}

export interface RankItem {
  code: string;
  market: Market;
  name: string;
  price: number;
  changePct: number;
  /** 总市值（原始计价货币，非折算美元），仅市值榜等场景填充。 */
  marketCap?: number;
}

export interface MarketOverview {
  indices: IndexQuote[];
  gainers: RankItem[];
  losers: RankItem[];
  active: RankItem[];
  /** A股总市值榜（前 N 大市值个股）。 */
  marketCap?: RankItem[];
  crypto: RankItem[];
  /** 港股/美股个股（涨幅+跌幅榜合并），供星图等按市场展示足量个股；东财个股级涨跌榜只覆盖 A 股，故单列。 */
  hkStocks?: RankItem[];
  usStocks?: RankItem[];
  /** 港股/美股各自的涨幅榜、跌幅榜、成交活跃榜，供行情看板按市场切换 Tab 展示。 */
  hkGainers?: RankItem[];
  hkLosers?: RankItem[];
  hkActive?: RankItem[];
  usGainers?: RankItem[];
  usLosers?: RankItem[];
  usActive?: RankItem[];
  /** 港股/美股总市值榜。 */
  hkMarketCap?: RankItem[];
  usMarketCap?: RankItem[];
  breadth?: { up: number; down: number; flat: number };
  updatedAt: number;
}

export interface ApiError {
  error: string;
  detail?: string;
}

export function parseSymbolToken(token: string): { market: Market; code: string } | null {
  const [m, ...rest] = token.split(":");
  const code = rest.join(":");
  if (!code) return null;
  const market = m.toUpperCase() as Market;
  if (!["CN", "HK", "US", "CRYPTO"].includes(market)) return null;
  return { market, code };
}
