"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, type IChartApi } from "lightweight-charts";
import type { EquityPoint } from "@/lib/backtest";

export function EquityChart({ data, height = 320 }: { data: EquityPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;
    const chart: IChartApi = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#5a6b8c",
        fontFamily: "var(--font-sans)",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(11,27,58,0.05)" },
        horzLines: { color: "rgba(11,27,58,0.05)" },
      },
      rightPriceScale: { borderColor: "rgba(11,27,58,0.1)" },
      timeScale: { borderColor: "rgba(11,27,58,0.1)" },
      crosshair: { mode: 1 },
      autoSize: true,
    });

    const strat = chart.addAreaSeries({
      lineColor: "#0066ff",
      topColor: "rgba(0,102,255,0.22)",
      bottomColor: "rgba(0,102,255,0.01)",
      lineWidth: 2,
    });
    strat.setData(data.map((d) => ({ time: d.date, value: d.strategy })) as never);

    const bench = chart.addLineSeries({
      color: "#9fb3d9",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    bench.setData(data.map((d) => ({ time: d.date, value: d.benchmark })) as never);

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.timeScale().fitContent());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [data, height]);

  return (
    <div>
      <div className="mb-2 flex gap-4 text-[11px] font-semibold">
        <span className="text-primary">— 策略净值</span>
        <span className="text-faint">--- 买入持有(基准)</span>
      </div>
      <div ref={ref} style={{ height }} />
    </div>
  );
}
