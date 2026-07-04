"use client";

import dynamicImport from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forceCollide, forceManyBody, forceX, forceY } from "d3-force";
import { useFetch } from "@/lib/useFetch";
import { fmtNum } from "@/lib/format";
import { addWatch } from "@/lib/storage";
import type { Market, MarketOverview } from "@/types/finsight";
import { MARKET_LABEL } from "@/types/finsight";
import {
  buildLinkSpecs,
  buildNodeSpecs,
  CANVAS_INK,
  canvasPctColor,
  computeFocusedHome,
  INNER_R,
  MARKET_RING_COLOR,
  nodeGlowColor,
  nodeGradientStops,
  nodeVisible,
  OUTER_R,
  pctTextColor,
  resetFocusedHome,
  SECTOR_ARCS,
  TREND_DEAD_ZONE,
  polar,
  type MarketFilter,
  type StarLink,
  type StarNode,
  type TrendFilter,
} from "@/lib/starmap";

// 「全部」总览下的取景半径：固定取个股环半径 + 一点标签余量，不依赖当前到底有哪些节点。
// 之前用 zoomToFit 按可见节点的包围盒取景，一旦某个市场没有数据（比如加密行情一时拉不到），
// 包围盒就会严重偏向有数据的那几个象限，市场中枢跟着被挤到画面一角——固定半径 + 强制居中
// 从根上避免这个问题，不管哪个市场暂时没数据，中枢永远在正中间。
const FOCUS_RADIUS = OUTER_R + 45;

// react-force-graph-2d 直接操作 <canvas>，依赖 window，SSR 阶段必须跳过。
// 库的类型定义是泛型函数组件，经 next/dynamic 包装后泛型会丢失，此文件里对
// ForceGraph 实例方法调用统一走 any，避免为一个仅本组件使用的第三方库类型做体操。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamicImport(() => import("react-force-graph-2d"), { ssr: false }) as any;

type FGHandle = {
  d3Force: (name: string, force?: unknown) => unknown;
  d3ReheatSimulation: () => void;
  zoom: (scale?: number, ms?: number) => number;
  zoomToFit: (ms?: number, padding?: number, filterFn?: (n: StarNode) => boolean) => void;
  centerAt: (x?: number, y?: number, ms?: number) => void;
  screen2GraphCoords: (x: number, y: number) => { x: number; y: number };
  graph2ScreenCoords: (x: number, y: number) => { x: number; y: number };
};

const MARKET_FILTERS: { id: MarketFilter; label: string }[] = [
  { id: "ALL", label: "全部" },
  { id: "CN", label: "A股" },
  { id: "HK", label: "港股" },
  { id: "US", label: "美股" },
  { id: "CRYPTO", label: "加密" },
];

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function Tooltip({ node, x, y }: { node: StarNode; x: number; y: number }) {
  return (
    <div
      className="star-map-tooltip pointer-events-none absolute z-20 rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 shadow-lg backdrop-blur-md"
      style={{ left: x, top: y }}
    >
      <div className="flex items-center gap-2">
        {node.market && (
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            {MARKET_LABEL[node.market]}
          </span>
        )}
        {node.kind === "index" && (
          <span className="rounded-md bg-cyan/10 px-1.5 py-0.5 text-[10px] font-bold text-cyan">指数</span>
        )}
        <span className="text-sm font-bold text-ink">{node.fullLabel}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        {node.price != null && <span className="tnum text-xs text-muted">{fmtNum(node.price)}</span>}
        <span className="tnum text-sm font-bold" style={{ color: pctTextColor(node.changePct) }}>
          {node.sublabel}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-faint">
        {node.kind === "stock" ? "左键详情 · 右键快捷操作 · 拖拽可钉住" : "点击查看详情 · 拖拽可钉住"}
      </p>
    </div>
  );
}

function ContextMenu({
  node,
  x,
  y,
  onWatch,
  onDetail,
}: {
  node: StarNode;
  x: number;
  y: number;
  onWatch: () => void;
  onDetail: () => void;
}) {
  return (
    <div className="star-map-context-menu absolute z-30 rounded-xl border border-line bg-surface shadow-lg" style={{ left: x, top: y }}>
      <div className="border-b border-line/60 px-3 py-2 text-xs font-bold text-ink">{node.fullLabel}</div>
      <button type="button" className="star-map-context-item" onClick={onWatch}>
        + 加入观察池
      </button>
      <button type="button" className="star-map-context-item" onClick={onDetail}>
        查看详情
      </button>
    </div>
  );
}

export function MarketStarMap() {
  const router = useRouter();
  const { data, error, loading, reload } = useFetch<MarketOverview>("/api/market/overview", {
    pollMs: 30000,
  });

  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("ALL");
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ node: StarNode; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 420 });
  const [version, setVersion] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const fgRef = useRef<FGHandle | null>(null);
  const registryRef = useRef<Map<string, StarNode>>(new Map());
  const linksRef = useRef<StarLink[]>([]);
  // d3 力函数只在引擎初始化时挂载一次，之后靠这个 ref 读最新的 marketFilter——
  // 单市场聚焦时 idx-stock 连线要大幅减弱，否则全部个股会被一根线拽到唯一的
  // 「搭档指数」跟前挤成一团，而不是散开到整圆环绕布局上（见下方 handleEngineReady 注释）。
  const marketFilterRef = useRef<MarketFilter>(marketFilter);
  useEffect(() => {
    marketFilterRef.current = marketFilter;
  }, [marketFilter]);

  // 数据轮询到来时，合并进已有节点对象（保留力学引擎写入的 x/y/vx/vy/fx/fy），
  // 而不是整体替换数组——否则每次轮询节点位置都会被打回随机初始状态。
  // marketFilter 也在依赖里：切换分类时中枢要立刻换成该分类自己的涨跌幅/文案，
  // 而不是等到下一次 30s 轮询才刷新（见 buildNodeSpecs 的 hubFilter 参数）。
  useEffect(() => {
    if (!data) return;
    const specs = buildNodeSpecs(data, marketFilter);
    const reg = registryRef.current;
    const nextIds = new Set(specs.map((s) => s.id));
    for (const id of Array.from(reg.keys())) {
      if (!nextIds.has(id)) reg.delete(id);
    }
    specs.forEach((spec) => {
      const existing = reg.get(spec.id);
      if (existing) {
        const { x, y, vx, vy, fx, fy } = existing;
        Object.assign(existing, spec, { x, y, vx, vy, fx, fy });
      } else {
        reg.set(spec.id, { ...spec });
      }
    });
    linksRef.current = buildLinkSpecs(specs);
    setVersion((v) => v + 1);
  }, [data, marketFilter]);

  const allNodes = useMemo(() => Array.from(registryRef.current.values()), [version]);

  // 「全部」总览只看大盘概貌：只留指数，个股一律不展示（4 市场 × 10 只个股糊成一团，
  // 而且指数已经足够表达涨跌大势）；选中具体某个市场后才展开该市场的完整个股列表。
  // 主动搜索时不受此限制——否则搜个股名字会因为在总览态被过滤掉而"搜不到"。
  // 加密市场没有真实「指数」，若和其它市场一样把个股全部滤掉，加密扇区在总览下就永远是空的
  // （这不是数据问题，是规则对没有指数概念的市场不成立）——用 anchor 标记的头部币种放行。
  const isBrowsingAll = marketFilter === "ALL" && search.trim() === "";
  const visibleNodes = useMemo(
    () =>
      allNodes.filter((n) => {
        if (!nodeVisible(n, marketFilter, trendFilter, search)) return false;
        if (isBrowsingAll && n.kind === "stock" && !n.anchor) return false;
        return true;
      }),
    [allNodes, marketFilter, trendFilter, search, isBrowsingAll]
  );

  const graphData = useMemo(() => {
    const idSet = new Set(visibleNodes.map((n) => n.id));
    const links = linksRef.current.filter((l) => idSet.has(l.source) && idSet.has(l.target));
    return { nodes: visibleNodes, links };
  }, [visibleNodes, version]);

  const upCount = allNodes.filter((n) => n.kind !== "hub" && n.changePct > TREND_DEAD_ZONE).length;
  const downCount = allNodes.filter((n) => n.kind !== "hub" && n.changePct < -TREND_DEAD_ZONE).length;
  const visibleCount = Math.max(0, visibleNodes.length - 1);
  const filtersActive = marketFilter !== "ALL" || trendFilter !== "ALL" || search.trim() !== "";

  // 响应式尺寸：Canvas 需要数值宽高，用容器宽度驱动，高度按比例夹在合理区间内。
  // 用回调 ref 而不是 useEffect([])：容器 div 要等 loading/error 状态落定后才挂载，
  // 空依赖的 effect 只在首次挂载（此时 div 还不存在）跑一次，会错过后续真正挂载的时机。
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) {
        setSize({ width: Math.floor(w), height: Math.floor(clamp(w * 0.72, 360, 460)) });
      }
    });
    ro.observe(el);
    resizeObserverRef.current = ro;
  }, []);

  // 用 ref 镜像最新的 size：fitView 需要在 handleEngineReady（deps 为 []，只在挂载时建一次）
  // 里被引用，如果 fitView 依赖 size state 会导致它随窗口 resize 换身份，进而让
  // ref 回调重新触发、整个力学模拟被打回重建——用 ref 读最新值即可保持 fitView 引用永远稳定。
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // 固定半径取景并强制把镜头中心钉在 (0,0)——星图无论「全部」总览还是单市场聚焦，
  // 节点都是绕着市场中枢（hub，固定在原点）对称分布的，用这个代替 zoomToFit 的
  // 包围盒取景，中枢永远居中，不会因为某个市场暂时没数据而被挤偏。
  const fitView = useCallback((ms = 450) => {
    const fg = fgRef.current;
    const { width, height } = sizeRef.current;
    if (!fg || width <= 0 || height <= 0) return;
    const targetZoom = clamp(Math.min(width, height) / (FOCUS_RADIUS * 2), 0.4, 4);
    fg.centerAt(0, 0, ms);
    fg.zoom(targetZoom, ms);
  }, []);

  // 自定义力：碰撞检测防重叠 + 弱化默认斥力，让节点能贴着扇区分布又不互相穿模。
  // 关键：hub-index/hub-stock 连线只约束「离中枢的距离」，完全没有角度约束——
  // 扇区一拥挤（尤其个股配额从 4 提到 10 之后），未被选为连线搭档的节点会被
  // 电荷斥力推到空隙角度，飘到别的市场扇区去（这正是「分类不对」的物理成因）。
  // 用 forceX/forceY 施加一个指向 home 坐标的弱回归力，把节点「钉」在自己的扇区角度上。
  const handleEngineReady = useCallback((fg: FGHandle) => {
    fgRef.current = fg;
    fg.d3Force("collide", forceCollide((n: StarNode) => n.r + 5).iterations(2));
    fg.d3Force("charge", forceManyBody().strength(-18).distanceMax(260));
    // anchor（加密头部币种顶替指数角色）跟真正的指数用同样强度的回归力，
    // 否则 home 目标在内圈、却只有个股级别的弱回归力去对抗下面 hub-anchor 连线的
    // 外圈拉力，节点会被拉扯到中间某个不上不下的位置，市场中枢也会被一起带偏。
    const homeStrength = (n: StarNode) => (n.kind === "hub" ? 0 : n.kind === "index" || n.anchor ? 0.18 : 0.1);
    fg.d3Force("homeX", forceX((n: StarNode) => n.fhx ?? n.homeX).strength(homeStrength));
    fg.d3Force("homeY", forceY((n: StarNode) => n.fhy ?? n.homeY).strength(homeStrength));
    // idx-stock 连线只在「全部」总览下需要强约束（把个股视觉上拽向所属市场的指数，
    // 帮助扇区分组一目了然）；单市场聚焦时全部个股本就同属一个市场，这根线再拉满强度
    // 只会把所有个股都拽到唯一的「搭档指数」跟前糊成一团，跟整圆环绕布局互相打架。
    // hub-anchor 的连线距离必须跟 hub-index 一样用内圈半径——anchor 的 home 目标就在
    // 内圈，如果连线还按外圈个股距离约束，两股力会互相拉扯，见上面 homeStrength 的注释。
    const link = fg.d3Force("link") as { distance?: (fn: (l: StarLink) => number) => void; strength?: (fn: (l: StarLink) => number) => void } | undefined;
    link?.distance?.((l: StarLink) =>
      l.kind === "hub-index" || l.kind === "hub-anchor"
        ? INNER_R
        : l.kind === "idx-stock"
          ? (marketFilterRef.current === "ALL" ? 30 : OUTER_R - INNER_R)
          : OUTER_R
    );
    link?.strength?.((l: StarLink) => (l.kind === "idx-stock" ? (marketFilterRef.current === "ALL" ? 0.35 : 0.03) : 0.06));
    setTimeout(() => fitView(500), 250);
  }, [fitView]);

  const setForceGraphRef = useCallback(
    (fg: FGHandle | null) => {
      if (fg && fgRef.current !== fg) handleEngineReady(fg);
      if (!fg) fgRef.current = null;
    },
    [handleEngineReady]
  );

  // 切换市场过滤时，把该市场节点的力学回归目标从「窄扇区坐标」换成「整圆环绕坐标」
  // （见 computeFocusedHome），reheat 后节点会自己走位展开；等它们走得差不多了
  // 再取景，比切换瞬间就 zoomToFit 更稳，也不会因为 hub 和聚焦簇隔得太远而取景偏心。
  const prevMarketFilterRef = useRef(marketFilter);
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const marketChanged = prevMarketFilterRef.current !== marketFilter;
    prevMarketFilterRef.current = marketFilter;

    if (marketChanged) {
      const nodes = Array.from(registryRef.current.values());
      if (marketFilter === "ALL") resetFocusedHome(nodes);
      else computeFocusedHome(nodes, marketFilter);
      fg.d3ReheatSimulation();
      // 「全部」总览和单市场聚焦都是绕市场中枢对称分布的固定半径布局，直接钉中心+定焦距，
      // 不用 zoomToFit 按当前可见节点包围盒取景——避免某个市场暂时没数据时中枢被挤偏。
      const id = setTimeout(() => fitView(450), 550);
      // 市场切换后节点还在缓慢归位，补一次延迟取景把最终布局收进画面，避免定格在「走到一半」的偏心状态。
      const settleId = setTimeout(() => fitView(700), 2500);
      return () => {
        clearTimeout(id);
        clearTimeout(settleId);
      };
    }

    // 仅趋势/搜索变化：市场没变，仍按当前可见节点的包围盒取景，让镜头贴着筛选结果收紧。
    const fitToVisible = (ms: number) =>
      fg.zoomToFit(ms, 55, (n: StarNode) => graphData.nodes.some((v) => v.id === n.id));
    const id = setTimeout(() => fitToVisible(450), 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketFilter, trendFilter, search]);

  const resetLayout = useCallback(() => {
    registryRef.current.forEach((n) => {
      n.fx = undefined;
      n.fy = undefined;
    });
    fgRef.current?.d3ReheatSimulation();
    setTimeout(() => fitView(500), 300);
  }, [fitView]);

  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoom(clamp(fg.zoom() * factor, 0.4, 4), 200);
  }, []);

  const handleNodeClick = useCallback(
    (node: StarNode) => {
      if (node.kind === "hub") {
        fitView(500);
        return;
      }
      router.push(node.href);
    },
    [router, fitView]
  );

  const handleNodeDragEnd = useCallback((node: StarNode) => {
    // 拖完钉住：与库默认的「松手弹回」行为相反，需要显式覆盖。
    node.fx = node.x;
    node.fy = node.y;
  }, []);

  const handleNodeHover = useCallback(
    (node: StarNode | null) => {
      setHoveredId(node?.id ?? null);
      if (node && fgRef.current && containerRef.current) {
        const screen = fgRef.current.graph2ScreenCoords(node.x, node.y);
        setTooltipPos({ x: clamp(screen.x, 90, size.width - 90), y: Math.max(8, screen.y - node.r - 70) });
      } else {
        setTooltipPos(null);
      }
    },
    [size.width]
  );

  const handleNodeRightClick = useCallback((node: StarNode, event: MouseEvent) => {
    if (node.kind !== "stock" || !containerRef.current) return;
    event.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    setContextMenu({
      node,
      x: clamp(event.clientX - rect.left, 8, rect.width - 170),
      y: clamp(event.clientY - rect.top, 8, rect.height - 90),
    });
  }, []);

  const handleBackgroundClick = useCallback(
    (event: MouseEvent) => {
      setContextMenu(null);
      // 扇区点击筛选只在「全部」总览下有意义——单市场聚焦视图已经改成整圆环绕布局，
      // 早就没有扇区形状了，这里的角度命中区也就没有意义。
      if (marketFilter !== "ALL") return;
      const fg = fgRef.current;
      const canvas = containerRef.current?.querySelector("canvas");
      if (!fg || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pt = fg.screen2GraphCoords(event.clientX - rect.left, event.clientY - rect.top);
      const dist = Math.hypot(pt.x, pt.y);
      if (dist < 88 || dist > 220) return;
      const angle = (Math.atan2(pt.y, pt.x) * 180) / Math.PI;
      const hit = (Object.keys(SECTOR_ARCS) as Market[]).find((m) => {
        const arc = SECTOR_ARCS[m];
        return angle >= arc.start && angle <= arc.end;
      });
      if (hit) setMarketFilter(hit);
    },
    [marketFilter]
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const onRenderFramePre = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 230);
      grad.addColorStop(0, "rgba(255,45,85,0.16)");
      grad.addColorStop(0.35, "rgba(0,102,255,0.14)");
      grad.addColorStop(0.7, "rgba(0,240,255,0.08)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 230, 0, Math.PI * 2);
      ctx.fill();

      // 扇形背景只用来表达「全部」总览下各市场的相对分区，仅供示意，从不强制节点必须落在
      // 扇区几何范围内。单市场聚焦时节点已经改用整圆环绕布局（见 computeFocusedHome），
      // 扇形背景不再对应真实布局，画出来反而会让人误以为节点"跑出扇区"是 bug，故直接不画，
      // 改为单独的中心标签标注当前聚焦的市场。
      if (marketFilter === "ALL") {
        (Object.keys(SECTOR_ARCS) as Market[]).forEach((m) => {
          const arc = SECTOR_ARCS[m];
          ctx.beginPath();
          ctx.arc(0, 0, 218, (arc.start * Math.PI) / 180, (arc.end * Math.PI) / 180);
          ctx.arc(0, 0, 88, (arc.end * Math.PI) / 180, (arc.start * Math.PI) / 180, true);
          ctx.closePath();
          ctx.fillStyle = arc.fill;
          ctx.fill();
          ctx.strokeStyle = MARKET_RING_COLOR[m];
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.globalAlpha = 1;

          const mid = (arc.start + arc.end) / 2;
          const labelPos = polar(232, mid);
          ctx.font = `700 ${10.5 / globalScale}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = MARKET_RING_COLOR[m];
          ctx.fillText(MARKET_LABEL[m], labelPos.x, labelPos.y);
        });
      } else {
        ctx.font = `700 ${11 / globalScale}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = MARKET_RING_COLOR[marketFilter];
        ctx.fillText(MARKET_LABEL[marketFilter], 0, -(OUTER_R + 34));
      }

      [INNER_R, OUTER_R].forEach((r) => {
        ctx.beginPath();
        ctx.setLineDash([4, 6]);
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,190,255,0.22)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      });
    },
    [marketFilter]
  );

  const linkColor = useCallback(
    (l: StarLink) => {
      if (l.kind === "idx-stock") return "rgba(0,240,255,0.28)";
      if (l.kind === "hub-index" || l.kind === "hub-anchor") return "rgba(0,140,255,0.4)";
      return "rgba(0,102,255,0.14)";
    },
    []
  );

  const nodeCanvasObject = useCallback(
    (node: StarNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHovered = hoveredId === node.id;
      const r = isHovered ? node.r * 1.18 : node.r;
      const glow = nodeGlowColor(node.changePct);
      const stops = nodeGradientStops(node.changePct, node.kind);
      const magnitude = Math.min(1, Math.abs(node.changePct) / 6);
      const isPinned = node.fx != null;

      if (node.kind === "hub") {
        const pulse = 1 + 0.08 * Math.sin(Date.now() / 420);
        for (let ring = 0; ring < 2; ring++) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, (r + 10 + ring * 10) * pulse, 0, Math.PI * 2);
          ctx.globalAlpha = 0.32 - ring * 0.12;
          ctx.strokeStyle = glow;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // 常驻辉光：幅度越大越亮，让「震荡」的节点自己会发光，不必等到 hover 才有存在感。
      ctx.shadowColor = glow;
      ctx.shadowBlur = isHovered ? 26 : node.kind === "hub" ? 22 : 6 + magnitude * 14;

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      const sphere = ctx.createRadialGradient(
        node.x - r * 0.32,
        node.y - r * 0.32,
        r * 0.05,
        node.x,
        node.y,
        r * 1.05
      );
      sphere.addColorStop(0, stops.core);
      sphere.addColorStop(1, stops.edge);
      ctx.fillStyle = sphere;
      ctx.fill();
      ctx.lineWidth = isHovered ? 2.6 : 1.6;
      ctx.strokeStyle = isHovered ? "#ffffff" : "rgba(255,255,255,0.8)";
      ctx.stroke();
      ctx.shadowBlur = 0;

      {
        // 中枢的 market 字段由 buildNodeSpecs 按当前分类筛选写入：聚焦某个市场时，
        // 中枢外环换成该市场的主题色，让「个性化中枢」在视觉上也有辨识度，
        // 而不是仅仅换了文案/数值。「全部」总览下 market 为空，维持中性白环。
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 2.8, 0, Math.PI * 2);
        ctx.strokeStyle = node.market ? MARKET_RING_COLOR[node.market] : "rgba(255,255,255,0.5)";
        ctx.globalAlpha = 1;
        ctx.lineWidth = node.kind === "hub" ? 2.6 : 1.8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (isPinned) {
        ctx.beginPath();
        ctx.arc(node.x + r * 0.72, node.y - r * 0.72, 3.2 / globalScale + 1.6, 0, Math.PI * 2);
        ctx.fillStyle = "#fbbf24";
        ctx.fill();
      }

      if (node.kind === "hub") {
        ctx.font = `700 ${11 / globalScale}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(node.label, node.x, node.y - 5 / globalScale);
        if (node.sublabel) {
          ctx.font = `600 ${9 / globalScale}px system-ui`;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillText(node.sublabel, node.x, node.y + 9 / globalScale);
        }
        return;
      }

      const angle = Math.atan2(node.y, node.x);
      const dist = r + (node.kind === "stock" ? 15 : 19);
      const lx = node.x + Math.cos(angle) * dist;
      const ly = node.y + Math.sin(angle) * dist;

      ctx.beginPath();
      ctx.moveTo(node.x + Math.cos(angle) * r, node.y + Math.sin(angle) * r);
      ctx.lineTo(node.x + Math.cos(angle) * dist * 0.72, node.y + Math.sin(angle) * dist * 0.72);
      ctx.strokeStyle = "rgba(150,160,180,0.35)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      const labelText = node.kind === "index" ? (node.fullLabel.length > 8 ? node.fullLabel.slice(0, 8) + "…" : node.fullLabel) : node.label;
      ctx.font = `700 ${(node.kind === "index" ? 9.5 : 8.5) / globalScale}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillText(labelText, lx, ly - 5 / globalScale + 0.6 / globalScale);
      ctx.fillStyle = CANVAS_INK;
      ctx.fillText(labelText, lx, ly - 5 / globalScale);

      if (node.sublabel) {
        ctx.font = `600 ${7.5 / globalScale}px system-ui`;
        ctx.fillStyle = canvasPctColor(node.changePct);
        ctx.fillText(node.sublabel, lx, ly + 7 / globalScale);
      }
    },
    [hoveredId]
  );

  const nodePointerAreaPaint = useCallback((node: StarNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const handleWatchFromMenu = useCallback(() => {
    if (!contextMenu || !contextMenu.node.market || !contextMenu.node.code) return;
    addWatch({ market: contextMenu.node.market, code: contextMenu.node.code, name: contextMenu.node.fullLabel });
    setContextMenu(null);
  }, [contextMenu]);

  const handleDetailFromMenu = useCallback(() => {
    if (!contextMenu) return;
    router.push(contextMenu.node.href);
    setContextMenu(null);
  }, [contextMenu, router]);

  return (
    <div className="glass-card neon-frame relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-line/60 px-5 py-3.5">
        <div>
          <div className="kicker">Interactive Market Star Map</div>
          <p className="mt-0.5 text-[11px] text-muted">力导向实时星图 · 拖拽/缩放/过滤 · 点击下钻</p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-up">
            <span className="h-2 w-2 rounded-full bg-up" />
            涨 {upCount}
          </span>
          <span className="flex items-center gap-1 text-down">
            <span className="h-2 w-2 rounded-full bg-down" />
            跌 {downCount}
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" style={{ animation: "fs-pulse 1.6s infinite" }} />
            30s
          </span>
        </div>
      </div>

      {!loading && !error && data && allNodes.length > 0 && (
        <div className="border-b border-line/40 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {MARKET_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMarketFilter(f.id)}
                  className={`star-map-filter-chip ${marketFilter === f.id ? "star-map-filter-chip-active" : ""}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索标的…"
              className="star-map-search ml-auto min-w-[120px] flex-1 sm:max-w-[160px] sm:flex-none"
              aria-label="搜索星图节点"
            />
          </div>
          {filtersActive && (
            <p className="mt-1.5 text-[10px] text-muted" aria-live="polite">
              当前显示 {visibleCount} 个节点（已隐藏 {Math.max(0, allNodes.length - 1 - visibleCount)} 个）
              {search.trim() ? ` · 匹配「${search.trim()}」` : ""}
            </p>
          )}
        </div>
      )}

      {loading && <div className="skeleton m-5 h-[420px] rounded-xl" />}

      {error && !loading && (
        <div className="flex h-[420px] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-semibold text-ink">星图数据暂不可用</p>
          <p className="max-w-xs text-xs text-muted">{error}</p>
          <button className="btn-ghost text-sm" onClick={() => reload()}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && data && allNodes.length > 0 && (
        <div ref={setContainerRef} className="star-map-canvas-wrap relative px-2 pb-3 pt-1">
          {hoveredId && tooltipPos && graphData.nodes.find((n) => n.id === hoveredId) && (
            <Tooltip node={graphData.nodes.find((n) => n.id === hoveredId)!} x={tooltipPos.x} y={tooltipPos.y} />
          )}
          {contextMenu && (
            <ContextMenu
              node={contextMenu.node}
              x={contextMenu.x}
              y={contextMenu.y}
              onWatch={handleWatchFromMenu}
              onDetail={handleDetailFromMenu}
            />
          )}

          <div className="star-map-zoom-controls">
            <button type="button" onClick={() => zoomBy(1.25)} aria-label="放大" title="放大">
              +
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="缩小" title="缩小">
              −
            </button>
            <button type="button" onClick={resetLayout} aria-label="重置布局" title="重置布局（清除拖拽钉住）">
              ⟲
            </button>
          </div>

          {size.width > 0 && (
            <ForceGraph2D
              ref={setForceGraphRef}
              graphData={graphData}
              width={size.width}
              height={size.height}
              backgroundColor="rgba(0,0,0,0)"
              nodeId="id"
              nodeCanvasObject={nodeCanvasObject}
              nodeCanvasObjectMode={() => "replace"}
              nodePointerAreaPaint={nodePointerAreaPaint}
              linkColor={linkColor}
              linkWidth={1}
              onRenderFramePre={onRenderFramePre}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onNodeDragEnd={handleNodeDragEnd}
              onNodeRightClick={handleNodeRightClick}
              onBackgroundClick={handleBackgroundClick}
              cooldownTime={4000}
              d3AlphaDecay={0.035}
              d3VelocityDecay={0.45}
              minZoom={0.4}
              maxZoom={4}
              enableNodeDrag
            />
          )}
        </div>
      )}

      {!loading && !error && data && allNodes.length > 0 && (
        <div className="mx-5 mb-3 flex flex-wrap items-center justify-center gap-4 border-t border-line/50 pt-3 text-[10px] text-muted">
          <button type="button" className={`star-map-legend-btn ${trendFilter === "UP" ? "star-map-legend-btn-active" : ""}`} onClick={() => setTrendFilter((f) => (f === "UP" ? "ALL" : "UP"))}>
            <span className="h-2.5 w-2.5 rounded-full bg-up" /> 上涨
          </button>
          <button type="button" className={`star-map-legend-btn ${trendFilter === "DOWN" ? "star-map-legend-btn-active" : ""}`} onClick={() => setTrendFilter((f) => (f === "DOWN" ? "ALL" : "DOWN"))}>
            <span className="h-2.5 w-2.5 rounded-full bg-down" /> 下跌
          </button>
          <button type="button" className={`star-map-legend-btn ${trendFilter === "FLAT" ? "star-map-legend-btn-active" : ""}`} onClick={() => setTrendFilter((f) => (f === "FLAT" ? "ALL" : "FLAT"))}>
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> 平盘
          </button>
          <span className="text-faint">· 环色区分市场 · 拖拽钉住(●)· 点击扇区筛选</span>
        </div>
      )}
    </div>
  );
}
