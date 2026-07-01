import type { ToolSpec } from "@/lib/ai/openai";
import { getQuotesMixed, getKlineFor } from "@/lib/datasource";
import { getFinancials, getKuaixun, getStockNews } from "@/lib/datasource/eastmoney";
import { searchSymbols, resolveSecid } from "@/lib/datasource/symbol";
import { computeIndicators } from "@/lib/indicators";
import { runBacktest, type StrategyId } from "@/lib/backtest";
import { parseSymbolToken, type Market, type SymbolRef } from "@/types/finsight";

export const TOOL_SPECS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "search_symbol",
      description: "按名称或代码搜索股票/加密货币标的，返回市场与代码。用于把用户口语化的名称解析为可查询的标的。",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "标的名称或代码，如 茅台、AAPL、BTC" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_quote",
      description: "获取一个或多个标的的实时行情（价格、涨跌幅、最高最低、成交量额）。",
      parameters: {
        type: "object",
        properties: {
          symbols: {
            type: "array",
            items: { type: "string" },
            description: '标的列表，格式为 "市场:代码"，市场取值 CN/HK/US/CRYPTO，如 ["CN:600519","US:AAPL","CRYPTO:BTC"]',
          },
        },
        required: ["symbols"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kline",
      description: "获取标的的历史 K 线数据与价格区间统计，用于趋势分析。",
      parameters: {
        type: "object",
        properties: {
          market: { type: "string", enum: ["CN", "HK", "US", "CRYPTO"] },
          code: { type: "string" },
          period: { type: "string", enum: ["1d", "1w", "1M"], description: "周期，默认 1d" },
          limit: { type: "number", description: "返回根数，默认 120" },
        },
        required: ["market", "code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_indicators",
      description: "获取标的最新技术指标（MA/RSI/MACD/KDJ/BOLL），用于技术面研判。",
      parameters: {
        type: "object",
        properties: {
          market: { type: "string", enum: ["CN", "HK", "US", "CRYPTO"] },
          code: { type: "string" },
          period: { type: "string", enum: ["1d", "1w", "1M"] },
        },
        required: ["market", "code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financials",
      description: "获取股票的估值与基本面关键指标（市盈率、市净率、市值、每股收益等）。仅支持 CN/HK/US。",
      parameters: {
        type: "object",
        properties: {
          market: { type: "string", enum: ["CN", "HK", "US"] },
          code: { type: "string" },
        },
        required: ["market", "code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description: "获取市场资讯。传 keyword 获取个股/主题相关新闻，不传则获取全市场 7×24 快讯。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "可选，标的名称或主题" },
          limit: { type: "number", description: "条数，默认 10" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_backtest",
      description: "对标的运行简单策略回测（均线交叉/RSI反转/突破），返回收益、最大回撤、胜率、夏普等指标。",
      parameters: {
        type: "object",
        properties: {
          market: { type: "string", enum: ["CN", "HK", "US", "CRYPTO"] },
          code: { type: "string" },
          strategy: { type: "string", enum: ["ma_cross", "rsi_reversal", "breakout"] },
          fast: { type: "number" },
          slow: { type: "number" },
        },
        required: ["market", "code", "strategy"],
      },
    },
  },
];

export interface ToolOutcome {
  ok: boolean;
  brief: string;
  data: unknown;
}

const round = (v: number | null | undefined, d = 2) =>
  v == null ? null : Number(v.toFixed(d));

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "search_symbol": {
        const query = String(args.query ?? "");
        const items = await searchSymbols(query);
        return { ok: true, brief: `「${query}」找到 ${items.length} 个标的`, data: items };
      }
      case "get_quote": {
        const tokens = (args.symbols as string[]) ?? [];
        const refs: SymbolRef[] = [];
        for (const t of tokens) {
          const p = parseSymbolToken(t);
          if (p) refs.push({ ...p, name: p.code });
        }
        const quotes = await getQuotesMixed(refs);
        return { ok: quotes.length > 0, brief: `获取 ${quotes.length} 条行情`, data: quotes };
      }
      case "get_kline": {
        const market = String(args.market) as Market;
        const code = String(args.code);
        const period = (args.period as "1d" | "1w" | "1M") ?? "1d";
        const limit = Math.min(Number(args.limit) || 120, 250);
        const { candles } = await getKlineFor(market, code, period, limit);
        if (candles.length === 0) return { ok: false, brief: "无K线数据", data: null };
        const closes = candles.map((c) => c.close);
        const compact = candles.slice(-60).map((c) => ({ d: c.date, c: c.close }));
        return {
          ok: true,
          brief: `${market}:${code} · ${candles.length} 根 ${period} K线`,
          data: {
            count: candles.length,
            first: candles[0],
            last: candles[candles.length - 1],
            high: Math.max(...closes),
            low: Math.min(...closes),
            recent: compact,
          },
        };
      }
      case "get_indicators": {
        const market = String(args.market) as Market;
        const code = String(args.code);
        const period = (args.period as "1d" | "1w" | "1M") ?? "1d";
        const { candles } = await getKlineFor(market, code, period, 250);
        if (candles.length === 0) return { ok: false, brief: "无数据", data: null };
        const ind = computeIndicators(candles);
        const i = candles.length - 1;
        const data = {
          close: candles[i].close,
          ma5: round(ind.ma5[i]),
          ma10: round(ind.ma10[i]),
          ma20: round(ind.ma20[i]),
          ma60: round(ind.ma60[i]),
          rsi14: round(ind.rsi14[i]),
          macd: { dif: round(ind.macd.dif[i]), dea: round(ind.macd.dea[i]), hist: round(ind.macd.hist[i]) },
          kdj: { k: round(ind.kdj.k[i]), d: round(ind.kdj.d[i]), j: round(ind.kdj.j[i]) },
          boll: { upper: round(ind.boll.upper[i]), mid: round(ind.boll.mid[i]), lower: round(ind.boll.lower[i]) },
        };
        return { ok: true, brief: `${market}:${code} · 已计算技术指标`, data };
      }
      case "get_financials": {
        const market = String(args.market) as Market;
        const code = String(args.code);
        const secid = await resolveSecid(market, code);
        if (!secid) return { ok: false, brief: "无法解析标的", data: null };
        const metrics = await getFinancials(secid);
        return { ok: true, brief: `${market}:${code} · 已获取基本面`, data: metrics };
      }
      case "get_news": {
        const keyword = args.keyword ? String(args.keyword) : undefined;
        const limit = Math.min(Number(args.limit) || 10, 20);
        const items = keyword ? await getStockNews(keyword, limit) : await getKuaixun(limit);
        const data = items.map((n) => ({ title: n.title, summary: n.summary, source: n.source, time: new Date(n.ts).toISOString() }));
        const label = keyword ? `「${keyword}」` : "全市场快讯";
        return { ok: items.length > 0, brief: `${label} 获取 ${items.length} 条资讯`, data };
      }
      case "run_backtest": {
        const market = String(args.market) as Market;
        const code = String(args.code);
        const strategy = String(args.strategy) as StrategyId;
        const { candles } = await getKlineFor(market, code, "1d", 250);
        if (candles.length < 30) return { ok: false, brief: "数据不足以回测", data: null };
        const result = runBacktest(candles, strategy, {
          fast: Number(args.fast) || undefined,
          slow: Number(args.slow) || undefined,
        });
        return { ok: true, brief: `${market}:${code} · ${strategy} 回测完成`, data: { strategy, metrics: result.metrics, tradeCount: result.trades.length } };
      }
      default:
        return { ok: false, brief: `未知工具 ${name}`, data: null };
    }
  } catch (err) {
    return { ok: false, brief: `工具执行失败: ${(err as Error).message}`, data: null };
  }
}
