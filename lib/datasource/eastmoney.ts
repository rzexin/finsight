import { fetchJson, fetchJsonAny, fetchText, emHostCandidates, EM_HEADERS } from "@/lib/http";
import { marketFromSecid, resolveSecid } from "@/lib/datasource/symbol";
import { swrCache } from "@/lib/cache";
import type {
  Candle,
  FinancialMetric,
  IndexQuote,
  KlinePeriod,
  Market,
  NewsItem,
  Quote,
  RankItem,
  SymbolRef,
} from "@/types/finsight";

const KLT: Record<KlinePeriod, number> = {
  "1d": 101,
  "1w": 102,
  "1M": 103,
  "60m": 60,
  "30m": 30,
  "15m": 15,
  "5m": 5,
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

// ---------------- 实时报价（批量） ----------------
interface UlistRow {
  f1?: number;
  f2?: number;
  f3?: number;
  f4?: number;
  f5?: number;
  f6?: number;
  f12?: string;
  f13?: number;
  f14?: string;
  f15?: number;
  f16?: number;
  f17?: number;
  f18?: number;
}

export async function getQuotes(refs: SymbolRef[]): Promise<Quote[]> {
  if (refs.length === 0) return [];
  // 解析所有 secid
  const resolved = await Promise.all(
    refs.map(async (r) => ({
      ref: r,
      secid: r.secid ?? (await resolveSecid(r.market, r.code).catch(() => null)),
    }))
  );
  const valid = resolved.filter((x) => x.secid) as { ref: SymbolRef; secid: string }[];
  if (valid.length === 0) return [];

  const secids = valid.map((x) => x.secid).join(",");
  const fields = "f1,f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18";
  const data = await fetchJsonAny<{ data?: { diff?: UlistRow[] } }>(
    (host) => `${host}/api/qt/ulist.np/get?fltt=2&secids=${secids}&fields=${fields}`,
    emHostCandidates(),
    { headers: EM_HEADERS, retries: 1 }
  );
  const rows = data.data?.diff ?? [];
  const byCode = new Map<string, UlistRow>();
  for (const row of rows) if (row.f12) byCode.set(`${row.f13}.${row.f12}`, row);

  const out: Quote[] = [];
  for (const { ref, secid } of valid) {
    const row = byCode.get(secid) ?? rows.find((r) => r.f12 === ref.code);
    if (!row) continue;
    const market = (row.f13 != null && marketFromSecid(`${row.f13}.${row.f12}`)) || ref.market;
    out.push({
      code: row.f12 ?? ref.code,
      market: market as Market,
      name: row.f14 ?? ref.name,
      price: num(row.f2),
      changePct: num(row.f3),
      change: num(row.f4),
      open: num(row.f17),
      high: num(row.f15),
      low: num(row.f16),
      prevClose: num(row.f18),
      volume: num(row.f5),
      turnover: num(row.f6),
      ts: Date.now(),
    });
  }
  return out;
}

// ---------------- K线 ----------------
export async function getKline(
  secid: string,
  period: KlinePeriod,
  limit = 240
): Promise<Candle[]> {
  const klt = KLT[period];
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    `&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klt}&fqt=1&end=20500101&lmt=${limit}`;
  const data = await fetchJson<{ data?: { klines?: string[] } }>(url, {
    headers: EM_HEADERS,
    retries: 2,
  });
  const klines = data.data?.klines ?? [];
  return klines.map((line) => {
    const [date, open, close, high, low, volume, turnover] = line.split(",");
    return {
      date,
      ts: new Date(date.replace(" ", "T")).getTime(),
      open: num(open),
      close: num(close),
      high: num(high),
      low: num(low),
      volume: num(volume),
      turnover: num(turnover),
    } satisfies Candle;
  });
}

// ---------------- 财务/估值摘要 ----------------
const FIN_FIELDS = [
  "f162", "f164", "f167", "f116", "f117", "f55", "f92",
  "f168", "f50", "f171", "f84", "f85", "f174", "f175",
].join(",");

export async function getFinancials(secid: string): Promise<FinancialMetric[]> {
  // 财务/估值数据变化缓慢，新鲜期取 5 分钟。
  return swrCache(`financials:${secid}`, () => fetchFinancials(secid), { freshMs: 300_000 });
}

async function fetchFinancials(secid: string): Promise<FinancialMetric[]> {
  const data = await fetchJsonAny<{ data?: Record<string, number | string> }>(
    (host) => `${host}/api/qt/stock/get?fltt=2&secid=${secid}&fields=${FIN_FIELDS}`,
    emHostCandidates(),
    { headers: EM_HEADERS, retries: 1 }
  );
  const d = data.data ?? {};
  const m = (label: string, key: string, unit?: string): FinancialMetric => {
    const raw = d[key];
    const value = raw === "-" || raw == null || raw === "" ? null : num(raw);
    return { label, value, unit };
  };
  return [
    m("市盈率(动)", "f162"),
    m("市盈率(TTM)", "f164"),
    m("市净率", "f167"),
    m("总市值", "f116", "元"),
    m("流通市值", "f117", "元"),
    m("每股收益", "f55", "元"),
    m("每股净资产", "f92", "元"),
    m("换手率", "f168", "%"),
    m("量比", "f50"),
    m("振幅", "f171", "%"),
    m("总股本", "f84", "股"),
    m("流通股本", "f85", "股"),
    m("52周最高", "f174"),
    m("52周最低", "f175"),
  ];
}

// ---------------- 榜单 ----------------
const FS_CN = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";

interface ClistRow {
  f2?: number;
  f3?: number;
  f12?: string;
  f13?: number;
  f14?: string;
}

function normDiff(diff: ClistRow[] | Record<string, ClistRow> | undefined): ClistRow[] {
  if (!diff) return [];
  return Array.isArray(diff) ? diff : Object.values(diff);
}

export async function getRankList(
  kind: "gainers" | "losers" | "active",
  pz = 10
): Promise<RankItem[]> {
  const fid = kind === "active" ? "f6" : "f3";
  const po = kind === "losers" ? 0 : 1;
  const data = await fetchJsonAny<{ data?: { diff?: ClistRow[] | Record<string, ClistRow> } }>(
    (host) =>
      `${host}/api/qt/clist/get?pn=1&pz=${pz}&po=${po}&fid=${fid}` +
      `&fs=${encodeURIComponent(FS_CN)}&fields=f2,f3,f12,f13,f14&fltt=2`,
    emHostCandidates(),
    { headers: EM_HEADERS, retries: 1 }
  );
  return normDiff(data.data?.diff).map((r) => ({
    code: r.f12 ?? "",
    market: (marketFromSecid(`${r.f13}.${r.f12}`) ?? "CN") as Market,
    name: r.f14 ?? "",
    price: num(r.f2),
    changePct: num(r.f3),
  }));
}

// ---------------- 指数 ----------------
const INDEX_DEFS: { secid: string; region: string }[] = [
  { secid: "1.000001", region: "沪深" },
  { secid: "0.399001", region: "沪深" },
  { secid: "0.399006", region: "沪深" },
  { secid: "1.000300", region: "沪深" },
  { secid: "100.HSI", region: "香港" },
  { secid: "100.HSCEI", region: "香港" },
  { secid: "100.DJIA", region: "美国" },
  { secid: "100.NDX", region: "美国" },
  { secid: "100.SPX", region: "美国" },
];

export async function getIndices(): Promise<IndexQuote[]> {
  const secids = INDEX_DEFS.map((i) => i.secid).join(",");
  const data = await fetchJsonAny<{ data?: { diff?: UlistRow[] } }>(
    (host) => `${host}/api/qt/ulist.np/get?fltt=2&secids=${secids}&fields=f2,f3,f4,f12,f13,f14`,
    emHostCandidates(),
    { headers: EM_HEADERS, retries: 1 }
  );
  const rows = data.data?.diff ?? [];
  const regionBySecid = new Map(INDEX_DEFS.map((i) => [i.secid, i.region]));
  return rows.map((r) => ({
    code: r.f12 ?? "",
    name: r.f14 ?? "",
    price: num(r.f2),
    change: num(r.f4),
    changePct: num(r.f3),
    region: regionBySecid.get(`${r.f13}.${r.f12}`) ?? "",
  }));
}

// ---------------- 资讯 ----------------
interface KuaixunResp {
  LivesList?: Array<{
    id?: string;
    newsid?: string;
    title?: string;
    digest?: string;
    url_w?: string;
    showtime?: string;
  }>;
}

export async function getKuaixun(limit = 30): Promise<NewsItem[]> {
  // 7×24 快讯，新鲜期取 30s；空结果不缓存。
  return swrCache(`kuaixun:${limit}`, () => fetchKuaixun(limit), {
    freshMs: 30_000,
    shouldCache: (arr) => arr.length > 0,
  });
}

async function fetchKuaixun(limit = 30): Promise<NewsItem[]> {
  const url = `https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_${limit}_1_.html`;
  const text = await fetchText(url, {
    headers: { Referer: "https://kuaixun.eastmoney.com/" },
    retries: 2,
  });
  const start = text.indexOf("{");
  const data = JSON.parse(text.slice(start)) as KuaixunResp;
  return (data.LivesList ?? []).map((n, i) => ({
    id: n.newsid ?? n.id ?? `kx-${i}`,
    title: n.title ?? "",
    summary: n.digest ?? "",
    source: "东方财富·7×24快讯",
    url: n.url_w,
    ts: n.showtime ? new Date(n.showtime.replace(" ", "T")).getTime() : Date.now(),
  }));
}

interface SearchNewsResp {
  result?: {
    cmsArticleWebOld?: Array<{
      code?: string;
      title?: string;
      content?: string;
      mediaName?: string;
      url?: string;
      date?: string;
    }>;
  };
}

const stripTag = (s = "") => s.replace(/<[^>]+>/g, "");

export async function getStockNews(keyword: string, limit = 12): Promise<NewsItem[]> {
  // 个股/主题资讯，新鲜期取 60s；空结果不缓存。
  return swrCache(`stocknews:${keyword}:${limit}`, () => fetchStockNews(keyword, limit), {
    freshMs: 60_000,
    shouldCache: (arr) => arr.length > 0,
  });
}

async function fetchStockNews(keyword: string, limit = 12): Promise<NewsItem[]> {
  const param = {
    uid: "",
    keyword,
    type: ["cmsArticleWebOld"],
    client: "web",
    clientType: "web",
    clientVersion: "curr",
    param: {
      cmsArticleWebOld: {
        searchScope: "default",
        sort: "default",
        pageIndex: 1,
        pageSize: limit,
        preTag: "",
        postTag: "",
      },
    },
  };
  const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=x&param=${encodeURIComponent(
    JSON.stringify(param)
  )}`;
  const text = await fetchText(url, { headers: { Referer: "https://so.eastmoney.com/" }, retries: 2 });
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const data = JSON.parse(text.slice(start, end + 1)) as SearchNewsResp;
  return (data.result?.cmsArticleWebOld ?? []).map((n, i) => ({
    id: n.code ?? `news-${i}`,
    title: stripTag(n.title),
    summary: stripTag(n.content).slice(0, 160),
    source: n.mediaName,
    url: n.url,
    ts: n.date ? new Date(n.date.replace(" ", "T")).getTime() : Date.now(),
  }));
}
