"use client";

import { useEffect, useState } from "react";
import { showErrorToast } from "@/lib/api";
import StakePanel from "@/components/staking/StakePanel";
import AddPoolModal from "@/components/staking/AddPoolModal";
import { useStakingPools } from "@/hooks/useStaking";
import { useStakingAdmin } from "@/hooks/useStakingAdmin";
import Loading from "@/components/ui/Loading";
import AppNavbar from "@/components/layout/AppNavbar";
import { Gem, Plus } from "lucide-react";

export default function StakingPage() {
  const { data: pools, isLoading, isError, error, refetchPools } = useStakingPools();
  const { isOwner } = useStakingAdmin();
  const [showAddPool, setShowAddPool] = useState(false);

  useEffect(() => {
    if (isError && error) {
      showErrorToast(error, "Failed to load staking pools");
    }
  }, [isError, error]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-syne grain-overlay overflow-x-hidden">
      <AppNavbar title="Staking" />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-6 sm:pt-10 pb-6 sm:pb-20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
          <div className="mb-4 sm:mb-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-lg bg-[#6EE7B7]/10 flex items-center justify-center">
                <Gem size={16} className="text-[#6EE7B7]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Earn Yield V2</h1>
            </div>
            <p className="mt-2 text-white/70 font-mono-dm text-sm">{"// Stake LP tokens to earn rewards"}</p>
          </div>

          {isOwner && (
            <button
              onClick={() => setShowAddPool(true)}
              className="btn-primary px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              <Plus size={16} /> Add Pool
            </button>
          )}
        </div>

        {isLoading ? (
          <Loading />
        ) : pools && pools.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl justify-items-start">
            {pools.map((pool) => (
              <StakePanel key={pool.address} pool={pool} refetchPools={refetchPools} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <Gem size={32} className="mx-auto text-white/20 mb-3" />
            <p className="text-sm text-white/40">No staking pools available</p>
          </div>
        )}
      </main>

      {showAddPool && <AddPoolModal onClose={() => setShowAddPool(false)} refetchPools={refetchPools} />}
    </div>
  );
}
