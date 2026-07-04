"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useOverview, useOHLCV, useTokenPrices, findPoolForToken } from "@/hooks/useAnalytics";
import TradingChart from "@/components/charts/TradingChart";
import AppNavbar from "@/components/layout/AppNavbar";
import Loading from "@/components/ui/Loading";
import { ArrowLeft, Clock } from "lucide-react";
import { formatUSD, formatPrice, formatETH } from "@/lib/format";
import { TIME_RANGES } from "@/lib/constants";
import { PriceChangeBadge } from "@/components/ui/PriceChangeBadge";
import { isBaseAsset, getQuotePriority } from "@/lib/amm";


export default function TokenDetailPage() {
  const params = useParams();
  const address = params.address as string;

  const [timeRange, setTimeRange] = useState(2);
  const timeframe = "24h";
  const { interval, lookback } = TIME_RANGES[timeRange];

  const [activePoolID, setActivePoolID] = useState<string | null>(null);

  const { data: tokenPrices, isLoading: tokensLoading } = useTokenPrices(timeframe);
  const { data: overview } = useOverview(timeframe);

  const isWethMode = overview?.pricing_mode === "weth";
  const formatMetric = (v: number) => {
    return isWethMode ? formatETH(v) : formatUSD(v);
  };

  const effectivePoolID = useMemo(() => {
    if (activePoolID) return activePoolID;
    if (overview && address) return findPoolForToken(overview, address);
    return null;
  }, [activePoolID, overview, address]);

  const { data: ohlcv, isLoading: ohlcvLoading } = useOHLCV(
    effectivePoolID,
    address,
    interval,
    lookback,
  );

  const safeTokenPrices = tokenPrices || [];
  const token = useMemo(() => {
    if (!safeTokenPrices.length || !address) return null;
    return safeTokenPrices.find((t) => t.address.toLowerCase() === address.toLowerCase()) ?? null;
  }, [safeTokenPrices, address]);

  const tokenPairs = useMemo(() => {
    if (!overview || !address) return [];
    const addr = address.toLowerCase();
    return overview.pairs.filter(
      (p) => p.token0.toLowerCase() === addr || p.token1.toLowerCase() === addr,
    );
  }, [overview, address]);

  const activePool = useMemo(() => {
    return tokenPairs.find((p) => p.pool_id === effectivePoolID) ?? tokenPairs[0] ?? null;
  }, [tokenPairs, effectivePoolID]);

  const tokenPriceMap = useMemo(() => {
    const map = new Map<string, { priceUSD: number }>();
    if (!safeTokenPrices.length) return map;
    for (const t of safeTokenPrices) {
      map.set(t.address.toLowerCase(), { priceUSD: t.price_usd });
    }
    return map;
  }, [safeTokenPrices]);

  const getPoolPriceUSD = (pool: typeof activePool) => {
    if (!pool || pool.price <= 0) return 0;
    const base0 = isBaseAsset(pool.symbol0);
    const base1 = isBaseAsset(pool.symbol1);

    if (isWethMode) {
      if (base0 && !base1) return 1 / pool.price;
      return pool.price;
    } else {
      const p0 = getQuotePriority(pool.symbol0);
      const p1 = getQuotePriority(pool.symbol1);
      const t0 = pool.token0.toLowerCase();
      const t1 = pool.token1.toLowerCase();
      
      if (p0 >= p1) {
        const t0Price = tokenPriceMap.get(t0)?.priceUSD ?? 0;
        return t0Price / pool.price;
      } else {
        const t1Price = tokenPriceMap.get(t1)?.priceUSD ?? 0;
        return t1Price * pool.price;
      }
    }
  };

  const getWETHPriceUSD = () => {
    if (!safeTokenPrices.length) return 0;
    const wethToken = safeTokenPrices.find(t => t.symbol === "WETH");
    return wethToken?.price_usd ?? 0;
  };

  if (tokensLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white font-syne">
        <AppNavbar title="Analytics" />
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-20">
          <Loading />
        </main>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white font-syne">
        <AppNavbar title="Analytics" />
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-20">
          <div className="flex flex-col items-center justify-center h-64 text-white/40">
            <p className="text-lg font-bold mb-2">Token not found</p>
            <Link href="/dex/v2/analytics" className="text-[#6EE7B7] hover:underline text-sm flex items-center gap-1">
              <ArrowLeft size={14} /> Back to Analytics
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const headerPriceUSD = activePool ? getPoolPriceUSD(activePool) : (token.price_usd ?? 0);
  const wethPriceUSD = getWETHPriceUSD();
  const headerPriceETH = activePool && activePool.price > 0
    ? (isWethMode ? (isBaseAsset(activePool.symbol0) && !isBaseAsset(activePool.symbol1) ? 1 / activePool.price : activePool.price) : headerPriceUSD / (wethPriceUSD || 1))
    : (token.price_eth ?? 0);
  const headerPriceChange = activePool?.price_change_24h ?? (token.price_change_24h ?? 0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-syne">
      <AppNavbar title="Analytics" />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-20">
        <Link
          href="/dex/v2/analytics"
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6"
        >
          <ArrowLeft size={14} /> Back to Analytics
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6 mb-8">
          <div className="flex items-center gap-3">
            {token.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={token.logo_url} alt={token.symbol} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/[0.06]" />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#6EE7B7]/20 flex items-center justify-center text-base sm:text-lg font-bold text-[#6EE7B7]">
                {token.symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-3xl font-black tracking-tight">{token.symbol}</h1>
              <p className="text-xs sm:text-sm text-white/40 font-mono-dm">{token.name}</p>
            </div>
          </div>
          <div className="flex items-end gap-3 sm:gap-4 sm:ml-auto">
            <div>
              <p className="text-xl sm:text-3xl font-black">{isWethMode ? formatETH(headerPriceUSD) : formatPrice(headerPriceUSD)}</p>
              {!isWethMode && <p className="text-xs text-white/40 font-mono-dm mt-0.5">{formatETH(headerPriceETH)}</p>}
            </div>
            <PriceChangeBadge pct={headerPriceChange} size="sm" showMinus={false} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: isWethMode ? "Price WETH" : "Price USD", value: isWethMode ? formatETH(headerPriceUSD) : formatPrice(headerPriceUSD), color: "text-white" },
            { label: "Price ETH", value: formatETH(headerPriceETH), color: "text-white" },
            { label: `${timeframe} Change`, value: `${headerPriceChange >= 0 ? "+" : ""}${headerPriceChange.toFixed(2)}%`, color: headerPriceChange >= 0 ? "text-[#6EE7B7]" : "text-red-400" },
            { label: "Pools", value: String(tokenPairs.length), color: "text-white" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white/[0.02] border border-white/[0.08] p-3 text-center">
              <p className="text-[10px] sm:text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm mb-1">{stat.label}</p>
              <p className={`text-sm font-bold font-mono-dm ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-4 sm:p-6 mb-8">
          <div className="flex flex-col gap-2.5 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-lg font-bold text-white/90">
                {activePool ? `${activePool.symbol0}/{activePool.symbol1}` : token.symbol}
                <span className="text-white/30 font-light mx-1.5">/</span>
                <span className="text-white/50 font-semibold">{isWethMode ? "ETH" : "USD"}</span>
              </h2>
              <div className="flex items-center gap-1 overflow-x-auto">
                {TIME_RANGES.map((tr, i) => (
                  <button
                    key={tr.label}
                    onClick={() => setTimeRange(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono-dm transition-colors cursor-pointer ${timeRange === i
                      ? "bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#6EE7B7]/20"
                      : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                      }`}
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            </div>

            {tokenPairs.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-white/25 font-mono-dm uppercase tracking-widest shrink-0">via</span>
                {tokenPairs.map((p) => {
                  const isActive = p.pool_id === effectivePoolID;
                  return (
                    <button
                      key={p.pool_id}
                      onClick={() => setActivePoolID(p.pool_id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold font-mono-dm transition-all cursor-pointer ${isActive
                        ? "bg-[#6EE7B7]/10 text-[#6EE7B7] border border-[#6EE7B7]/20"
                        : "text-white/35 border border-white/[0.08] hover:text-white/60 hover:border-white/[0.16] hover:bg-white/[0.03]"
                        }`}
                    >
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] animate-pulse shrink-0" />
                      )}
                      {p.symbol0}/{p.symbol1}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {ohlcvLoading ? (
            <Loading height="h-96" />
          ) : ohlcv && ohlcv.length > 0 ? (
            <TradingChart data={ohlcv} height={420} />
          ) : (
            <div className="h-96 flex flex-col items-center justify-center text-white/70 gap-2">
              <Clock size={24} />
              <p className="text-sm">No OHLCV data available for this time range</p>
              <p className="text-xs text-white/20">Data will appear after trading activity</p>
            </div>
          )}
        </div>

        {tokenPairs.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white/90 mb-4">Pools</h2>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-xs text-white/40 font-mono-dm uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Pair</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-right">24h Change</th>
                    <th className="px-4 py-3 font-medium text-right">{isWethMode ? "TVL (ETH)" : "TVL"}</th>
                    <th className="px-4 py-3 font-medium text-right">{isWethMode ? "Volume 24h (ETH)" : "Volume 24h"}</th>
                    <th className="px-4 py-3 font-medium text-right">APR</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenPairs.map((p) => (
                    <tr
                      key={p.pool_id}
                      onClick={() => setActivePoolID(p.pool_id)}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors cursor-pointer ${p.pool_id === effectivePoolID ? "bg-white/[0.04]" : ""
                        }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                            <div className="w-6 h-6 rounded-full bg-[#6EE7B7]/20 flex items-center justify-center text-[9px] font-bold text-[#6EE7B7] border-2 border-[#0A0A0A]">
                              {p.symbol0.slice(0, 2)}
                            </div>
                            <div className="w-6 h-6 rounded-full bg-[#22D3EE]/20 flex items-center justify-center text-[9px] font-bold text-[#22D3EE] border-2 border-[#0A0A0A]">
                              {p.symbol1.slice(0, 2)}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">
                                {p.symbol0}/{p.symbol1}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono-dm text-white/40">
                                {`${p.reserve0.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.symbol0} · ${p.reserve1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.symbol1}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-dm text-sm font-bold text-white">
                        {(() => {
                          if (p.price <= 0) return "—";
                          const base0 = isBaseAsset(p.symbol0);
                          const base1 = isBaseAsset(p.symbol1);

                          if (isWethMode) {
                            if (base0 && !base1) {
                              return `${(1 / p.price).toFixed(6)} ${p.symbol0}`;
                            }
                            return `${p.price.toFixed(6)} ${p.symbol1}`;
                          } else {
                            const p0 = getQuotePriority(p.symbol0);
                            const p1 = getQuotePriority(p.symbol1);

                            if (p0 >= p1) {
                              const t0Price = tokenPriceMap.get(p.token0.toLowerCase())?.priceUSD ?? 0;
                              return formatPrice(t0Price / p.price);
                            } else {
                              const t1Price = tokenPriceMap.get(p.token1.toLowerCase())?.priceUSD ?? 0;
                              return formatPrice(t1Price * p.price);
                            }
                          }
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PriceChangeBadge pct={p.price_change_24h} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono-dm text-sm font-bold">{formatMetric(p.tvl_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono-dm text-sm text-white/70">{formatMetric(p.volume_24h_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono-dm text-sm text-[#6EE7B7] font-bold">{p.apr.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

