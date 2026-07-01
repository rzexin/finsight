import { NextRequest } from "next/server";
import { runAgent } from "@/lib/ai/orchestrator";
import type { ChatMessage } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/assistant  { messages: [{role, content}], context?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const incoming = body?.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return new Response(JSON.stringify({ error: "缺少 messages" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages: ChatMessage[] = incoming
    .filter((m: { role?: string; content?: string }) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-12)
    .map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content ?? "").slice(0, 4000),
    }));

  if (body?.context && typeof body.context === "string") {
    messages.unshift({ role: "user", content: `[研究上下文] ${body.context.slice(0, 800)}` });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for await (const ev of runAgent(messages)) {
          send(ev);
        }
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
