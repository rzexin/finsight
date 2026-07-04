"use client";

import type { ReactNode } from "react";
import { IconBolt } from "@/components/ui/icons";

export function LoadingPanel({
  rows = 3,
  label,
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-3 p-1" role="status" aria-live="polite">
      {label && <p className="text-xs text-faint">{label}</p>}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

export function ErrorPanel({
  message = "数据加载失败",
  detail,
  onRetry,
}: {
  message?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-up/10 text-up">
        <IconBolt width={22} height={22} />
      </span>
      <div>
        <p className="font-semibold text-ink">{message}</p>
        {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
      </div>
      {onRetry && (
        <button className="btn-ghost text-sm" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function EmptyPanel({
  title = "暂无数据",
  desc,
  action,
}: {
  title?: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/8 text-primary">
        <IconBolt width={22} height={22} />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {desc && <p className="max-w-md text-sm text-muted">{desc}</p>}
      {action}
    </div>
  );
}
