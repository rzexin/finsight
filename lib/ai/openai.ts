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

// 大模型上游偶发会出现「连接建立成功但迟迟不返回任何数据」的静默卡死
// （网关排队、供应商侧异常等），此时原生 fetch 会无限期挂起——不会报错、
// 也不会超时。这类挂起是页面「一直转圈、永远卡住」的根本原因之一。
// 这里用 AbortController 包一层可控超时；同时兼容外部传入的 signal（如未来
// 支持用户手动取消）。
function withTimeoutSignal(ms: number, external?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onExternalAbort = () => ctrl.abort();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener("abort", onExternalAbort);
  }
  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

const TIMEOUT_MESSAGE = "大模型响应超时，请稍后重试或缩小问题范围（如减少对比标的数量）";

interface CompletionOpts {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none";
  temperature?: number;
  maxTokens?: number;
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
    // 防止个别模型/网关在异常情况下不停止生成，拖垮上下文与内存
    max_tokens: opts.maxTokens ?? 2000,
    stream: false,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }

  // 非流式调用（工具决策轮次）：整体超时兜底，避免上游静默挂起拖死整个调研流程
  const { signal, dispose } = withTimeoutSignal(45_000, opts.signal);
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new Error(TIMEOUT_MESSAGE);
    throw err;
  } finally {
    dispose();
  }
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

  const ctrl = new AbortController();
  const onExternalAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", onExternalAbort);
  }
  // 首字节超时：请求已发出但迟迟收不到响应头，判定为上游卡死
  const FIRST_BYTE_TIMEOUT_MS = 30_000;
  // 空闲超时：已开始吐字后，若连续这么久没有任何新增量到达，同样判定为异常卡死
  // ——正常流式输出的分片间隔通常在几百毫秒到几秒之间
  const IDLE_TIMEOUT_MS = 25_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armTimer = (ms: number) => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ctrl.abort(), ms);
  };
  const clearTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };
  const cleanup = () => {
    clearTimer();
    opts.signal?.removeEventListener("abort", onExternalAbort);
  };

  armTimer(FIRST_BYTE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        // 研报正文有明确的章节结构上限，设置较宽裕的 token 上限；
        // 防止极端情况下模型持续输出不收敛，导致文本无限增长拖垮浏览器标签页
        max_tokens: opts.maxTokens ?? 4000,
        stream: true,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    cleanup();
    if ((err as Error).name === "AbortError") throw new Error(TIMEOUT_MESSAGE);
    throw err;
  }
  if (!res.ok || !res.body) {
    cleanup();
    const t = await res.text().catch(() => "");
    throw new Error(`大模型接口错误 ${res.status}: ${t.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      let done: boolean, value: Uint8Array | undefined;
      try {
        const chunk = await reader.read();
        done = chunk.done;
        value = chunk.value;
      } catch (err) {
        if ((err as Error).name === "AbortError") throw new Error(TIMEOUT_MESSAGE);
        throw err;
      }
      if (done) break;
      // 收到数据说明连接仍然存活，重新计时（不再受首字节超时约束）
      armTimer(IDLE_TIMEOUT_MS);
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
  } finally {
    cleanup();
  }
}
