// OpenAI 兼容 Chat Completions 客户端（服务端使用，密钥仅存于 env）

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatConfig {
  ok: boolean;
  baseUrl?: string;
  model?: string;
  missing?: string[];
}

export function getChatConfig(): ChatConfig {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  const missing: string[] = [];
  if (!baseUrl) missing.push("OPENAI_BASE_URL");
  if (!apiKey) missing.push("OPENAI_API_KEY");
  if (!model) missing.push("OPENAI_MODEL");
  return { ok: missing.length === 0, baseUrl, model, missing };
}

function endpoint(): string {
  const base = (process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

interface CompletionOpts {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none";
  temperature?: number;
  signal?: AbortSignal;
}

interface CompletionResult {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
}

/** 非流式补全（用于工具决策轮次） */
export async function chatComplete(opts: CompletionOpts): Promise<CompletionResult> {
  const cfg = getChatConfig();
  if (!cfg.ok) throw new Error(`大模型未配置：缺少 ${cfg.missing!.join(", ")}`);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    stream: false,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`大模型接口错误 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content ?? null,
    toolCalls: choice?.message?.tool_calls ?? [],
    finishReason: choice?.finish_reason ?? "stop",
  };
}

/** 流式补全（用于最终研报生成），逐段产出文本 */
export async function* chatStream(opts: CompletionOpts): AsyncGenerator<string> {
  const cfg = getChatConfig();
  if (!cfg.ok) throw new Error(`大模型未配置：缺少 ${cfg.missing!.join(", ")}`);

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`大模型接口错误 ${res.status}: ${t.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        // 忽略心跳/不完整分片
      }
    }
  }
}
