import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
  neon = false,
  as: Tag = "div",
  style,
}: {
  children: ReactNode;
  className?: string;
  neon?: boolean;
  as?: "div" | "section" | "article";
  style?: React.CSSProperties;
}) {
  return (
    <Tag className={`glass-card ${neon ? "neon-frame" : ""} ${className}`} style={style}>
      {children}
    </Tag>
  );
}

export function SectionTitle({
  kicker,
  title,
  desc,
  action,
}: {
  kicker?: string;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <div className="kicker mb-1.5">{kicker}</div>}
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          {title}
        </h2>
        {desc && <p className="mt-1.5 max-w-2xl text-sm text-muted">{desc}</p>}
      </div>
      {action}
    </div>
  );
}
