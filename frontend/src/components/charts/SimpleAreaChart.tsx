"use client";

import { useEffect, useRef, useCallback } from "react";
import { createChart, ColorType, CrosshairMode, AreaSeries, type IChartApi, type ISeriesApi, type AreaData, type Time } from "lightweight-charts";
import { hideTradingViewLogo } from "./chart-utils";

interface SimpleAreaChartProps {
  data: { timestamp: number; value: number }[];
  color?: string;
  height?: number;
  className?: string;
  formatValue?: (v: number) => string;
}

export default function SimpleAreaChart({
  data,
  color = "#6EE7B7",
  height = 160,
  className = "",
}: SimpleAreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.3)",
        fontSize: 10,
        fontFamily: "'DM Mono', monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.1)", width: 1, style: 2, labelVisible: false },
        horzLine: { color: "rgba(255,255,255,0.1)", width: 1, style: 2, labelBackgroundColor: "#1a1a1a" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.04)",
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.04)",
        visible: false,
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: "transparent",
      lineWidth: 2,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: color,
      crosshairMarkerBackgroundColor: "#0A0A0A",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    hideTradingViewLogo(containerRef.current);

    return chart;
  }, [color]);

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
      seriesRef.current = null;
    };
  }, [initChart]);

  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    // Map to deduplicate by timestamp in seconds
    const uniqueMap = new Map<number, number>();
    for (const point of data) {
      const timeInSecs = Math.floor(point.timestamp / 1000);
      uniqueMap.set(timeInSecs, point.value);
    }

    // Sort ascending by time
    const sortedTimes = Array.from(uniqueMap.keys()).sort((a, b) => a - b);

    const areaData: AreaData[] = sortedTimes.map((time) => ({
      time: time as Time,
      value: uniqueMap.get(time)!,
    }));

    seriesRef.current.setData(areaData);
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
