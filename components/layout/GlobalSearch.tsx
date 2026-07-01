"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconClose } from "@/components/ui/icons";
import { MARKET_LABEL, type Market } from "@/types/finsight";
import { MARKET_BADGE } from "@/lib/format";

type SearchItem = {
  code: string;
  market: Market;
  name: string;
  secid?: string;
  extra?: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
        signal: ctrl.signal,
      }).catch(() => null);
      setLoading(false);
      if (!res) return;
      if (!res.ok) {
        setError("搜索服务暂不可用");
        setItems([]);
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.items) {
        setItems(data.items.slice(0, 10));
        setActive(0);
      }
    }, 260);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = (it: SearchItem) => {
    setOpen(false);
    setQ("");
    setItems([]);
    router.push(`/stock/${it.market}/${encodeURIComponent(it.code)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 transition focus-within:border-primary/50">
        <IconSearch className="shrink-0 text-muted" width={17} height={17} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="搜索股票 / 加密货币  (代码或名称)"
          className="w-full bg-transparent text-sm text-ink placeholder:text-faint outline-none"
        />
        {q ? (
          <button
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="text-faint hover:text-ink cursor-pointer"
            aria-label="清除"
          >
            <IconClose width={15} height={15} />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-line-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium text-faint sm:block">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (q.trim() || loading) && (
        <div className="glass animate-rise absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[60vh] overflow-auto rounded-xl p-1.5">
          {loading && (
            <div className="px-3 py-3">
              <div className="skeleton h-9 w-full" />
            </div>
          )}
          {!loading && error && (
            <div className="px-3 py-4 text-sm text-muted">{error}</div>
          )}
          {!loading && !error && items.length === 0 && q.trim() && (
            <div className="px-3 py-4 text-sm text-muted">
              未找到「{q}」相关标的
            </div>
          )}
          {!loading &&
            items.map((it, i) => (
              <button
                key={`${it.market}-${it.code}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(it)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition cursor-pointer ${
                  i === active ? "bg-primary/8" : "hover:bg-primary/5"
                }`}
              >
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MARKET_BADGE[it.market]}`}
                >
                  {MARKET_LABEL[it.market]}
                </span>
                <span className="tnum text-sm font-semibold text-ink">{it.code}</span>
                <span className="truncate text-sm text-muted">{it.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
