"use client";

import type { NewsItem } from "@/types/finsight";
import { timeAgo } from "@/lib/format";

function sentimentBadge(s?: number) {
  if (s == null) return null;
  const tone = s > 0.15 ? "bg-up/10 text-up" : s < -0.15 ? "bg-down/10 text-down" : "bg-muted/10 text-muted";
  const label = s > 0.15 ? "偏多" : s < -0.15 ? "偏空" : "中性";
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>;
}

export function NewsList({ items, compact = false }: { items: NewsItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-muted">暂无相关资讯</p>;
  }
  return (
    <div className="divide-y divide-line">
      {items.map((n) => (
        <a
          key={n.id}
          href={n.url || "#"}
          target={n.url ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="block px-1 py-3 transition hover:bg-primary/[0.03]"
        >
          <div className="flex items-start justify-between gap-3">
            <p className={`font-semibold text-ink ${compact ? "text-sm" : "text-[15px]"} leading-snug`}>
              {n.title}
            </p>
            {sentimentBadge(n.sentiment)}
          </div>
          {!compact && n.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{n.summary}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-faint">
            {n.source && <span>{n.source}</span>}
            <span>·</span>
            <span>{timeAgo(n.ts)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
