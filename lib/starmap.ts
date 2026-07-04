// 星图纯数据层：节点/连线构建、配色、可见性过滤。不依赖 React 或任何渲染库，
// 方便 MarketStarMap 组件把「数据形状」与「力导向渲染」解耦。
import { fmtPct } from "@/lib/format";
import type { IndexQuote, Market, MarketOverview, RankItem } from "@/types/finsight";
import { MARKET_LABEL } from "@/types/finsight";

export type NodeKind = "hub" | "index" | "stock";
export type MarketFilter = "ALL" | Market;
export type TrendFilter = "ALL" | "UP" | "DOWN" | "FLAT";

/** 力导向图节点：x/y 由 d3-force 引擎接管，这里的 x/y 只作为「种子/归位」坐标。 */
export interface StarNode {
  id: string;
  label: string;
  fullLabel: string;
  sublabel?: string;
  changePct: number;
  price?: number;
  kind: NodeKind;
  /** 个股节点：所属市场。中枢节点：当前聚焦的分类（「全部」时为空），用于中枢外环换色。 */
  market?: Market;
  /** 仅个股节点使用：不带前缀的原始代码，右键菜单加入观察池时需要。 */
  code?: string;
  /** 仅指数节点使用：东方财富返回的地区字符串（沪深/香港/美国），用于关联个股所属市场。 */
  region?: string;
  /** 加密市场没有真实「指数」概念，总览态下用市值/成交额最高的几个币种顶替指数的角色，
   *  避免「全部」总览只留指数、个股一律隐藏的规则下加密扇区永远空着。仅对 CRYPTO 个股生效。 */
  anchor?: boolean;
  href: string;
  r: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  /** 力导向「回归力」的实时目标坐标：默认等于 homeX/homeY（扇区布局），
   *  单市场聚焦时会被临时改写为环绕布局坐标，切回「全部」时清空即恢复扇区位置。 */
  fhx?: number;
  fhy?: number;
  // 以下字段由 d3-force / force-graph 运行时写入，此处仅声明供 TS 引用
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

export interface StarLink {
  source: string;
  target: string;
  /** hub-anchor：加密头部币种顶替指数角色时的专属连线，需要跟 hub-index 一样按内圈半径
   *  约束距离——若仍归为 hub-stock（外圈半径），会跟内圈的 home 回归力互相拉扯，
   *  把市场中枢也一起拽偏（这正是"中枢不在正中间"的物理成因）。 */
  kind: "hub-index" | "hub-stock" | "hub-anchor" | "idx-stock";
}

export const TREND_DEAD_ZONE = 0.15;

export const MARKET_RING_COLOR: Record<Market, string> = {
  CN: "#ffa726",
  HK: "#00f0ff",
  US: "#4d8dff",
  CRYPTO: "#c084fc",
};

// 每个扇区 64° 宽（原来 50°），留给「全部」总览下 4 市场各自的指数+代表个股更多展开空间，
// 减少力学引擎把节点挤出扇区边界的情况；扇区间保留 26° 空隙用于视觉分隔。
export const SECTOR_ARCS: Record<Market, { start: number; end: number; fill: string }> = {
  CN: { start: -167, end: -103, fill: "rgba(255, 167, 38, 0.12)" },
  HK: { start: -77, end: -13, fill: "rgba(0, 240, 255, 0.12)" },
  US: { start: 13, end: 77, fill: "rgba(77, 141, 255, 0.12)" },
  CRYPTO: { start: 103, end: 167, fill: "rgba(192, 132, 252, 0.12)" },
};

export const INNER_R = 95;
export const OUTER_R = 175;

export function polar(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

function distributeInArc(count: number, startDeg: number, endDeg: number, radius: number) {
  if (count === 0) return [];
  const step = count === 1 ? 0 : (endDeg - startDeg) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const deg = count === 1 ? (startDeg + endDeg) / 2 : startDeg + step * i;
    return polar(radius, deg);
  });
}

/** 沿整圈均匀打点（不含首尾重合的接缝），单市场聚焦视图用它换取比窄扇区多得多的展开空间。 */
function distributeFullCircle(count: number, radius: number, startDeg = -90) {
  if (count === 0) return [];
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => polar(radius, startDeg + step * i));
}

function shortLabel(name: string, code: string, max = 5): string {
  const raw = (name?.trim() || code?.trim() || "?").replace(/\s+/g, "");
  return raw.length > max ? raw.slice(0, max) : raw;
}

export function regionToMarket(region: string | undefined): Market | null {
  if (!region) return null;
  if (region.includes("沪深")) return "CN";
  if (region.includes("香港")) return "HK";
  if (region.includes("美")) return "US";
  return null;
}

/** 幅度归一化到 [0,1]，用于饱和度/明度渐变。 */
function magnitudeRatio(pct: number, cap = 6): number {
  return Math.min(1, Math.abs(pct) / cap);
}

function trendHue(pct: number): number {
  if (pct > TREND_DEAD_ZONE) return 351; // 红：涨（霓虹绯红）
  if (pct < -TREND_DEAD_ZONE) return 158; // 绿：跌（荧光翡翠）
  return 205; // 蓝：平盘
}

/** 双通道配色的第一通道：涨跌方向 + 波动幅度（饱和度/明度渐变，避免同向全同色）。
 *  基线饱和度/明度都调高，避免小涨跌幅节点显得发灰发白。 */
export function nodeFillColor(pct: number, kind: NodeKind): string {
  const hue = trendHue(pct);
  const t = magnitudeRatio(pct);
  const sat = kind === "hub" ? 96 : 82 + t * 18;
  const light = kind === "hub" ? 48 : 60 - t * 20;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/** 节点球体渐变的高光/主体两个色标，营造发光星体的立体质感。 */
export function nodeGradientStops(pct: number, kind: NodeKind): { core: string; edge: string } {
  const hue = trendHue(pct);
  const t = magnitudeRatio(pct);
  const sat = kind === "hub" ? 100 : 88 + t * 12;
  const coreLight = kind === "hub" ? 68 : 78 - t * 10;
  const edgeLight = kind === "hub" ? 42 : 52 - t * 18;
  return {
    core: `hsl(${hue}, ${sat}%, ${coreLight}%)`,
    edge: `hsl(${hue}, ${sat}%, ${edgeLight}%)`,
  };
}

export function nodeGlowColor(pct: number): string {
  return `hsla(${trendHue(pct)}, 100%, 62%, 0.85)`;
}

export function pctTextColor(pct: number): string {
  if (pct > TREND_DEAD_ZONE) return "var(--up)";
  if (pct < -TREND_DEAD_ZONE) return "var(--down)";
  return "var(--muted)";
}

/** Canvas 2D 的 fillStyle 不支持 CSS `var()`，需要和 globals.css 的 --up/--down/--muted 保持同步的硬编码色值。 */
export function canvasPctColor(pct: number): string {
  if (pct > TREND_DEAD_ZONE) return "#ff3b46";
  if (pct < -TREND_DEAD_ZONE) return "#11c08b";
  return "#5a6b8c";
}

export const CANVAS_INK = "#0b1b3a";

function matchesTrend(pct: number, filter: TrendFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "UP") return pct > TREND_DEAD_ZONE;
  if (filter === "DOWN") return pct < -TREND_DEAD_ZONE;
  return pct >= -TREND_DEAD_ZONE && pct <= TREND_DEAD_ZONE;
}

/** 中枢节点文案：切到具体市场时，中枢应该代表「该市场」而不是永远不变的全市场大盘，
 *  否则「加密」「A股」……几个分类点开后中心节点长得一模一样，用户会怀疑筛选到底生不生效。 */
export const HUB_LABEL: Record<MarketFilter, string> = {
  ALL: "市场中枢",
  CN: `${MARKET_LABEL.CN}中枢`,
  HK: `${MARKET_LABEL.HK}中枢`,
  US: `${MARKET_LABEL.US}中枢`,
  CRYPTO: `${MARKET_LABEL.CRYPTO}中枢`,
};

/** 全市场大盘涨跌幅：指数 + 四个市场全部个股/币种的算术平均，用作「全部」总览下的中枢读数。 */
export function computeOverallAvgPct(data: MarketOverview): number {
  const pcts: number[] = [];
  const collect = (pct: number) => {
    if (Number.isFinite(pct)) pcts.push(pct);
  };
  data.indices.forEach((i) => collect(i.changePct));
  [...data.gainers, ...data.losers, ...data.active, ...data.crypto, ...(data.hkStocks ?? []), ...(data.usStocks ?? [])].forEach((s) =>
    collect(s.changePct)
  );
  return pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
}

/** 单市场大盘涨跌幅：只取该市场自己的指数 + 个股/币种，聚焦某个分类时中枢读数应该只反映
 *  这个分类的行情，而不是继续掺着其它三个市场的数据。 */
export function computeMarketAvgPct(data: MarketOverview, market: Market): number {
  const pcts: number[] = [];
  const collect = (pct: number) => {
    if (Number.isFinite(pct)) pcts.push(pct);
  };
  data.indices.filter((i) => regionToMarket(i.region) === market).forEach((i) => collect(i.changePct));
  if (market === "CN") {
    const seen = new Set<string>();
    [...data.gainers, ...data.losers, ...data.active].forEach((s) => {
      if (s.market !== "CN" || seen.has(s.code)) return;
      seen.add(s.code);
      collect(s.changePct);
    });
  }
  if (market === "HK") (data.hkStocks ?? []).forEach((s) => collect(s.changePct));
  if (market === "US") (data.usStocks ?? []).forEach((s) => collect(s.changePct));
  if (market === "CRYPTO") data.crypto.forEach((s) => collect(s.changePct));
  return pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
}

/** 每个市场至少展示的个股数量：单市场过滤时也要有足够密度，而不是稀稀拉拉 4 个点。 */
export const MIN_STOCKS_PER_MARKET = 10;

/** 「全部」总览下用来顶替指数角色的加密币种数量，取值参考其它市场指数数量（3~4 个）。 */
export const CRYPTO_ANCHOR_COUNT = 3;

/**
 * 每个市场明确分配「涨 + 跌」配额，而不是共享 FIFO 队列——
 * 原实现按 gainers→losers→active 顺序填充共享坑位，gainers 总是先到先得，
 * 导致 losers 经常一个都进不去（这是首页星图「全红」的真实数据 bug）。
 * HK/US 个股来自专门的港股/美股涨跌榜接口（route.ts 里的 hkStocks/usStocks），
 * 与 A 股的 gainers/losers/active 结构不同，因此分开取数。
 */
function buildStockBuckets(data: MarketOverview): Record<Market, RankItem[]> {
  const buckets: Record<Market, RankItem[]> = { CN: [], HK: [], US: [], CRYPTO: [] };
  const seen = new Set<string>();
  const quota = MIN_STOCKS_PER_MARKET;

  const takeCn = (arr: RankItem[], max: number) => {
    let added = 0;
    for (const item of arr) {
      if (added >= max || buckets.CN.length >= quota) break;
      if (item.market !== "CN") continue;
      if (seen.has(item.code)) continue;
      seen.add(item.code);
      buckets.CN.push(item);
      added++;
    }
  };
  takeCn(data.gainers, Math.ceil(quota / 2));
  takeCn(data.losers, Math.ceil(quota / 2));
  if (buckets.CN.length < quota) takeCn(data.active, quota - buckets.CN.length);

  buckets.HK = (data.hkStocks ?? []).slice(0, quota);
  buckets.US = (data.usStocks ?? []).slice(0, quota);
  buckets.CRYPTO = data.crypto.slice(0, quota);

  return buckets;
}

export function buildNodeSpecs(data: MarketOverview, hubFilter: MarketFilter = "ALL"): StarNode[] {
  const nodes: StarNode[] = [];
  const avgPct = hubFilter === "ALL" ? computeOverallAvgPct(data) : computeMarketAvgPct(data, hubFilter);
  const hubLabel = HUB_LABEL[hubFilter];

  nodes.push({
    id: "hub",
    label: hubLabel,
    fullLabel: hubLabel,
    sublabel: fmtPct(avgPct),
    changePct: avgPct,
    kind: "hub",
    market: hubFilter === "ALL" ? undefined : hubFilter,
    href: "/market",
    r: 30,
    x: 0,
    y: 0,
    homeX: 0,
    homeY: 0,
  });

  // 不要裁剪：指数覆盖 CN/HK/US 三地，裁到 6 个会把美股指数整体丢掉，
  // 导致「美股」过滤后场上一个指数参照点都没有。
  // 关键修正：每个指数必须落在自己所属市场的扇区里，而不是沿整圈均匀铺开——
  // 否则「深证成指」这类 A 股指数会飘到港股扇区，视觉分类完全错乱。
  const indices = data.indices;
  const indexPositionOf = new Map<number, { x: number; y: number }>();
  const indicesByMarket = new Map<Market, IndexQuote[]>();
  const orphanIndices: IndexQuote[] = [];
  indices.forEach((idx) => {
    const m = regionToMarket(idx.region);
    if (m) {
      if (!indicesByMarket.has(m)) indicesByMarket.set(m, []);
      indicesByMarket.get(m)!.push(idx);
    } else {
      orphanIndices.push(idx);
    }
  });
  indicesByMarket.forEach((group, market) => {
    const arc = SECTOR_ARCS[market];
    // 内缩几度，避免指数节点贴着扇区边界／标签。
    const positions = distributeInArc(group.length, arc.start + 8, arc.end - 8, INNER_R);
    group.forEach((idx, i) => indexPositionOf.set(indices.indexOf(idx), positions[i]));
  });
  if (orphanIndices.length > 0) {
    const positions = distributeInArc(orphanIndices.length, -168, 168, INNER_R);
    orphanIndices.forEach((idx, i) => indexPositionOf.set(indices.indexOf(idx), positions[i]));
  }
  indices.forEach((idx: IndexQuote, i) => {
    const pos = indexPositionOf.get(i) ?? polar(INNER_R, 0);
    const full = idx.name?.trim() || idx.code;
    nodes.push({
      id: `idx-${idx.code}`,
      label: shortLabel(full, idx.code, 4),
      fullLabel: full,
      sublabel: fmtPct(idx.changePct),
      changePct: idx.changePct,
      price: idx.price,
      kind: "index",
      region: idx.region,
      href: "/market",
      r: 13,
      x: pos.x,
      y: pos.y,
      homeX: pos.x,
      homeY: pos.y,
    });
  });

  const byMarket = buildStockBuckets(data);
  (Object.keys(byMarket) as Market[]).forEach((market) => {
    const items = byMarket[market];
    const arc = SECTOR_ARCS[market];
    // 加密没有真实「指数」：把市值/成交额最高的头部币种单独摆到内圈（跟其它市场的指数
    // 同一半径），总览下顶替指数角色；剩余币种照常铺在外圈个股环，只是总览态会被隐藏。
    const anchorCount = market === "CRYPTO" ? Math.min(CRYPTO_ANCHOR_COUNT, items.length) : 0;
    const anchorItems = items.slice(0, anchorCount);
    const restItems = items.slice(anchorCount);
    const anchorPositions = distributeInArc(anchorItems.length, arc.start + 8, arc.end - 8, INNER_R);
    const restPositions = distributeInArc(restItems.length, arc.start, arc.end, OUTER_R);
    const laidOut = [
      ...anchorItems.map((item, i) => ({ item, pos: anchorPositions[i], anchor: true })),
      ...restItems.map((item, i) => ({ item, pos: restPositions[i], anchor: false })),
    ];
    laidOut.forEach(({ item, pos, anchor }) => {
      const full = item.name?.trim() || item.code?.trim() || item.code;
      nodes.push({
        id: `stk-${item.market}-${item.code}`,
        label: shortLabel(full, item.code, 6),
        fullLabel: full,
        sublabel: fmtPct(item.changePct),
        changePct: item.changePct,
        price: item.price,
        kind: "stock",
        market,
        code: item.code,
        anchor,
        href: `/stock/${item.market}/${item.code}`,
        r: 9 + Math.min(Math.abs(item.changePct), 12) * 0.55,
        x: pos.x,
        y: pos.y,
        homeX: pos.x,
        homeY: pos.y,
      });
    });
  });

  return nodes;
}

export function buildLinkSpecs(nodes: StarNode[]): StarLink[] {
  const hub = nodes.find((n) => n.kind === "hub");
  const indices = nodes.filter((n) => n.kind === "index");
  const stocks = nodes.filter((n) => n.kind === "stock");
  if (!hub) return [];

  const links: StarLink[] = [];
  indices.forEach((idx) => links.push({ source: hub.id, target: idx.id, kind: "hub-index" }));
  stocks.forEach((stk) => {
    links.push({ source: hub.id, target: stk.id, kind: stk.anchor ? "hub-anchor" : "hub-stock" });
    const partner = indices.find((idx) => regionToMarket(idx.region) === stk.market);
    if (partner) links.push({ source: partner.id, target: stk.id, kind: "idx-stock" });
  });
  return links;
}

/**
 * 单市场聚焦时，把该市场的指数/个股从「窄扇区」临时改派到「整圆环绕」布局——
 * 扇区只有 50° 宽却要塞下 10+ 个节点，间距比节点直径还小，力学引擎只能把它们
 * 挤成一坨完全脱离扇区形状，這正是「扇形不知道有什么用」的根源。聚焦单市场时
 * 不再需要跟其它市场分扇区共存，改用整圆能拿到多倍展开空间，也更容易居中取景。
 */
export function computeFocusedHome(nodes: StarNode[], market: Market): void {
  const indices = nodes.filter((n) => n.kind === "index" && regionToMarket(n.region) === market);
  const stocks = nodes.filter((n) => n.kind === "stock" && n.market === market);

  const idxPositions = distributeFullCircle(indices.length, INNER_R, -90);
  indices.forEach((n, i) => {
    n.fhx = idxPositions[i].x;
    n.fhy = idxPositions[i].y;
  });

  // 起始角错开半格，避免指数环、个股环上的点径向对齐、连线全部重叠。
  const stockStart = -90 + 180 / Math.max(stocks.length, 1);
  const stockPositions = distributeFullCircle(stocks.length, OUTER_R, stockStart);
  stocks.forEach((n, i) => {
    n.fhx = stockPositions[i].x;
    n.fhy = stockPositions[i].y;
  });
}

/** 回到「全部」总览：清空临时环绕坐标，力会自动收回到 buildNodeSpecs 算好的扇区 home 位置。 */
export function resetFocusedHome(nodes: StarNode[]): void {
  nodes.forEach((n) => {
    n.fhx = undefined;
    n.fhy = undefined;
  });
}

export function nodeVisible(
  node: StarNode,
  marketFilter: MarketFilter,
  trendFilter: TrendFilter,
  search: string
): boolean {
  if (node.kind === "hub") return true;
  const q = search.trim().toLowerCase();
  const matchesSearch = !q || node.fullLabel.toLowerCase().includes(q) || node.label.toLowerCase().includes(q) || node.id.toLowerCase().includes(q);
  if (!matchesSearch) return false;
  if (!matchesTrend(node.changePct, trendFilter)) return false;
  if (marketFilter !== "ALL") {
    if (node.kind === "index" && regionToMarket(node.region) !== marketFilter) return false;
    if (node.kind === "stock" && node.market !== marketFilter) return false;
  }
  return true;
}
