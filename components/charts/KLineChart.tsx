"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, KlinePeriod } from "@/types/finsight";
import type { IndicatorBundle } from "@/lib/indicators";

const INTRADAY: KlinePeriod[] = ["60m", "30m", "15m", "5m"];

function timeOf(c: Candle, intraday: boolean): UTCTimestamp | string {
  if (intraday) return (c.ts / 1000) as UTCTimestamp;
  return c.date;
}

const MA_COLORS: Record<string, string> = {
  ma5: "#f5a623",
  ma10: "#0066ff",
  ma20: "#6c5ce7",
  ma60: "#11c08b",
};

export function KLineChart({
  candles,
  indicators,
  period,
  height = 420,
}: {
  candles: Candle[];
  indicators?: IndicatorBundle;
  period: KlinePeriod;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || candles.length === 0) return;
    const intraday = INTRADAY.includes(period);

    const chart = createChart(ref.current, {
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
      timeScale: { borderColor: "rgba(11,27,58,0.1)", timeVisible: intraday, rightOffset: 4 },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#ff3b46",
      downColor: "#11c08b",
      borderUpColor: "#ff3b46",
      borderDownColor: "#11c08b",
      wickUpColor: "#ff3b46",
      wickDownColor: "#11c08b",
    });
    candleSeries.setData(
      candles.map((c) => ({ time: timeOf(c, intraday), open: c.open, high: c.high, low: c.low, close: c.close })) as never
    );

    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(
      candles.map((c) => ({
        time: timeOf(c, intraday),
        value: c.volume,
        color: c.close >= c.open ? "rgba(255,59,70,0.4)" : "rgba(17,192,139,0.4)",
      })) as never
    );

    // 均线
    if (indicators) {
      (["ma5", "ma10", "ma20", "ma60"] as const).forEach((key) => {
        const arr = indicators[key];
        const line = chart.addLineSeries({ color: MA_COLORS[key], lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        const data = candles
          .map((c, i) => ({ time: timeOf(c, intraday), value: arr[i] }))
          .filter((d) => d.value != null);
        line.setData(data as never);
      });
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => chart.timeScale().fitContent());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, indicators, period, height]);

  return (
    <div className="relative">
      {indicators && (
        <div className="absolute left-2 top-1 z-10 flex gap-3 text-[11px] font-semibold">
          {(["ma5", "ma10", "ma20", "ma60"] as const).map((k) => (
            <span key={k} style={{ color: MA_COLORS[k] }}>
              {k.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} style={{ height }} />
    </div>
  );
}
