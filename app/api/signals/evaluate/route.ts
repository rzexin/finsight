import { NextRequest, NextResponse } from "next/server";
import { getKlineFor } from "@/lib/datasource";
import { evaluateSignals, DEFAULT_SIGNAL_CONFIG, type Signal, type SignalConfig } from "@/lib/signals";
import type { Market } from "@/types/finsight";

interface Body {
  items?: { market: Market; code: string; name?: string }[];
  config?: Partial<SignalConfig>;
}

// POST /api/signals/evaluate  { items:[{market,code,name}], config }
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "缺少 items" }, { status: 400 });
  }
  const config: SignalConfig = { ...DEFAULT_SIGNAL_CONFIG, ...(body?.config ?? {}) };

  const results = await Promise.allSettled(
    items.slice(0, 30).map(async (it) => {
      const { candles } = await getKlineFor(it.market, it.code, "1d", 80);
      if (candles.length < 5) return [] as Signal[];
      return evaluateSignals({ code: it.code, market: it.market, name: it.name, candles }, config);
    })
  );

  const signals: Signal[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") signals.push(...r.value);
    else failed++;
  }

  return NextResponse.json({
    signals,
    evaluated: items.length,
    failed,
    config,
    updatedAt: Date.now(),
  });
}
