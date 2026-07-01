// 腾讯财经（gtimg）数据源：作为东方财富 push2 被限流/反爬时的备用源
// 覆盖 A股 / 港股 / 美股 的实时行情与日/周/月 K线（加密仍走 Binance）

import { fetchText, fetchJson } from "@/lib/http";
import { buildSecid, resolveSecid } from "@/lib/datasource/symbol";
import type { Candle, KlinePeriod, Quote, SymbolRef } from "@/types/finsight";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

const TX_HEADERS = { Referer: "https://gu.qq.com/" };

/** 东财 secid -> 腾讯 symbol */
function secidToTx(secid: string): string | null {
  const dot = secid.indexOf(".");
  if (dot < 0) return null;
  const prefix = secid.slice(0, dot);
  const code = secid.slice(dot + 1);
  if (prefix === "1") return `sh${code}`;
  if (prefix === "0") return `sz${code}`;
  if (prefix === "116" || prefix === "128") return `hk${code}`;
  if (prefix === "105" || prefix === "106" || prefix === "107") return `us${code.toUpperCase()}`;
  return null;
}

async function refToTx(r: SymbolRef): Promise<string | null> {
  if (r.secid) return secidToTx(r.secid);
  if (r.market === "HK") return `hk${r.code.toUpperCase().padStart(5, "0")}`;
  if (r.market === "US") {
    const sid = await resolveSecid("US", r.code).catch(() => null);
    return sid ? secidToTx(sid) : `us${r.code.toUpperCase()}`;
  }
  const sid = buildSecid(r.market, r.code);
  return sid ? secidToTx(sid) : null;
}

// ---------------- 实时报价 ----------------
// 返回形如：v_sh600519="1~贵州茅台~600519~price~prevClose~open~vol~...~time~change~pct~high~low~..."
// 注意：A股与港股因买卖档位数量不同，change/high/low 的绝对下标会偏移；
// 因此以「时间字段」为锚点取其后 4 个字段，并用价格差兜底，保证跨市场稳健。
export async function getTencentQuotes(refs: SymbolRef[]): Promise<Quote[]> {
  if (refs.length === 0) return [];
  const mapped = await Promise.all(refs.map(async (r) => ({ ref: r, sym: await refToTx(r) })));
  const valid = mapped.filter((m): m is { ref: SymbolRef; sym: string } => Boolean(m.sym));
  if (valid.length === 0) return [];

  const text = await fetchText(`https://qt.gtimg.cn/q=${valid.map((v) => v.sym).join(",")}`, {
    encoding: "gbk",
    headers: TX_HEADERS,
    retries: 2,
  });

  const bySym = new Map<string, string[]>();
  const re = /v_([0-9a-zA-Z]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) bySym.set(m[1], m[2].split("~"));

  const out: Quote[] = [];
  for (const { ref, sym } of valid) {
    const f = bySym.get(sym);
    if (!f || f.length < 10) continue;
    const price = num(f[3]);
    if (!price) continue;
    const prevClose = num(f[4]);
    // 定位时间字段：A股为 14 位数字，港股/美股为 yyyy/mm/dd ...
    const ti = f.findIndex((x) => /^\d{14}$/.test(x) || /^\d{4}\/\d{2}\/\d{2}/.test(x));
    let change = ti >= 0 ? num(f[ti + 1]) : 0;
    let changePct = ti >= 0 ? num(f[ti + 2]) : 0;
    const high = ti >= 0 ? num(f[ti + 3]) : 0;
    const low = ti >= 0 ? num(f[ti + 4]) : 0;
    if (!change && prevClose) change = Number((price - prevClose).toFixed(3));
    if (!changePct && prevClose) changePct = Number((((price - prevClose) / prevClose) * 100).toFixed(2));
    out.push({
      code: ref.code,
      market: ref.market,
      name: f[1] || ref.name,
      price,
      changePct,
      change,
      open: num(f[5]),
      high,
      low,
      prevClose,
      volume: num(f[6]),
      turnover: 0,
      ts: Date.now(),
    });
  }
  return out;
}

// ---------------- K线 ----------------
const TX_PERIOD: Partial<Record<KlinePeriod, string>> = {
  "1d": "day",
  "1w": "week",
  "1M": "month",
};

interface TxKlineResp {
  data?: Record<string, Record<string, unknown>>;
}

export async function getTencentKline(
  secid: string,
  period: KlinePeriod,
  limit = 240
): Promise<Candle[]> {
  const sym = secidToTx(secid);
  const p = TX_PERIOD[period];
  if (!sym || !p) return []; // 分钟级周期腾讯接口不同，备用源仅覆盖日/周/月
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},${p},,,${limit},qfq`;
  const data = await fetchJson<TxKlineResp>(url, { headers: TX_HEADERS, retries: 2 });
  const obj = data.data?.[sym];
  if (!obj) return [];
  // 复权后字段名为 qfq{day|week|month}，部分品种（如港股）直接为 {day}
  const arr = (obj[`qfq${p}`] ?? obj[p] ?? obj[`hfq${p}`]) as unknown[][] | undefined;
  if (!Array.isArray(arr)) return [];
  return arr.map((row) => {
    // 行格式：[date, open, close, high, low, volume, ...]
    const [date, open, close, high, low, volume] = row as string[];
    return {
      date: String(date),
      ts: new Date(String(date).replace(" ", "T")).getTime(),
      open: num(open),
      close: num(close),
      high: num(high),
      low: num(low),
      volume: num(volume),
      turnover: 0,
    } satisfies Candle;
  });
}
