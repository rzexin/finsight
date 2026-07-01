"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Markdown } from "@/components/ai/Markdown";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconSpark, IconArrow, IconBolt, IconDownload, IconCopy, IconCheck, IconClose } from "@/components/ui/icons";

// 打印 / 导出 PDF 用的独立样式（脱离 Tailwind 运行时）
const PRINT_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1f2733;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7}
.report{max-width:820px;margin:0 auto;padding:48px 40px}
.report-header{margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #2563eb}
.report-header h1{margin:0;font-size:24px;font-weight:700;color:#111;line-height:1.35}
.report-meta{margin-top:8px;font-size:12px;color:#8a93a3}
.report .font-bold,.report strong{font-weight:700;color:#111}
.report .font-semibold{font-weight:600}
.report .text-lg{font-size:1.15rem;margin:1.4em 0 .6em;border-left:4px solid #2563eb;padding-left:10px}
.report .text-base{font-size:1rem;margin:1.1em 0 .4em;font-weight:600}
.report p{margin:.6em 0}
.report ul,.report ol{margin:.5em 0;padding-left:1.6em}
.report li{margin:.3em 0}
.report em,.report .italic{font-style:italic}
.report del,.report .line-through{text-decoration:line-through;color:#888}
.report code{background:#f1f3f7;border-radius:4px;padding:2px 5px;font-size:.88em;color:#2563eb;font-family:ui-monospace,Menlo,Consolas,monospace}
.report pre{background:#f6f8fa;border:1px solid #e4e8ee;border-radius:8px;padding:12px;overflow:auto}
.report pre code{background:none;color:#222;padding:0}
.report blockquote{border-left:3px solid #93b4ff;background:#f3f7ff;margin:1em 0;padding:8px 14px;color:#5a6472;border-radius:0 6px 6px 0}
.report hr{border:none;border-top:1px solid #e4e8ee;margin:1.6em 0}
.report a{color:#2563eb;text-decoration:underline}
.report table{width:100%;border-collapse:collapse;margin:1em 0;font-size:.92em}
.report th,.report td{border:1px solid #e1e6ee;padding:8px 12px;text-align:left}
.report th{background:#f5f7fa;font-weight:600}
.report tbody tr:nth-child(even){background:#fafbfc}
@page{margin:0}
@media print{.report{padding:24px 32px}}
`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}
interface TimelineItem {
  kind: "status" | "tool";
  text: string;
  name?: string;
  ok?: boolean;
  pending?: boolean;
}

const TOOL_LABEL: Record<string, string> = {
  search_symbol: "解析标的",
  get_quote: "获取实时行情",
  get_kline: "拉取K线数据",
  get_indicators: "计算技术指标",
  get_financials: "读取财务估值",
  get_news: "检索市场资讯",
  run_backtest: "运行策略回测",
};

const SUGGESTIONS = [
  "分析贵州茅台当前的技术面和估值，给出研判",
  "对比腾讯控股与阿里巴巴的近期走势",
  "比特币最近趋势如何？有哪些风险？",
  "用均线交叉策略回测宁德时代并复盘",
];

export function AssistantConsole() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [report, setReport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const reportRef = useRef("");
  const reportEndRef = useRef<HTMLDivElement>(null);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const send = useCallback(
    async (prompt: string, context?: string) => {
      const text = prompt.trim();
      if (!text || running) return;
      setError(null);
      setReport("");
      reportRef.current = "";
      setTimeline([]);
      setViewIndex(null);
      const history = [...messages, { role: "user" as const, content: text }];
      setMessages(history);
      setInput("");
      setRunning(true);

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context }),
      }).catch(() => null);

      if (!res || !res.ok || !res.body) {
        setError("无法连接 AI 服务，请检查 .env.local 中的大模型配置");
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const handle = (ev: Record<string, unknown>) => {
        switch (ev.type) {
          case "status":
            setTimeline((t) => [...t, { kind: "status", text: String(ev.text) }]);
            break;
          case "tool_call":
            setTimeline((t) => [
              ...t,
              { kind: "tool", name: String(ev.name), text: TOOL_LABEL[String(ev.name)] ?? String(ev.name), pending: true },
            ]);
            break;
          case "tool_result":
            setTimeline((t) => {
              const copy = [...t];
              for (let i = copy.length - 1; i >= 0; i--) {
                if (copy[i].kind === "tool" && copy[i].name === ev.name && copy[i].pending) {
                  copy[i] = { ...copy[i], pending: false, ok: Boolean(ev.ok), text: `${copy[i].text} · ${ev.brief}` };
                  break;
                }
              }
              return copy;
            });
            break;
          case "token":
            reportRef.current += String(ev.text);
            setReport(reportRef.current);
            break;
          case "error":
            setError(String(ev.message));
            break;
        }
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            handle(JSON.parse(payload));
          } catch {
            /* ignore */
          }
        }
      }

      setRunning(false);
      if (reportRef.current.trim()) {
        setMessages((m) => [...m, { role: "assistant", content: reportRef.current }]);
      }
    },
    [messages, running]
  );

  // 处理来自个股页的「一键深研」预填
  useEffect(() => {
    if (startedRef.current) return;
    const q = params.get("q");
    const symbol = params.get("symbol");
    const name = params.get("name");
    if (symbol) {
      startedRef.current = true;
      const label = name ? `${name}（${symbol}）` : symbol;
      send(`请对 ${label} 做一次完整的投研分析：综合行情、技术面、基本面、相关资讯，给出研判与风险提示。`, symbol);
    } else if (q) {
      startedRef.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    reportEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [report]);

  // 右侧研报展示：running 时强制看实时；否则可回看历史某条 assistant 报告
  const latestReport =
    report || (messages.length && messages[messages.length - 1].role === "assistant" ? messages[messages.length - 1].content : "");
  const historyReport =
    viewIndex != null && !running && messages[viewIndex]?.role === "assistant" ? messages[viewIndex].content : null;
  const viewingHistory = historyReport != null;
  const liveReport = historyReport ?? latestReport;
  // 当前研报对应的提问（用于生成标题）
  const prevMsg = viewIndex != null ? messages[viewIndex - 1] : undefined;
  const reportQuestion = viewingHistory
    ? prevMsg?.role === "user"
      ? prevMsg.content
      : ""
    : [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const fileStamp = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };

  // 标题优先「本次触发研报的问题」归纳，其次退化到研报首个标题
  const reportTitle = (() => {
    if (!liveReport) return "投研研究报告";
    let title = reportQuestion.trim();

    // 「一键深研」自动模板：请对 X 做一次完整的投研分析：…… → 归纳为「X 投研分析」
    const deep = /请对\s*(.+?)\s*做一次完整的投研分析/.exec(title);
    if (deep) {
      title = `${deep[1]} 投研分析`;
    } else if (title) {
      // 普通提问：取首句（到第一个分隔标点为止）
      const seg = title.split(/[：:。！？!?\n]/)[0].trim();
      if (seg) title = seg;
    }

    // 退化：研报首个 Markdown 标题
    if (!title) {
      for (const l of liveReport.split("\n")) {
        const h = /^#{1,6}\s+(.+)$/.exec(l.trim());
        if (h) {
          title = h[1];
          break;
        }
      }
    }

    // 清洗：去 Markdown 标记 + 非法文件名字符
    title = title
      .replace(/[*`~#>_]/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (title.length > 40) title = title.slice(0, 40);
    return title || "投研研究报告";
  })();

  const downloadMarkdown = () => {
    if (!liveReport) return;
    const blob = new Blob([liveReport], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportTitle}-${fileStamp()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    if (!liveReport) return;
    try {
      await navigator.clipboard.writeText(liveReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("复制失败，浏览器未授权剪贴板权限");
    }
  };

  const printReport = () => {
    const node = reportContentRef.current;
    if (!node || !liveReport) return;
    const w = window.open("", "_blank", "width=900,height=720");
    if (!w) {
      setError("无法打开打印窗口，请检查浏览器弹窗拦截设置");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
    const header = `<header class="report-header"><h1>${esc(reportTitle)}</h1><div class="report-meta">FinSight 投研助手 · 生成于 ${stamp}</div></header>`;
    w.document.write(
      `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(reportTitle)}</title><style>${PRINT_CSS}</style></head><body><div class="report fs-markdown">${header}${node.innerHTML}</div></body></html>`
    );
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  const hasReport = Boolean(liveReport && !running);

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      {/* 左：对话 */}
      <div className="flex flex-col gap-4">
        <GlassCard className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-cyan text-white">
              <IconSpark width={16} height={16} />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-ink">研究对话</p>
              <p className="text-[11px] text-faint">多轮提问 · 自动调研真实数据</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-auto pr-1">
            {messages.length === 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted">试试这些问题：</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs text-ink-2 transition hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[88%] rounded-2xl bg-gradient-to-br from-primary to-[#2b8bff] px-3 py-2 text-sm text-white">
                      {m.content}
                    </div>
                  </div>
                );
              }
              const activeView = viewIndex === i && !running;
              return (
                <div key={i} className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setViewIndex(i)}
                    disabled={running}
                    title="在右侧查看这份研报"
                    className={`flex max-w-[88%] items-center gap-1.5 rounded-2xl border px-3 py-2 text-left text-sm transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                      activeView
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-line bg-surface text-ink-2 hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    <IconArrow width={13} height={13} />
                    <span>{activeView ? "查看研报（当前显示）" : "查看研报"}</span>
                  </button>
                </div>
              );
            })}

            {/* 调研时间线 */}
            {(running || timeline.length > 0) && (
              <div className="rounded-xl border border-line bg-surface-2/60 p-3">
                <p className="kicker mb-2">调研过程</p>
                <div className="space-y-1.5">
                  {timeline.map((t, i) => {
                    const isLast = i === timeline.length - 1;
                    // running 时：status 仅最后一条为进行中，tool 看 pending；非 running 时全部视作完成
                    const active = running && (t.kind === "status" ? isLast : !!t.pending);
                    const failed = t.kind === "tool" && t.pending === false && t.ok === false;
                    // 完成后的阶段文案去掉「正在…」与省略号，读起来像已完成的清单项
                    const text =
                      t.kind === "status" && !active
                        ? t.text.replace(/^正在/, "").replace(/[….·]+$/, "").trim()
                        : t.text;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {active ? (
                          <span className="grid h-4 w-4 shrink-0 place-items-center">
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                          </span>
                        ) : failed ? (
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-up/15 text-up">
                            <IconClose width={10} height={10} strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-down/15 text-down">
                            <IconCheck width={10} height={10} strokeWidth={3} />
                          </span>
                        )}
                        <span className={active ? "text-muted" : "text-ink-2"}>{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mt-3 flex items-end gap-2"
          >
            <div className="glass flex flex-1 items-center rounded-xl px-3 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入你的研究问题…"
                disabled={running}
                className="w-full bg-transparent text-sm text-ink placeholder:text-faint outline-none disabled:opacity-60"
              />
            </div>
            <button type="submit" disabled={running || !input.trim()} className="btn-neon px-3 disabled:opacity-50 disabled:cursor-not-allowed">
              {running ? <span className="animate-spin-slow"><IconBolt width={16} height={16} /></span> : <IconArrow width={16} height={16} />}
            </button>
          </form>
        </GlassCard>
      </div>

      {/* 右：研报 */}
      <GlassCard neon className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-down" style={{ animation: running ? "fs-pulse 1.4s infinite" : "none" }} />
            <p className="font-display text-sm font-bold text-ink">研究报告</p>
            {viewingHistory && (
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-muted">历史回看</span>
            )}
          </div>
          {running ? (
            <span className="text-[11px] text-muted">生成中…</span>
          ) : (
            hasReport && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={copyReport}
                  title="复制 Markdown"
                  className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-2 transition hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                >
                  {copied ? <IconCheck width={13} height={13} /> : <IconCopy width={13} height={13} />}
                  {copied ? "已复制" : "复制"}
                </button>
                <button
                  onClick={downloadMarkdown}
                  title="下载 Markdown 文件"
                  className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-2 transition hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                >
                  <IconDownload width={13} height={13} />
                  .md
                </button>
                <button
                  onClick={printReport}
                  title="打印 / 另存为 PDF"
                  className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/15 cursor-pointer"
                >
                  <IconDownload width={13} height={13} />
                  PDF
                </button>
              </div>
            )
          )}
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-up/30 bg-up/5 px-4 py-3 text-sm text-up">
              <IconBolt width={18} height={18} />
              <span>{error}</span>
            </div>
          )}
          {!error && !liveReport && !running && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted">
              <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/8 text-primary animate-float">
                <IconSpark width={26} height={26} />
              </span>
              <p className="font-display text-base font-semibold text-ink">开始你的第一次研究</p>
              <p className="mt-1 max-w-sm text-sm">提出问题，AI 将自动调用真实行情、财务与资讯数据，生成结构化研报。</p>
            </div>
          )}
          {liveReport && (
            <div ref={reportContentRef}>
              <Markdown content={liveReport} />
            </div>
          )}
          {running && liveReport && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />}
          <div ref={reportEndRef} />
        </div>
      </GlassCard>
    </div>
  );
}
