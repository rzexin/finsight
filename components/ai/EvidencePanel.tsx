"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconClose } from "@/components/ui/icons";

export interface EvidenceItem {
  id: string; // E1
  name: string; // 工具名，如 get_quote
  label: string; // 中文标签，如 获取实时行情
  source: string; // 数据源提供方，如 东方财富 / 币安 Binance
  args: Record<string, unknown>;
  brief: string;
  ok: boolean;
  pending: boolean;
  data: unknown;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`).join(" · ");
}

export function EvidencePanel({
  items,
  activeId,
  onClose,
}: {
  items: EvidenceItem[];
  activeId: string | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  // activeId 由父组件在每次点击证据徽章时附加时间戳生成，故此处只做纯派生、不需要额外状态
  const activePlainId = activeId ? activeId.split(":")[0] : null;

  // 仅做外部 DOM 交互（滚动定位），不在 effect 内调用 setState
  useEffect(() => {
    if (!activePlainId) return;
    refs.current[activePlainId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeId, activePlainId]);

  return (
    <div className="absolute inset-y-0 right-0 z-10 flex w-[320px] max-w-[85%] flex-col border-l border-line bg-surface/95 backdrop-blur-xl shadow-[-12px_0_30px_-15px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <p className="font-display text-sm font-bold text-ink">证据面板</p>
          <p className="text-[11px] text-faint">本次研报调用的 {items.length} 条真实数据</p>
        </div>
        <button
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink cursor-pointer"
          title="关闭"
        >
          <IconClose width={14} height={14} />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-3">
        {items.length === 0 && (
          <p className="pt-6 text-center text-xs text-muted">暂无证据，等待工具调用完成…</p>
        )}
        {items.map((it) => {
          const isActive = activePlainId === it.id;
          const isOpen = !!expanded[it.id] || isActive;
          return (
            <div
              // 命中的证据在 activeId 变化时用新 key 强制重挂载，从而重新播放高亮动画；
              // 未命中的项 key 保持不变，不受影响
              key={isActive ? `${it.id}:${activeId}` : it.id}
              ref={(el) => {
                refs.current[it.id] = el;
              }}
              className={`rounded-xl border border-line bg-surface-2/50 px-3 py-2 ${
                isActive ? "animate-evidence-flash" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [it.id]: !e[it.id] }))}
                className="flex w-full items-start gap-2 text-left cursor-pointer"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-[10px] font-bold text-primary">
                  {it.id.slice(1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-ink">{it.label}</span>
                    {it.pending ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                    ) : it.ok ? (
                      <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-down/15 text-down">
                        <IconCheck width={9} height={9} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-up/15 text-up">
                        <IconClose width={9} height={9} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  {it.source && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-cyan/30 bg-cyan/10 px-1.5 py-px text-[10px] font-medium text-cyan">
                      数据源 · {it.source}
                    </span>
                  )}
                  {formatArgs(it.args) && (
                    <span className="mt-0.5 block truncate text-[11px] text-faint">{formatArgs(it.args)}</span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-ink-2">{it.brief}</span>
                </span>
              </button>
              {isOpen && !it.pending && (
                <pre className="tnum mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-surface p-2 text-[10px] leading-relaxed text-ink-2">
                  {JSON.stringify(it.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
