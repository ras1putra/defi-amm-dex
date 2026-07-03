"use client";

import { useEffect, useRef, useCallback } from "react";
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type Time } from "lightweight-charts";
import type { OHLCVBar } from "@/types/analytics";
import { hideTradingViewLogo } from "./chart-utils";
import { formatTinyPrice } from "@/lib/format";

interface TradingChartProps {
  data: OHLCVBar[];
  height?: number;
  className?: string;
}

export default function TradingChart({ data, height = 400, className = "" }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.4)",
        fontSize: 11,
        fontFamily: "'DM Mono', monospace",
      },
      localization: {
        priceFormatter: (price: number) => formatTinyPrice(price),
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(110,231,183,0.3)", width: 1, style: 2, labelBackgroundColor: "#1a1a1a" },
        horzLine: { color: "rgba(110,231,183,0.3)", width: 1, style: 2, labelBackgroundColor: "#1a1a1a" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#6EE7B7",
      downColor: "#EF4444",
      borderUpColor: "#6EE7B7",
      borderDownColor: "#EF4444",
      wickUpColor: "#6EE7B7",
      wickDownColor: "#EF4444",
      priceFormat: { type: "price", precision: 10, minMove: 0.0000000001 },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(110,231,183,0.3)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    hideTradingViewLogo(containerRef.current);

    return chart;
  }, []);

  useEffect(() => {
    const chart = initChart();
    if (!chart) return;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [initChart]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !data.length) return;

    // Map to deduplicate by timestamp in seconds
    const uniqueCandles = new Map<number, CandlestickData>();
    const uniqueVolume = new Map<number, HistogramData>();

    for (const bar of data) {
      const timeInSecs = Math.floor(bar.timestamp / 1000);
      uniqueCandles.set(timeInSecs, {
        time: timeInSecs as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
      uniqueVolume.set(timeInSecs, {
        time: timeInSecs as Time,
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(110,231,183,0.25)" : "rgba(239,68,68,0.25)",
      });
    }

    // Sort ascending by time
    const sortedTimes = Array.from(uniqueCandles.keys()).sort((a, b) => a - b);

    const candleData: CandlestickData[] = sortedTimes.map((time) => uniqueCandles.get(time)!);
    const volumeData: HistogramData[] = sortedTimes.map((time) => uniqueVolume.get(time)!);

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl overflow-hidden ${className}`}
      style={{ height }}
    />
  );
}
