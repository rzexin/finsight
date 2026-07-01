import { notFound } from "next/navigation";
import { StockDetail } from "@/components/stock/StockDetail";
import type { Market } from "@/types/finsight";

const MARKETS: Market[] = ["CN", "HK", "US", "CRYPTO"];

export default async function StockPage({
  params,
}: {
  params: Promise<{ market: string; code: string }>;
}) {
  const { market, code } = await params;
  const m = market.toUpperCase() as Market;
  if (!MARKETS.includes(m) || !code) notFound();
  return <StockDetail market={m} code={decodeURIComponent(code)} />;
}
