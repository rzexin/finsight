// 资讯 AI 情绪打分：批量调用大模型，为 NewsItem.sentiment（-1..1）赋值。
//
// 设计要点（呼应 docs/财务接口502问题复盘.md 的教训）：
// - 只请求打分本身需要的字段（标题+摘要），不夹带无关内容。
// - 大模型未配置 / 调用失败时静默跳过，绝不阻断资讯正常展示（优雅降级）。
// - 按标题做进程内缓存，避免同一条资讯在轮询间被重复打分（省成本、降延迟）。

import { chatComplete, getChatConfig } from "@/lib/ai/openai";
import type { NewsItem } from "@/types/finsight";

interface CacheEntry {
  score: number;
  ts: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 内容不变，分数没必要频繁重算
const CACHE_MAX_SIZE = 3000;
const BATCH_SIZE = 20;
const MAX_CONCURRENT_BATCHES = 3;

const scoreCache = new Map<string, CacheEntry>();

function cacheKey(n: NewsItem): string {
  // 部分上游 id 为兜底的序号（如 kx-0），跨轮询会指向不同内容，
  // 混入标题前缀可避免误命中旧分数。
  return `${n.id}|${n.title.slice(0, 40)}`;
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.ts < CACHE_TTL_MS;
}

function evictIfNeeded() {
  if (scoreCache.size <= CACHE_MAX_SIZE) return;
  const oldestFirst = [...scoreCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (const [key] of oldestFirst.slice(0, scoreCache.size - CACHE_MAX_SIZE)) {
    scoreCache.delete(key);
  }
}

const SYSTEM_PROMPT = `你是资深金融市场情绪分析师。给定一批财经资讯（标题+摘要），逐条判断其对相关标的或大盘的短期情绪倾向。
打分范围 -1 到 1：越接近 1 越利多（正面/看涨），越接近 -1 越利空（负面/看跌），与行情无关或中性的接近 0。
只依据文本本身判断，不要输出任何解释文字。严格返回 JSON 数组，不要加代码块标记或多余内容，格式如下：
[{"index":1,"score":0.6},{"index":2,"score":-0.3}]
数组长度必须与输入条数一致，index 对应输入的序号。`;

function buildUserPrompt(batch: NewsItem[]): string {
  const lines = batch.map((n, i) => {
    const summary = n.summary ? ` 摘要:${n.summary.slice(0, 80)}` : "";
    return `${i + 1}. 标题:${n.title}${summary}`;
  });
  return `请对以下 ${batch.length} 条资讯逐条打情绪分：\n${lines.join("\n")}`;
}

function parseScores(content: string | null): Map<number, number> {
  const result = new Map<number, number>();
  if (!content) return result;
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    const raw = JSON.parse(cleaned);
    if (!Array.isArray(raw)) return result;
    for (const item of raw) {
      if (item && typeof item.index === "number" && typeof item.score === "number") {
        result.set(item.index, Math.max(-1, Math.min(1, item.score)));
      }
    }
  } catch {
    // 大模型偶尔返回非法 JSON，跳过本批打分即可，不影响资讯展示
  }
  return result;
}

async function scoreBatch(batch: NewsItem[]): Promise<void> {
  const res = await chatComplete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(batch) },
    ],
    temperature: 0,
  });
  const scores = parseScores(res.content);
  const ts = Date.now();
  batch.forEach((n, i) => {
    const score = scores.get(i + 1);
    if (score != null) {
      scoreCache.set(cacheKey(n), { score, ts });
    }
  });
  evictIfNeeded();
}

/** 为资讯列表批量打情绪分；未配置大模型或调用失败时原样返回（不抛错）。 */
export async function scoreNewsSentiment(items: NewsItem[]): Promise<NewsItem[]> {
  if (items.length === 0 || !getChatConfig().ok) return items;

  const pending = items.filter((n) => {
    const cached = scoreCache.get(cacheKey(n));
    return !cached || !isFresh(cached);
  });

  if (pending.length > 0) {
    const batches: NewsItem[][] = [];
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      batches.push(pending.slice(i, i + BATCH_SIZE));
    }
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
      const chunk = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
      await Promise.all(chunk.map((batch) => scoreBatch(batch).catch(() => {})));
    }
  }

  return items.map((n) => {
    const cached = scoreCache.get(cacheKey(n));
    return cached ? { ...n, sentiment: cached.score } : n;
  });
}
