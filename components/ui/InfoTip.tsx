"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { findGlossaryEntry } from "@/lib/glossary";
import { clampCenterX } from "@/lib/viewport";
import { IconSpark, IconClose } from "@/components/ui/icons";

interface ExplainResult {
  definition: string;
  analogy: string;
  note: string;
}

const CARD_W = 280;

/**
 * 常驻的「?」术语速查图标：用于个股详情、策略回测、观察池、资讯等页面里
 * 固定的专业标签（如 PE、RSI、夏普比率）。优先查静态术语库（瞬时返回、内容可控），
 * 查不到时才退化调用 /api/assistant/explain（同一套受限系统提示词，AI 兜底）。
 *
 * @param term 用于查词库 / 传给 AI 解释接口的术语文本（如 "夏普比率"）
 * @param label 图标的 title 文案，默认与 term 相同
 */
export function InfoTip({ term, label }: { term: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);

  const staticEntry = findGlossaryEntry(term);
  const shown: ExplainResult | null = staticEntry
    ? { definition: staticEntry.definition, analogy: staticEntry.analogy ?? "", note: staticEntry.note ?? "" }
    : result;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (cardRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onScrollOrResize = () => close();
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, close]);

  const fetchExplain = useCallback(async () => {
    setLoading(true);
    setError(null);
    const seq = ++reqSeq.current;
    try {
      const res = await fetch("/api/assistant/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term }),
      });
      const data = await res.json().catch(() => null);
      if (seq !== reqSeq.current) return;
      if (!res.ok || !data || data.error) {
        setError((data && data.error) || "解释失败，请稍后重试");
      } else {
        setResult(data as ExplainResult);
      }
    } catch {
      if (seq === reqSeq.current) setError("网络异常，请稍后重试");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [term]);

  const toggle = (e: ReactMouseEvent) => {
    // InfoTip 常被放在可点击的卡片/链接内部（策略卡、信号卡等），必须阻止事件冒泡，
    // 否则点「?」会连带触发外层的选中/跳转
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      close();
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setPos({ left: clampCenterX(r.left + r.width / 2, CARD_W), top: r.bottom + 8 });
    }
    setOpen(true);
    if (!staticEntry && !result) fetchExplain();
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={`解释：${label ?? term}`}
        aria-label={`解释：${label ?? term}`}
        className="info-tip-btn"
      >
        ?
      </button>

      {open &&
        pos &&
        createPortal(
          // 用 portal 挂到 body 上，避免祖先卡片的 backdrop-filter/transform
          // 为 fixed 元素创建新的包含块，导致定位坐标基准错乱、浮层整体偏移
          <div
            ref={cardRef}
            style={{ left: pos.left, top: pos.top, width: CARD_W }}
            className="hud-card fixed z-50"
          >
            <div className="hud-scanline" />
            <span className="hud-corner hud-corner-tl" />
            <span className="hud-corner hud-corner-tr" />
            <span className="hud-corner hud-corner-bl" />
            <span className="hud-corner hud-corner-br" />

            <div className="relative flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="flex items-center gap-1.5">
                <span className="grid h-4 w-4 place-items-center rounded-md bg-gradient-to-br from-primary to-cyan text-white">
                  <IconSpark width={9} height={9} />
                </span>
                <span className="truncate text-xs font-bold text-ink">{label ?? term}</span>
              </span>
              <button
                type="button"
                onClick={close}
                title="关闭"
                className="grid h-4 w-4 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink cursor-pointer"
              >
                <IconClose width={10} height={10} />
              </button>
            </div>

            <div className="relative px-3 py-2.5">
              {loading && (
                <div className="space-y-1.5">
                  <div className="skeleton h-2.5 w-full" />
                  <div className="skeleton h-2.5 w-3/5" />
                </div>
              )}
              {!loading && error && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-up">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={fetchExplain}
                    className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-2 transition hover:border-primary/40 hover:text-primary cursor-pointer"
                  >
                    重试
                  </button>
                </div>
              )}
              {!loading && !error && shown && (
                <div className="space-y-1.5 text-[11px] leading-relaxed text-ink-2">
                  <p>{shown.definition}</p>
                  {shown.analogy && (
                    <p className="rounded-lg border border-cyan/25 bg-cyan/5 px-2 py-1">
                      <span className="font-semibold text-cyan">类比 · </span>
                      {shown.analogy}
                    </p>
                  )}
                  {shown.note && (
                    <p className="rounded-lg border border-warn/25 bg-warn/5 px-2 py-1">
                      <span className="font-semibold text-warn">提示 · </span>
                      {shown.note}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}
