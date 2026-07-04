"use client";

import { useEffect, useRef, useState } from "react";
import { IconSearch } from "@/components/ui/icons";
import { MARKET_LABEL, type Market } from "@/types/finsight";
import { MARKET_BADGE } from "@/lib/format";

interface Item {
  code: string;
  market: Market;
  name: string;
}

export function AddSymbol({ onAdd }: { onAdd: (it: Item) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setOpen(true);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div ref={boxRef} className="relative">
      <div className="glass flex items-center gap-2 rounded-xl px-3 py-2">
        <IconSearch className="text-muted" width={17} height={17} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          placeholder="搜索并添加标的到观察池…"
          className="w-full bg-transparent text-sm text-ink placeholder:text-faint outline-none"
        />
      </div>
      {open && items.length > 0 && (
        <div className="glass-header animate-rise absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-auto rounded-xl border border-line p-1.5">
          {items.map((it) => (
            <button
              key={`${it.market}-${it.code}`}
              onClick={() => {
                onAdd(it);
                setQ("");
                setItems([]);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-primary/5 cursor-pointer"
            >
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${MARKET_BADGE[it.market]}`}>
                {MARKET_LABEL[it.market]}
              </span>
              <span className="tnum text-sm font-semibold text-ink">{it.code}</span>
              <span className="truncate text-sm text-muted">{it.name}</span>
              <span className="ml-auto text-xs font-semibold text-primary">+ 添加</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
