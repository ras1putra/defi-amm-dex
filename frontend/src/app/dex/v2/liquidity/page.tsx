"use client";

import { useEffect, useMemo, useState } from "react";
import { showErrorToast } from "@/lib/api";
import { Plus, Droplets, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import PoolCard from "@/components/dex/PoolCard";
import AddLiquidityModal from "@/components/dex/AddLiquidityModal";
import RemoveLiquidityModal from "@/components/dex/RemoveLiquidityModal";
import { usePairs } from "@/hooks/usePairs";
import { useTokens } from "@/hooks/useTokens";
import { useUserLpBalances } from "@/hooks/useUserLpBalances";
import Loading from "@/components/ui/Loading";
import AppNavbar from "@/components/layout/AppNavbar";
import { DAYS_IN_YEAR } from "@/lib/constants";
import { useConfigStore } from "@/store/useConfigStore";
import type { TokenOption } from "@/types/dex";

export default function LiquidityPage() {
  const { address } = useAccount();
  const { data: pairs, isLoading, isError, error } = usePairs();
  const { data: apiTokens } = useTokens();
  const wethAddress = useConfigStore((s) => s.config?.contract_weth);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [prefill, setPrefill] = useState<{ token0: TokenOption; token1: TokenOption } | null>(null);
  const [removePrefill, setRemovePrefill] = useState<{ poolAddress: `0x${string}`; token0: TokenOption; token1: TokenOption } | null>(null);

  useEffect(() => {
    if (isError && error) {
      showErrorToast(error, "Failed to load liquidity pools");
    }
  }, [isError, error]);

  const findTokenOption = (address: string, symbol: string, decimals: number): TokenOption => {
    if (wethAddress && address.toLowerCase() === wethAddress.toLowerCase()) {
      return { address: wethAddress as `0x${string}`, symbol: "WETH", decimals: 18, name: "Wrapped Ether" };
    }
    const apiToken = apiTokens?.find((t) => t.address.toLowerCase() === address.toLowerCase());
    return {
      address: address as `0x${string}`,
      symbol: apiToken?.symbol ?? symbol,
      decimals: apiToken?.decimals ?? decimals,
      name: apiToken?.name ?? symbol,
      logo: apiToken?.logo_url,
    };
  };

  const pools = useMemo(() => {
    return pairs?.map((p) => ({
      address: p.address,
      name: `${p.symbol0}/${p.symbol1}`,
      token0: p.symbol0,
      token1: p.symbol1,
      reserve0: Number(p.reserve0) / Math.pow(10, p.decimals0 ?? 18),
      reserve1: Number(p.reserve1) / Math.pow(10, p.decimals1 ?? 18),
      tvl: p.tvl,
      volume_24h: p.volume_24h,
      fees_24h: p.volume_24h * (p.fee !== undefined ? p.fee / 100 : 0.003),
      apr: (p.volume_24h * (p.fee !== undefined ? p.fee / 100 : 0.003) * DAYS_IN_YEAR * 100) / (p.tvl || 1),
      pricingMode: p.pricing_mode,
      rawToken0: p.token0,
      rawToken1: p.token1,
      decimals0: p.decimals0,
      decimals1: p.decimals1,
      symbol0: p.symbol0,
      symbol1: p.symbol1,
    })) ?? [];
  }, [pairs]);

  const poolAddresses = useMemo(
    () => pools.map((p) => p.address as `0x${string}`),
    [pools],
  );
  const { poolLpInfos } = useUserLpBalances(poolAddresses, address);

  const myPools = useMemo(() => pools.filter((p) => {
    const info = poolLpInfos.get(p.address.toLowerCase());
    return info !== undefined && info.balance > 0n;
  }), [pools, poolLpInfos]);

  const otherPools = useMemo(() => pools.filter((p) => {
    const info = poolLpInfos.get(p.address.toLowerCase());
    return !info || info.balance <= 0n;
  }), [pools, poolLpInfos]);

  const handlePoolAdd = (pool: typeof pools[number]) => {
    setPrefill({
      token0: findTokenOption(pool.rawToken0, pool.symbol0, pool.decimals0),
      token1: findTokenOption(pool.rawToken1, pool.symbol1, pool.decimals1),
    });
    setShowAddModal(true);
  };

  const handlePoolRemove = (pool: typeof pools[number]) => {
    setRemovePrefill({
      poolAddress: pool.address as `0x${string}`,
      token0: findTokenOption(pool.rawToken0, pool.symbol0, pool.decimals0),
      token1: findTokenOption(pool.rawToken1, pool.symbol1, pool.decimals1),
    });
    setShowRemoveModal(true);
  };

  const handleCloseAdd = () => {
    setShowAddModal(false);
    setPrefill(null);
  };

  const handleCloseRemove = () => {
    setShowRemoveModal(false);
    setRemovePrefill(null);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-syne overflow-x-hidden">
      <AppNavbar title="Liquidity" />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
          <div className="mb-4 sm:mb-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-lg bg-[#6EE7B7]/10 flex items-center justify-center">
                <Droplets size={16} className="text-[#6EE7B7]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Pools V2</h1>
            </div>
            <p className="mt-2 text-white/70 font-mono-dm text-sm">{"// Provide liquidity and earn fees"}</p>
          </div>
          <button
            type="button"
            onClick={() => { setPrefill(null); setShowAddModal(true); }}
            className="btn-primary px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Plus size={16} /> Add Liquidity
          </button>
        </div>

        {isLoading ? (
          <Loading />
        ) : (
          <div className="space-y-8">
            {myPools.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Wallet size={16} className="text-[#6EE7B7]" />
                  <h2 className="text-sm font-mono-dm uppercase tracking-widest text-white/70">
                    My Pools ({myPools.length})
                  </h2>
                </div>
                <div className="space-y-4">
                  {myPools.map((pool) => (
                    <PoolCard
                      key={pool.address}
                      pool={pool}
                      lpSharePct={poolLpInfos.get(pool.address.toLowerCase())?.sharePct}
                      onAdd={() => handlePoolAdd(pool)}
                      onRemove={() => handlePoolRemove(pool)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-mono-dm uppercase tracking-widest text-white/70 mb-4">
                {myPools.length > 0 ? "All Pools" : "All Pools"}
              </h2>
              <div className="space-y-4">
                {otherPools.map((pool) => (
                  <PoolCard
                    key={pool.address}
                    pool={pool}
                    onAdd={() => handlePoolAdd(pool)}
                    onRemove={() => handlePoolRemove(pool)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {showAddModal && <AddLiquidityModal onClose={handleCloseAdd} prefill={prefill} />}
      {showRemoveModal && removePrefill && (
        <RemoveLiquidityModal
          poolAddress={removePrefill.poolAddress}
          token0={removePrefill.token0}
          token1={removePrefill.token1}
          onClose={handleCloseRemove}
        />
      )}
    </div>
  );
}
