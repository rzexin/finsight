"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import { fmtNum, fmtPct, changeClass, MARKET_CURRENCY } from "@/lib/format";
import type { MarketOverview, RankItem } from "@/types/finsight";

/** 指数按 region 而非 market 归类（IndexQuote 无 market 字段），映射到对应计价货币符号。 */
const INDEX_CURRENCY: Record<string, string> = {
  沪深: "¥",
  香港: "HK$",
  美国: "$",
};

function RankRow({ item, onClick }: { item: RankItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-primary/5"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{item.name || item.code}</span>
        <span className="tnum block text-[10px] text-faint">{item.code}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block text-[12px] font-semibold text-ink">
          {MARKET_CURRENCY[item.market]}
          {fmtNum(item.price)}
        </span>
        <span className={`tnum block text-[11px] font-bold ${changeClass(item.changePct)}`}>
          {fmtPct(item.changePct)}
        </span>
      </span>
    </button>
  );
}

export function MarketPulse() {
  const router = useRouter();
  const { data, error, loading } = useFetch<MarketOverview>("/api/market/overview", { pollMs: 30000 });

  const indices = data?.indices?.slice(0, 6) ?? [];
  const gainers = data?.gainers?.slice(0, 4) ?? [];
  const losers = data?.losers?.slice(0, 4) ?? [];
  const crypto = useMemo(() => (data?.crypto ?? []).slice(0, 6), [data]);

  return (
    <div className="glass-card neon-frame relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="kicker">Live Market Pulse</div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-down" style={{ animation: "fs-pulse 1.6s infinite" }} />
          实时数据 · 30s 刷新
        </span>
      </div>

      {loading && <div className="skeleton h-[420px] w-full rounded-xl" />}

      {error && !loading && (
        <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-semibold text-ink">行情数据暂不可用</p>
          <p className="max-w-xs text-xs text-muted">{error}</p>
          <p className="text-[11px] text-faint">坚持真实接口，不以模拟数据填充</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-4">
          {/* 核心指数 */}
          {indices.length > 0 && (
            <section>
              <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">核心指数</h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {indices.map((i) => (
                  <button
                    key={i.code}
                    onClick={() => router.push("/market")}
                    className="rounded-lg border border-line bg-bg/40 px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="truncate text-[12px] font-semibold text-ink">{i.name}</div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span className="tnum text-[11px] text-muted">
                        {INDEX_CURRENCY[i.region] ?? ""}
                        {fmtNum(i.price)}
                      </span>
                      <span className={`tnum text-[12px] font-bold ${changeClass(i.changePct)}`}>
                        {fmtPct(i.changePct)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 今日异动 */}
          {(gainers.length > 0 || losers.length > 0) && (
            <section className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {gainers.length > 0 && (
                <div>
                  <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-up">领涨</h3>
                  <div className="space-y-0.5">
                    {gainers.map((g) => (
                      <RankRow
                        key={`g-${g.code}`}
                        item={g}
                        onClick={() => router.push(`/stock/${g.market}/${g.code}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {losers.length > 0 && (
                <div>
                  <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-down">领跌</h3>
                  <div className="space-y-0.5">
                    {losers.map((l) => (
                      <RankRow
                        key={`l-${l.code}`}
                        item={l}
                        onClick={() => router.push(`/stock/${l.market}/${l.code}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 加密热点 */}
          {crypto.length > 0 && (
            <section>
              <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">加密热点</h3>
              <div className="flex flex-wrap gap-1.5">
                {crypto.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => router.push(`/stock/CRYPTO/${c.code}`)}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-bg/40 px-3 py-1.5 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="text-[12px] font-bold text-ink">{c.code}</span>
                    <span className={`tnum text-[11px] font-semibold ${changeClass(c.changePct)}`}>
                      {fmtPct(c.changePct)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
