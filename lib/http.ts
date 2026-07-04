// 安全 HTTP 封装：域名白名单(防 SSRF) + 超时 + 重试 + 编码处理
// 所有外部请求必须经过此封装；仅允许显式白名单中的公网域名。

const ALLOWED_HOST_SUFFIXES = [
  "eastmoney.com",
  "sinajs.cn",
  "sina.com.cn",
  "gtimg.cn",
  "api.binance.com",
  "api1.binance.com",
  "api.coingecko.com",
  // 火币(HTX)行情接口：CoinGecko 免费额度极易被限流(429)、Binance 在国内网络环境下
  // 经常直接连接失败，火币的公开行情接口连通性更稳定，作为加密行情的兜底数据源。
  "huobi.pro",
];

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class UpstreamError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

function assertAllowed(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new UpstreamError("非法的请求地址");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new UpstreamError("仅允许 http/https 协议");
  }
  const host = u.hostname.toLowerCase();
  // 拒绝直接以 IP / 内网地址访问，强制走白名单域名
  const isIp = /^[\d.]+$/.test(host) || host.includes(":");
  const allowed =
    !isIp && ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith("." + s));
  if (!allowed) {
    throw new UpstreamError(`域名未在白名单内: ${host}`);
  }
  return u;
}

interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** 响应编码，默认 utf-8；新浪接口为 gbk */
  encoding?: "utf-8" | "gbk";
  revalidate?: number;
}

async function rawFetch(url: string, opts: FetchOpts): Promise<Response> {
  assertAllowed(url);
  const { timeoutMs = 9000, headers = {}, revalidate } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": DEFAULT_UA, ...headers },
      redirect: "follow",
      // Next.js: 行情数据需实时，禁用缓存；可缓存项由调用方用 revalidate 控制
      next: revalidate !== undefined ? { revalidate } : undefined,
      cache: revalidate !== undefined ? undefined : "no-store",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const retries = opts.retries ?? 1;
  return withRetry(async () => {
    const res = await rawFetch(url, opts);
    if (!res.ok) throw new UpstreamError(`上游返回 ${res.status}`, res.status);
    if (opts.encoding === "gbk") {
      const buf = await res.arrayBuffer();
      try {
        return new TextDecoder("gbk").decode(buf);
      } catch {
        return new TextDecoder("utf-8").decode(buf);
      }
    }
    return res.text();
  }, retries);
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError("上游返回非 JSON 数据");
  }
}

/** 解析 JSONP / 变量赋值形式的响应，提取首个 JSON 对象/数组 */
export async function fetchJsonp<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const text = await fetchText(url, opts);
  const start = text.indexOf("{");
  const arrStart = text.indexOf("[");
  let from = start;
  if (arrStart !== -1 && (start === -1 || arrStart < start)) from = arrStart;
  if (from === -1) throw new UpstreamError("无法解析 JSONP 响应");
  const open = text[from];
  const close = open === "{" ? "}" : "]";
  const end = text.lastIndexOf(close);
  if (end === -1) throw new UpstreamError("无法解析 JSONP 响应");
  try {
    return JSON.parse(text.slice(from, end + 1)) as T;
  } catch {
    throw new UpstreamError("JSONP 内容解析失败");
  }
}

/** 随机东方财富实时行情节点（push2 主域会 302 到延迟节点） */
export function emPushHost(): string {
  const n = 1 + Math.floor(Math.random() * 98);
  return `https://${n}.push2.eastmoney.com`;
}

/**
 * 东方财富行情节点候选列表：多个互不相同的随机编号节点 + 稳定域名兜底。
 *
 * 编号节点 N.push2.eastmoney.com 直接返回数据（200），是最可靠的来源；
 * 而裸主域 push2.eastmoney.com 会 302 跳转到 push2delay.eastmoney.com（延迟服务器，
 * 负载更高、偶发 502/超时）。因此候选顺序为：先尽可能多地尝试可靠的编号节点，
 * 仅当它们全部因网络抖动失败时，才落到带跳转的兜底域名。
 *
 * randomCount 默认取 4：单个编号节点偶发不可达（fetch failed），多尝试几个可使
 * "全部失败 → 跌落到不稳定跳转链路 → 上游 502" 的概率降到可忽略；由于 fetchJsonAny
 * 命中首个成功节点即返回，正常路径不会有额外开销。
 */
export function emHostCandidates(randomCount = 4): string[] {
  const hosts = new Set<string>();
  let guard = 0;
  while (hosts.size < randomCount && guard++ < 50) {
    hosts.add(emPushHost());
  }
  // 兜底域名：push2delay 为跳转后的真实节点，直连可省去 302 往返；
  // push2 主域作为最终兜底（其自身会再 302 到 delay）。
  hosts.add("https://push2delay.eastmoney.com");
  hosts.add("https://push2.eastmoney.com");
  return [...hosts];
}

/**
 * 依次尝试多个 host 构造的 URL，任一成功即返回；全部失败才抛出最后一个错误。
 * 用于行情类接口的多节点容灾（配合每个节点自身的 retries）。
 */
export async function fetchJsonAny<T = unknown>(
  buildUrl: (host: string) => string,
  hosts: string[],
  opts: FetchOpts = {}
): Promise<T> {
  let lastErr: unknown;
  for (const host of hosts) {
    try {
      return await fetchJson<T>(buildUrl(host), opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new UpstreamError("所有上游行情节点均不可用");
}

export const EM_HEADERS = { Referer: "https://quote.eastmoney.com/" };
