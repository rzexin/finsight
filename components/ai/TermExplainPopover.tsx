"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { IconSpark, IconClose } from "@/components/ui/icons";

interface ExplainResult {
  term: string;
  definition: string;
  analogy: string;
  note: string;
}

interface Anchor {
  text: string;
  context: string;
  x: number; // 选区中心点（viewport 坐标）
  top: number;
  bottom: number;
}

const MAX_TERM_LEN = 40;
const TRIGGER_W = 100;
const CARD_W = 300;

// 只把「像术语/短语」的选区当作可解释对象：排除空选区、跨段落的大段文字
function isValidTerm(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > MAX_TERM_LEN) return false;
  if (/\n/.test(t)) return false;
  return /[\p{L}\p{N}]/u.test(t);
}

// 取选区所在段落/单元格的文字作为语境，帮助 AI 判断词义（不会展示给用户）
function extractContext(range: Range): string {
  const node = range.commonAncestorContainer;
  const el = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest(
    "p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6"
  );
  return (el?.textContent ?? "").trim().slice(0, 220);
}

function clampLeft(centerX: number, width: number): number {
  const margin = 10;
  return Math.min(Math.max(centerX - width / 2, margin), window.innerWidth - width - margin);
}

/**
 * 研报划词解释：在研究报告区域内选中词汇后，出现「AI 解释」按钮；
 * 点击后弹出科技感浮层，调用 /api/assistant/explain 获取面向新手的通俗解释。
 */
export function TermExplainPopover({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reqSeq = useRef(0);

  const dismiss = useCallback(() => {
    setAnchor(null);
    setOpen(false);
    setError(null);
    setResult(null);
  }, []);

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      // 点击浮层内部（重试/关闭按钮等）不重新计算选区
      if (cardRef.current?.contains(e.target as Node)) return;

      const container = targetRef.current;
      const sel = window.getSelection();
      if (!container || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        dismiss();
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        dismiss();
        return;
      }
      const text = sel.toString();
      if (!isValidTerm(text)) {
        dismiss();
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setAnchor({
        text: text.trim(),
        context: extractContext(range),
        x: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom,
      });
      setOpen(false);
      setError(null);
      setResult(null);
    };

    // 滚动/窗口变化会让已记录的坐标失效，直接收起，避免浮层错位悬空
    const onInvalidate = () => dismiss();

    document.addEventListener("mouseup", onMouseUp);
    window.addEventListener("scroll", onInvalidate, true);
    window.addEventListener("resize", onInvalidate);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("scroll", onInvalidate, true);
      window.removeEventListener("resize", onInvalidate);
    };
  }, [targetRef, dismiss]);

  const explain = useCallback(async () => {
    if (!anchor) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    const seq = ++reqSeq.current;
    try {
      const res = await fetch("/api/assistant/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: anchor.text, context: anchor.context }),
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
  }, [anchor]);

  if (!anchor) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={explain}
          style={{ left: clampLeft(anchor.x, TRIGGER_W), top: Math.max(anchor.top - 40, 8) }}
          className="term-explain-trigger fixed z-50 flex items-center gap-1.5 rounded-full border border-primary/40 bg-surface/95 px-3 py-1.5 text-[11px] font-semibold text-primary shadow-lg backdrop-blur-md cursor-pointer"
        >
          <IconSpark width={12} height={12} />
          AI 解释
        </button>
      )}
      {open && (
        <div
          ref={cardRef}
          style={{
            left: clampLeft(anchor.x, CARD_W),
            top: Math.min(anchor.bottom + 10, window.innerHeight - 230),
            width: CARD_W,
          }}
          className="term-explain-card fixed z-50"
        >
          <div className="term-explain-scanline" />
          <span className="term-explain-corner term-explain-corner-tl" />
          <span className="term-explain-corner term-explain-corner-tr" />
          <span className="term-explain-corner term-explain-corner-bl" />
          <span className="term-explain-corner term-explain-corner-br" />

          <div className="relative flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <span className="flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-primary to-cyan text-white">
                <IconSpark width={11} height={11} />
              </span>
              <span className="font-display text-[11px] font-bold tracking-wide text-primary">AI 术语解释</span>
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={dismiss}
              title="关闭"
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              <IconClose width={11} height={11} />
            </button>
          </div>

          <div className="relative px-3.5 py-3">
            <p className="mb-2 truncate text-sm font-bold text-ink">「{anchor.text}」</p>

            {loading && (
              <div className="space-y-1.5">
                <div className="skeleton h-2.5 w-full" />
                <div className="skeleton h-2.5 w-4/5" />
                <div className="skeleton h-2.5 w-3/5" />
              </div>
            )}

            {!loading && error && (
              <div className="flex items-center justify-between gap-2 text-xs text-up">
                <span>{error}</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={explain}
                  className="shrink-0 rounded-md border border-line px-2 py-1 text-[10px] text-ink-2 transition hover:border-primary/40 hover:text-primary cursor-pointer"
                >
                  重试
                </button>
              </div>
            )}

            {!loading && !error && result && (
              <div className="space-y-2 text-xs leading-relaxed text-ink-2">
                <p>{result.definition}</p>
                {result.analogy && (
                  <p className="rounded-lg border border-cyan/25 bg-cyan/5 px-2.5 py-1.5 text-[11px]">
                    <span className="font-semibold text-cyan">类比 · </span>
                    {result.analogy}
                  </p>
                )}
                {result.note && (
                  <p className="rounded-lg border border-warn/25 bg-warn/5 px-2.5 py-1.5 text-[11px]">
                    <span className="font-semibold text-warn">提示 · </span>
                    {result.note}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="relative border-t border-line px-3.5 py-1.5 text-center text-[9px] text-faint">
            AI 生成，仅供学习参考 · 不构成投资建议
          </div>
        </div>
      )}
    </>
  );
}
