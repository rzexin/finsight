"use client";

import { useState } from "react";
import Link from "next/link";
import { GlassCard, SectionTitle } from "@/components/ui/GlassCard";
import { LoadingPanel, ErrorPanel } from "@/components/ui/StateView";
import { NewsList } from "@/components/news/NewsList";
import { useFetch } from "@/lib/useFetch";
import type { NewsItem } from "@/types/finsight";
import { IconSpark, IconArrow, IconSearch } from "@/components/ui/icons";

const HOT = ["A股", "美联储", "新能源", "人工智能", "比特币", "半导体"];

export default function NewsPage() {
  const [keyword, setKeyword] = useState("");
  const [active, setActive] = useState("");
  const [draft, setDraft] = useState("");

  const url = active
    ? `/api/news?keyword=${encodeURIComponent(active)}&limit=24`
    : `/api/news?limit=40`;
  const pollMs = active ? 0 : 60000;
  const { data, error, loading, reload } = useFetch<{ items: NewsItem[] }>(url, { pollMs });

  const submit = (kw: string) => {
    setActive(kw);
    setKeyword(kw);
    setDraft(kw);
  };

  const digestPrompt = active
    ? `请检索并解读关于「${active}」的最新资讯：提炼关键事件、市场情绪倾向（偏多/偏空/中性）与潜在受影响标的。`
    : "请对当前市场最新资讯做一次情绪与重点事件速读，指出潜在受影响的板块与风险点。";

  return (
    <div className="animate-rise space-y-6">
      <SectionTitle
        kicker="News · AI Insight"
        title="资讯聚合 + AI 情绪解读"
        desc="聚合东方财富 7×24 快讯与全网财经资讯，结合 AI 做情绪与事件解读。"
      />

      {/* AI 速读 CTA */}
      <GlassCard neon className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet to-primary text-white animate-float">
            <IconSpark width={22} height={22} />
          </span>
          <div>
            <p className="font-display text-base font-bold text-ink">AI 市场情绪速读</p>
            <p className="text-sm text-muted">让 AI 实时检索资讯并提炼情绪、事件与受影响板块</p>
          </div>
        </div>
        <Link href={`/assistant?q=${encodeURIComponent(digestPrompt)}`} className="btn-neon shrink-0">
          <IconSpark width={16} height={16} /> 生成情绪速读 <IconArrow width={14} height={14} />
        </Link>
      </GlassCard>

      {/* 搜索 + 热词 */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft.trim());
          }}
          className="glass flex min-w-[260px] flex-1 items-center gap-2 rounded-xl px-3 py-2"
        >
          <IconSearch className="text-muted" width={17} height={17} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="搜索个股 / 主题资讯，如 贵州茅台、新能源"
            className="w-full bg-transparent text-sm text-ink placeholder:text-faint outline-none"
          />
        </form>
        {active && (
          <button onClick={() => submit("")} className="btn-ghost text-sm">
            返回快讯
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {HOT.map((h) => (
          <button
            key={h}
            onClick={() => submit(h)}
            className={`chip transition cursor-pointer hover:border-primary/40 hover:text-primary ${active === h ? "border-primary/50 text-primary" : ""}`}
          >
            {h}
          </button>
        ))}
      </div>

      {/* 资讯列表 */}
      <GlassCard className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-ink">
            {active ? `「${active}」相关资讯` : "全市场 7×24 快讯"}
          </h3>
          <span className="flex items-center gap-1.5 text-[11px] text-faint">
            {!active && <span className="h-1.5 w-1.5 rounded-full bg-down" style={{ animation: "fs-pulse 1.6s infinite" }} />}
            {active ? `${keyword}` : "60s 刷新"}
          </span>
        </div>
        {loading && <LoadingPanel rows={6} />}
        {error && !loading && <ErrorPanel detail={error} onRetry={reload} />}
        {data && <NewsList items={data.items} />}
      </GlassCard>
    </div>
  );
}
