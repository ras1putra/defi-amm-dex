"use client";

import { useAnalyticsPageState, useTokenPrices } from "@/hooks/useAnalytics";
import Loading from "@/components/ui/Loading";
import SimpleAreaChart from "@/components/charts/SimpleAreaChart";
import AppNavbar from "@/components/layout/AppNavbar";
import { BarChart3, ExternalLink } from "lucide-react";
import { formatUSD, formatPrice, formatETH } from "@/lib/format";
import Link from "next/link";
import { PriceChangeBadge } from "@/components/ui/PriceChangeBadge";
import { SortSelect } from "@/components/analytics/SortSelect";
import { Pagination } from "@/components/ui/Pagination";
import { isBaseAsset, getQuotePriority } from "@/lib/amm";

export default function AnalyticsPage() {
  const timeframe = "24h";

  const {
    overview,
    ovLoading,
    tvlHist,
    tvlLoading,
    volHist,
    volLoading,
    sortKey,
    setSortKey,
    page,
    setPage,
    sortedPairs,
    totalPages,
    paginatedPairs,
  } = useAnalyticsPageState(timeframe);

  const { data: tokenPrices } = useTokenPrices(timeframe);

  const isWethMode = overview?.pricing_mode === "weth";
  const formatMetric = (v: number) => {
    return isWethMode ? formatETH(v) : formatUSD(v);
  };

  const tokenPriceMap = new Map<string, { priceUSD: number; priceETH: number; change24h: number }>();
  if (tokenPrices) {
    for (const t of tokenPrices) {
      tokenPriceMap.set(t.address.toLowerCase(), {
        priceUSD: t.price_usd,
        priceETH: t.price_eth,
        change24h: t.price_change_24h,
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-syne">
      <AppNavbar title="Analytics" />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-20">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-lg bg-[#6EE7B7]/10 flex items-center justify-center">
              <BarChart3 size={16} className="text-[#6EE7B7]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Analytics V2</h1>
          </div>
          <p className="mt-2 text-white/70 font-mono-dm text-sm">{"// Protocol-wide statistics and performance metrics"}</p>
        </div>

        {ovLoading ? <Loading /> : (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6 md:p-8 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 md:pr-6">
                <p className="text-xs font-bold text-[#6EE7B7] uppercase tracking-widest font-mono-dm mb-1">{isWethMode ? "TVL (ETH)" : "TVL"}</p>
                <p className="text-2xl sm:text-3xl font-black text-white">{formatMetric(overview?.total_tvl ?? 0)}</p>
                <p className="text-xs text-white/40 mt-1 font-mono-dm">{"// Total value locked across all pools"}</p>
              </div>
              <div className="border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 md:pr-6">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest font-mono-dm mb-1">{isWethMode ? "24h Volume (ETH)" : "24h Volume"}</p>
                <p className="text-2xl sm:text-3xl font-black text-white">{formatMetric(overview?.total_volume_24h ?? 0)}</p>
                <p className="text-xs text-white/40 mt-1 font-mono-dm">{"// Trading volume in the last 24 hours"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-white/70 uppercase tracking-widest font-mono-dm mb-1">Pairs</p>
                <p className="text-2xl sm:text-3xl font-black text-white">{overview?.pair_count ?? 0}</p>
                <p className="text-xs text-white/40 mt-1 font-mono-dm">{"// Active liquidity pools"}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-4 sm:p-6 md:p-8">
            <h3 className="text-sm font-bold mb-4 text-white/70">TVL Over Time</h3>
            {tvlLoading ? <Loading height="h-48" /> : tvlHist && tvlHist.length > 0 ? (
              <SimpleAreaChart data={tvlHist.map((p) => ({ timestamp: p.timestamp, value: p.tvl }))} height={180} />
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-white/70">No TVL data yet</div>
            )}
          </div>

          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-4 sm:p-6 md:p-8">
            <h3 className="text-sm font-bold mb-4 text-white/70">Daily Volume</h3>
            {volLoading ? <Loading height="h-48" /> : volHist && volHist.length > 0 ? (
              <SimpleAreaChart data={volHist.map((p) => ({ timestamp: p.timestamp, value: p.volume }))} color="#F59E0B" height={180} />
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-white/70">No volume data yet</div>
            )}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-xl font-bold text-white/90">Pairs</h2>
            <SortSelect sortKey={sortKey} onChange={setSortKey} />
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-xs text-white/40 font-mono-dm uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Pair</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-right uppercase">{timeframe} Change</th>
                    <th className="px-4 py-3 font-medium text-right">{isWethMode ? "TVL (ETH)" : "TVL"}</th>
                    <th className="px-4 py-3 font-medium text-right">{isWethMode ? "Volume 24h (ETH)" : "Volume 24h"}</th>
                    <th className="px-4 py-3 font-medium text-right">APR</th>
                    <th className="px-4 py-3 font-medium text-right w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPairs.map((p) => {
                    return (
                      <tr
                        key={p.pool_id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                              <div className="w-7 h-7 rounded-full bg-[#6EE7B7]/20 flex items-center justify-center text-[10px] font-bold text-[#6EE7B7] border-2 border-[#0A0A0A]">
                                {p.symbol0.slice(0, 2)}
                              </div>
                              <div className="w-7 h-7 rounded-full bg-[#22D3EE]/20 flex items-center justify-center text-[10px] font-bold text-[#22D3EE] border-2 border-[#0A0A0A]">
                                {p.symbol1.slice(0, 2)}
                              </div>
                            </div>
                            <div>
                              <span className="font-bold text-sm text-white">{p.symbol0}/{p.symbol1}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] sm:text-xs text-white/70 font-mono-dm">
                                  {`${p.reserve0.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.symbol0} · ${p.reserve1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.symbol1}`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono-dm text-sm text-white/80">
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
                        <td className="px-4 py-3 text-right font-mono-dm text-sm font-bold text-white">
                          {formatMetric(p.tvl_usd)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-dm text-sm text-white/70">
                          {formatMetric(p.volume_24h_usd)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-dm text-sm text-[#6EE7B7] font-bold">
                          {p.apr.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/dex/v2/analytics/${(() => {
                              const p0 = getQuotePriority(p.symbol0);
                              const p1 = getQuotePriority(p.symbol1);
                              return p0 <= p1 ? p.token0 : p.token1;
                            })()}`}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors inline-flex"
                            title="View details"
                          >
                            <ExternalLink size={14} className="text-white/70 hover:text-white/60" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} totalPages={totalPages} totalPairs={sortedPairs.length} onPageChange={setPage} />
        </div>
      </main>
    </div>
  );
}
