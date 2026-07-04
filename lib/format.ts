import type { Market } from "@/types/finsight";

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "--";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "--";
  const s = v.toFixed(digits);
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "--";
  return `${v > 0 ? "+" : ""}${fmtNum(v, digits)}`;
}

/** 大额金额：自动 万 / 亿 */
export function fmtMoney(v: number | null | undefined, currency = ""): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${currency}${(v / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8) return `${currency}${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${currency}${(v / 1e4).toFixed(2)}万`;
  return `${currency}${fmtNum(v, 2)}`;
}

export function fmtVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return fmtNum(v, 0);
}

/** 涨跌颜色类（A股习惯：红涨绿跌） */
export function changeClass(v: number | null | undefined): string {
  if (v == null || v === 0) return "text-muted";
  return v > 0 ? "up" : "down";
}

export function changeBg(v: number | null | undefined): string {
  if (v == null || v === 0) return "bg-muted/10 text-muted";
  return v > 0 ? "bg-up/10 text-up" : "bg-down/10 text-down";
}

export const MARKET_TONE: Record<Market, string> = {
  CN: "text-up",
  HK: "text-cyan",
  US: "text-primary",
  CRYPTO: "text-warn",
};

export const MARKET_BADGE: Record<Market, string> = {
  CN: "bg-up/10 text-up",
  HK: "bg-cyan/10 text-cyan",
  US: "bg-primary/10 text-primary",
  CRYPTO: "bg-warn/10 text-warn",
};

/** 各市场计价货币符号：A股人民币、港股港元、美股/加密美元。 */
export const MARKET_CURRENCY: Record<Market, string> = {
  CN: "¥",
  HK: "HK$",
  US: "$",
  CRYPTO: "$",
};

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}
