"use client";

import { useMemo, useState } from "react";
import { GlassCard, SectionTitle } from "@/components/ui/GlassCard";
import { IconSearch, IconHelp } from "@/components/ui/icons";
import { GLOSSARY, type GlossaryCategory } from "@/lib/glossary";

const CATEGORY_ORDER: GlossaryCategory[] = [
  "基础概念",
  "估值指标",
  "技术指标",
  "回测指标",
  "信号规则",
  "资讯与情绪",
];

const CATEGORY_DESC: Record<GlossaryCategory, string> = {
  基础概念: "K 线、研报证据编号等贯穿全站的基础说法",
  估值指标: "个股详情页「估值与基本面」里出现的指标",
  技术指标: "K 线图、技术指标面板里的均线、RSI、MACD 等",
  回测指标: "策略回测结果与策略参数里的专业词汇",
  信号规则: "观察池信号提醒里用到的判断规则",
  资讯与情绪: "资讯列表 AI 情绪标注的含义",
};

export default function GlossaryPage() {
  const [q, setQ] = useState("");

  const grouped = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const filtered = kw
      ? GLOSSARY.filter(
          (e) =>
            e.term.toLowerCase().includes(kw) ||
            e.definition.toLowerCase().includes(kw) ||
            e.aliases?.some((a) => a.toLowerCase().includes(kw))
        )
      : GLOSSARY;
    const map = new Map<GlossaryCategory, typeof GLOSSARY>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const e of filtered) map.get(e.category)?.push(e);
    return map;
  }, [q]);

  const total = Array.from(grouped.values()).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="animate-rise space-y-6">
      <SectionTitle
        kicker="Glossary · Beginner Help"
        title="术语表 · 新手帮助中心"
        desc="把研报、个股详情、策略回测、观察池、资讯里常见的专业词汇汇总在这里，随时搜索速查。也可以在对应页面标签旁的「?」图标上点开同款解释。"
      />

      <div className="glass flex items-center gap-2 rounded-xl px-3 py-2.5">
        <IconSearch className="text-muted" width={17} height={17} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索术语，如 市盈率、RSI、夏普比率、金叉"
          className="w-full bg-transparent text-sm text-ink placeholder:text-faint outline-none"
        />
        <span className="shrink-0 text-[11px] text-faint">{total} 条</span>
      </div>

      {total === 0 && (
        <GlassCard className="flex flex-col items-center gap-2 p-10 text-center text-muted">
          <IconHelp width={28} height={28} />
          <p className="text-sm">没有找到匹配的术语，换个关键词试试</p>
        </GlassCard>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const entries = grouped.get(cat) ?? [];
        if (entries.length === 0) return null;
        return (
          <GlassCard key={cat} className="p-5">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-ink">{cat}</h3>
              <p className="mt-0.5 text-[11px] text-faint">{CATEGORY_DESC[cat]}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {entries.map((e) => (
                <div key={e.key} className="rounded-xl border border-line bg-surface px-3.5 py-3">
                  <p className="text-sm font-bold text-ink">{e.term}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">{e.definition}</p>
                  {e.analogy && (
                    <p className="mt-1.5 rounded-lg border border-cyan/25 bg-cyan/5 px-2 py-1 text-[11px] leading-relaxed text-ink-2">
                      <span className="font-semibold text-cyan">类比 · </span>
                      {e.analogy}
                    </p>
                  )}
                  {e.note && (
                    <p className="mt-1.5 rounded-lg border border-warn/25 bg-warn/5 px-2 py-1 text-[11px] leading-relaxed text-ink-2">
                      <span className="font-semibold text-warn">提示 · </span>
                      {e.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
