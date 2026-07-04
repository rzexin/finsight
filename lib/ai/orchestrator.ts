import { chatComplete, chatStream, getChatConfig, type ChatMessage } from "@/lib/ai/openai";
import { TOOL_SPECS, executeTool } from "@/lib/ai/tools";

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; ok: boolean; brief: string; data: unknown }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

interface EvidenceEntry {
  id: string;
  name: string;
  args: Record<string, unknown>;
  brief: string;
}

const MAX_ROUNDS = 5;

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "你是 FinSight 的资深投研助手，服务于个人投资者。今天是 " + today + "。",
    "你的工作流程：先调用工具获取真实数据，再基于数据进行分析。",
    "严格要求：",
    "1. 所有行情、财务、技术指标、资讯结论必须来自工具返回的真实数据，禁止编造任何数字或事实。",
    "2. 当用户提到某个标的但你不确定其市场与代码时，先用 search_symbol 解析。",
    "3. 做个股研究时，尽量综合调用 get_quote、get_kline/get_indicators、get_financials、get_news，必要时 run_backtest。",
    "4. 数据缺失或工具失败时如实说明，不要用假设数据填充。",
    "5. 正文中每一个来自工具的关键数字或结论后面，必须紧跟对应的证据编号，格式为 [E1]、[E2]...",
    "   证据编号会在调用完工具后以「可用证据」列表提供给你，禁止编造列表中不存在的编号，也不要在没有证据支撑的地方乱标编号。",
    "输出格式（Markdown，中文）：",
    "## 核心结论（先给观点与置信度）",
    "## 行情与趋势",
    "## 技术面",
    "## 基本面 / 估值",
    "## 资讯与催化",
    "## 风险提示",
    "在结尾附一行：> 本内容由 AI 基于公开数据生成，仅供研究参考，不构成投资建议。",
    "语言专业、客观、简洁，关键数字标注来源（如：来自实时行情/财务接口）。",
  ].join("\n");
}

export async function* runAgent(userMessages: ChatMessage[]): AsyncGenerator<AgentEvent> {
  const cfg = getChatConfig();
  if (!cfg.ok) {
    yield {
      type: "error",
      message: `大模型未配置：请在 .env.local 中设置 ${cfg.missing!.join("、")}（参考 .env.example）`,
    };
    return;
  }

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt() }, ...userMessages];
  const evidences: EvidenceEntry[] = [];
  let evidenceSeq = 0;

  try {
    // ---- 工具调研阶段 ----
    for (let round = 0; round < MAX_ROUNDS; round++) {
      yield { type: "status", text: round === 0 ? "正在理解问题并规划调研…" : "正在进一步分析数据…" };
      const res = await chatComplete({ messages, tools: TOOL_SPECS, toolChoice: "auto" });

      if (!res.toolCalls || res.toolCalls.length === 0) break;

      messages.push({ role: "assistant", content: res.content ?? "", tool_calls: res.toolCalls });

      for (const tc of res.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        const id = `E${++evidenceSeq}`;
        yield { type: "tool_call", id, name: tc.function.name, args };
        const outcome = await executeTool(tc.function.name, args);
        yield { type: "tool_result", id, name: tc.function.name, ok: outcome.ok, brief: outcome.brief, data: outcome.data };
        if (outcome.ok) evidences.push({ id, name: tc.function.name, args, brief: outcome.brief });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(outcome.data ?? { error: outcome.brief }),
        });
      }
    }

    // ---- 研报合成阶段（流式） ----
    yield { type: "status", text: "正在生成研报…" };
    const evidenceTable =
      evidences.length > 0
        ? "可用证据编号（正文中用 [E1] 这类编号引用，禁止编造列表外的编号）：\n" +
          evidences.map((e) => `${e.id} = ${e.name}(${JSON.stringify(e.args)}) → ${e.brief}`).join("\n")
        : "本次未成功获取到工具数据，正文中不要标注任何证据编号。";
    messages.push({
      role: "user",
      content: `请基于以上获取到的真实数据，按要求的 Markdown 结构输出最终研报。\n\n${evidenceTable}`,
    });
    for await (const delta of chatStream({ messages, toolChoice: "none" })) {
      yield { type: "token", text: delta };
    }
    yield { type: "done" };
  } catch (err) {
    yield { type: "error", message: (err as Error).message };
  }
}
