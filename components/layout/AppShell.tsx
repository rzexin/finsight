"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import {
  IconHome,
  IconSpark,
  IconChart,
  IconEye,
  IconFlask,
  IconNews,
  IconArrow,
  IconHelp,
} from "@/components/ui/icons";

const NAV = [
  { href: "/", label: "首页", icon: IconHome },
  { href: "/assistant", label: "AI 研究助手", icon: IconSpark },
  { href: "/market", label: "行情看板", icon: IconChart },
  { href: "/watchlist", label: "观察池", icon: IconEye },
  { href: "/backtest", label: "策略回测", icon: IconFlask },
  { href: "/news", label: "资讯", icon: IconNews },
  { href: "/glossary", label: "新手帮助", icon: IconHelp },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed inset-x-0 top-0 z-40">
        <div className="glass border-b border-line">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 lg:px-8">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-cyan shadow-[0_8px_22px_-8px_var(--glow-primary)]">
                <span className="absolute inset-0 animate-spin-slow rounded-xl border border-white/40" />
                <IconChart className="text-white" width={18} height={18} />
              </span>
              <span className="font-display text-lg font-bold tracking-wide text-ink">
                Fin<span className="text-gradient">Sight</span>
              </span>
            </Link>

            <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
              {NAV.map((n) => {
                const Icon = n.icon;
                const act = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      act
                        ? "bg-primary/10 text-primary"
                        : "text-muted hover:bg-primary/5 hover:text-ink"
                    }`}
                  >
                    <Icon width={16} height={16} />
                    {n.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex flex-1 items-center justify-end gap-3">
              <div className="hidden flex-1 justify-end md:flex">
                <GlobalSearch />
              </div>
              <Link href="/assistant" className="btn-neon text-sm">
                <IconSpark width={16} height={16} />
                <span className="hidden sm:inline">开始研究</span>
                <IconArrow width={15} height={15} />
              </Link>
            </div>
          </div>

          {/* mobile search + nav */}
          <div className="mx-auto max-w-[1400px] px-4 pb-3 md:hidden">
            <GlobalSearch />
          </div>
          <nav className="mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
            {NAV.map((n) => {
              const Icon = n.icon;
              const act = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    act ? "bg-primary/10 text-primary" : "text-muted"
                  }`}
                >
                  <Icon width={14} height={14} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-20 pt-[150px] lg:px-8 lg:pt-24">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1400px] px-4 py-8 lg:px-8">
          <div className="flex flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <span className="font-display tracking-wide">
              Fin<span className="text-gradient">Sight</span> · 智能投研驾驶舱
            </span>
            <span className="max-w-2xl text-xs leading-relaxed text-faint">
              数据来自公开数据源，仅供研究参考，不构成任何投资建议。市场有风险，投资需谨慎。
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
