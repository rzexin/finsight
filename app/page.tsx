import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { MarketPulse } from "@/components/home/MarketPulse";
import {
  IconSpark,
  IconArrow,
  IconChart,
  IconEye,
  IconFlask,
  IconNews,
  IconPulse,
} from "@/components/ui/icons";

const FEATURES = [
  { icon: IconSpark, t: "AI 研究助手", d: "自然语言提问，自动多步调研生成研报", href: "/assistant", tone: "from-primary to-cyan" },
  { icon: IconChart, t: "全市场行情", d: "A股/港股/美股/加密 实时报价与榜单", href: "/market", tone: "from-cyan to-primary" },
  { icon: IconPulse, t: "个股深度分析", d: "K线 + 技术指标 + 财务估值 + AI多空", href: "/market", tone: "from-violet to-primary" },
  { icon: IconEye, t: "观察池 + 信号", d: "异动/技术信号实时评估与 AI 解读", href: "/watchlist", tone: "from-primary to-violet" },
  { icon: IconFlask, t: "策略回测", d: "真实历史数据回测，AI 复盘总结", href: "/backtest", tone: "from-warn to-up" },
  { icon: IconNews, t: "资讯 + AI 解读", d: "多源资讯聚合，情绪与事件抽取", href: "/news", tone: "from-cyan to-violet" },
];

const PAINS = [
  { n: "01", t: "信息过载", d: "资讯碎片化、噪音多，难以快速提取关键信号", s: "AI 资讯聚合 + 情绪/事件解读" },
  { n: "02", t: "研究门槛高", d: "财务、技术指标专业且分散，新手难入门", s: "一句话调研，自动汇总多维数据" },
  { n: "03", t: "策略难验证", d: "想法缺乏便捷的回测与量化验证工具", s: "内置策略回测引擎 + 真实历史数据" },
  { n: "04", t: "复盘耗时", d: "缺乏系统化框架，交易复盘低效", s: "AI 结构化复盘与风险提示" },
];

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="grid items-center gap-8 pt-2 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="animate-rise">
          <div className="chip mb-5">
            <span className="h-2 w-2 rounded-full bg-down" style={{ animation: "fs-pulse 2s infinite" }} />
            全市场覆盖 · A股 / 港股 / 美股 / 加密
          </div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            个人投资者的
            <br />
            <span className="text-gradient">智能投研驾驶舱</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
            FinSight 以 AI 研究助手为核心，串联真实行情、资讯、财务、技术分析、策略回测与信号提醒，
            把碎片化信息变成系统化的研究决策。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/assistant" className="btn-neon">
              <IconSpark width={18} height={18} />
              开始一次研究
              <IconArrow width={16} height={16} />
            </Link>
            <Link href="/market" className="btn-ghost">
              <IconChart width={18} height={18} />
              浏览全市场行情
            </Link>
          </div>
          <div className="mt-8 flex gap-6">
            {[
              { k: "4", v: "覆盖市场" },
              { k: "7+", v: "AI 调研工具" },
              { k: "T+0", v: "实时行情" },
            ].map((s) => (
              <div key={s.v}>
                <div className="font-display text-2xl font-bold text-gradient">{s.k}</div>
                <div className="text-xs text-muted">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="animate-rise" style={{ animationDelay: "120ms" }}>
          <MarketPulse />
        </div>
      </section>

      {/* 功能矩阵 */}
      <section>
        <div className="mb-6">
          <div className="kicker mb-1.5">Capabilities</div>
          <h2 className="font-display text-2xl font-bold text-ink">六大能力，一站式投研</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Link key={f.t} href={f.href} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <GlassCard className="group h-full p-5">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${f.tone} text-white shadow-[0_8px_22px_-10px_var(--glow-primary)]`}>
                    <Icon width={20} height={20} />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold text-ink">{f.t}</h3>
                  <p className="mt-1.5 text-sm text-muted">{f.d}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                    进入 <IconArrow width={13} height={13} />
                  </span>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 痛点 → 解法 */}
      <section>
        <div className="mb-6">
          <div className="kicker mb-1.5">Pain Points · Solved</div>
          <h2 className="font-display text-2xl font-bold text-ink">直击个人投资者四大痛点</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PAINS.map((p, i) => (
            <GlassCard key={p.n} className="animate-rise p-5" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="font-display text-3xl font-bold text-line-strong">{p.n}</div>
              <h3 className="mt-2 font-display text-lg font-bold text-ink">{p.t}</h3>
              <p className="mt-1.5 text-sm text-muted">{p.d}</p>
              <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-primary/5 px-2.5 py-2 text-xs text-primary">
                <IconSpark width={14} height={14} className="mt-0.5 shrink-0" />
                <span>{p.s}</span>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section>
        <GlassCard neon className="relative overflow-hidden p-8 text-center sm:p-12">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(0,102,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,102,255,0.06) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage: "radial-gradient(circle at 50% 50%, #000, transparent 75%)",
              WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000, transparent 75%)",
            }}
          />
          <div className="relative">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              把每一次投资决策，建立在<span className="text-gradient">专业数据 + AI 洞察</span>之上
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
              所有行情、财务与资讯均来自公开真实接口，AI 仅做分析与整理，绝不编造数据。
            </p>
            <Link href="/assistant" className="btn-neon mx-auto mt-6">
              <IconSpark width={18} height={18} />
              立即体验 AI 研究助手
              <IconArrow width={16} height={16} />
            </Link>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
