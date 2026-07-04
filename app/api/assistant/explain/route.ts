import { NextRequest } from "next/server";
import { chatComplete } from "@/lib/ai/openai";
import { swrCache } from "@/lib/cache";
import { findGlossaryEntry } from "@/lib/glossary";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/assistant/explain  { term: string, context?: string }
// 面向金融小白：解释研报中被选中的词汇/术语。用严格的系统提示词把输出锁定为
// 固定 JSON 结构，避免大模型「过度发挥」（写成长文、夹带投资建议、编造数据等）。

interface ExplainResult {
  term: string;
  definition: string;
  analogy: string;
  note: string;
}

const MAX_TERM_LEN = 40;
const MAX_CONTEXT_LEN = 220;
// 术语释义基本与语境无关，24h 内同一词汇直接复用缓存，减少重复调用大模型
const FRESH_MS = 24 * 60 * 60 * 1000;

function systemPrompt(): string {
  return [
    "你是 FinSight 面向金融小白用户的「术语速查」助手。",
    "用户在研究报告里选中了一个词汇，你需要用最通俗易懂的方式解释它，帮助零基础新手看懂研报。",
    "【输出格式：只允许输出一个 JSON 对象，不要加 ```、不要加任何前后缀文字、不要输出 Markdown】",
    'JSON 结构固定为：{"definition":"…","analogy":"…","note":"…"}',
    "字段要求：",
    "- definition：该词本身含义的准确、简明解释，20~40 个汉字左右，不展开无关内容。",
    "- analogy：用生活化场景类比帮助理解，不超过 40 个汉字；如实在没有合适类比，留空字符串。",
    "- note：仅当该词容易误解、有多种口径、或存在需要提醒新手注意的风险点时才填写，不超过 30 个汉字；否则留空字符串。",
    "严格约束：",
    "1. 只解释「这个词是什么意思」，不要给出买卖建议、不要预测涨跌、不要评价具体标的好坏。",
    "2. 不要编造具体数值、公司名、事件；如给的上下文与该词无直接关系，就只解释该词的通用含义。",
    "3. 全部使用简体中文口语化表达，避免用比该词更生僻的术语解释它；必须使用专有名词时，括号内简单说明。",
    "4. 不输出免责声明、不输出「以上」「综上」等元话语、不输出编号列表、不输出换行符。",
  ].join("\n");
}

function clamp(s: unknown, max: number): string {
  const t = String(s ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function parseModelOutput(term: string, raw: string): ExplainResult {
  let text = raw.trim();
  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const obj = JSON.parse(text);
    return {
      term,
      definition: clamp(obj.definition, 90),
      analogy: clamp(obj.analogy, 90),
      note: clamp(obj.note, 70),
    };
  } catch {
    // 模型未遵循 JSON 格式时兜底：整段当作定义，并做长度裁剪，避免"过度发挥"的长文直出
    return { term, definition: clamp(text, 140), analogy: "", note: "" };
  }
}

async function fetchExplain(term: string, context: string): Promise<ExplainResult> {
  const res = await chatComplete({
    messages: [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: context
          ? `术语：${term}\n出现的上下文片段（仅用于判断具体含义，不要复述或分析上下文本身）：${context}`
          : `术语：${term}`,
      },
    ],
    temperature: 0.2,
  });
  return parseModelOutput(term, res.content ?? "");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const term = String(body?.term ?? "").trim().slice(0, MAX_TERM_LEN);
  const context = String(body?.context ?? "").trim().slice(0, MAX_CONTEXT_LEN);

  if (!term) {
    return Response.json({ error: "缺少 term" }, { status: 400 });
  }

  // 常见固定术语优先用人工编写的静态词库：内容可控、即时返回，且不依赖大模型是否配置成功
  const staticEntry = findGlossaryEntry(term);
  if (staticEntry) {
    return Response.json({
      term,
      definition: staticEntry.definition,
      analogy: staticEntry.analogy ?? "",
      note: staticEntry.note ?? "",
    });
  }

  try {
    const data = await swrCache(`explain:${term}`, () => fetchExplain(term, context), {
      freshMs: FRESH_MS,
      shouldCache: (d) => Boolean(d.definition),
    });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
