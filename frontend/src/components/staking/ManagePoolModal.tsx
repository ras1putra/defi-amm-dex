"use client";

import { useState } from "react";
import { X, Loader2, Play, Pause } from "lucide-react";
import { parseUnits, formatUnits } from "viem";
import { useStakingAdmin } from "@/hooks/useStakingAdmin";
import { useConfigStore } from "@/store/useConfigStore";
import type { StakingPool } from "@/types/staking";
import TxConfirmedModal from "@/components/shared/TxConfirmedModal";

interface ManagePoolModalProps {
  pool: StakingPool;
  onClose: () => void;
  refetchPools: () => Promise<void>;
}

export default function ManagePoolModal({ pool, onClose, refetchPools }: ManagePoolModalProps) {
  const { setPoolRewardRate, setPoolRewardCap, isConfirmed, isConfirming, txHash, reset } = useStakingAdmin();
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);

  const initialRateFormatted = formatUnits(BigInt(pool.reward_rate), pool.reward_token_decimals);
  const initialCapFormatted = formatUnits(BigInt(pool.total_reward_pool), pool.reward_token_decimals);

  const [rate, setRate] = useState(initialRateFormatted);
  const [cap, setCap] = useState(initialCapFormatted === "0" ? "" : initialCapFormatted);
  const [activeAction, setActiveAction] = useState<"rate" | "cap" | "pause" | "resume" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPaused = BigInt(pool.reward_rate) === 0n;

  const handleUpdateRate = async (newRateVal: string) => {
    setError(null);
    setActiveAction(newRateVal === "0" ? "pause" : "rate");
    try {
      const parsedRate = parseUnits(newRateVal, pool.reward_token_decimals);
      await setPoolRewardRate(pool.pool_id, parsedRate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update rate");
      setActiveAction(null);
    }
  };

  const handleUpdateCap = async () => {
    setError(null);
    setActiveAction("cap");
    try {
      const parsedCap = cap ? parseUnits(cap, pool.reward_token_decimals) : 0n;
      await setPoolRewardCap(pool.pool_id, parsedCap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update cap");
      setActiveAction(null);
    }
  };

  const handleClose = async () => {
    await refetchPools();
    reset();
    onClose();
  };

  const isSubmitting = activeAction !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={isConfirming ? undefined : onClose}>
      <div
        className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isConfirmed ? (
          <TxConfirmedModal
            title="Pool Updated!"
            subtitle="Your changes have been successfully written to the smart contract."
            details={[
              { label: "Pool ID", value: String(pool.pool_id) },
              { label: "Action Performed", value: activeAction === "pause" ? "Paused rewards" : activeAction === "rate" ? "Updated reward rate" : activeAction === "cap" ? "Updated reward cap" : "Resumed rewards", highlight: true },
            ]}
            txHash={txHash}
            explorerUrl={explorerUrl}
            onClose={handleClose}
          />
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-black tracking-tight text-white">Manage Staking Pool</h2>
                <p className="text-xs text-white/40 font-mono-dm mt-0.5">Pool #{pool.pool_id} • {pool.staking_token_symbol}</p>
              </div>
              <button type="button" onClick={onClose} disabled={isConfirming} className="text-white/40 hover:text-white transition-colors cursor-pointer disabled:opacity-20">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Pause/Resume Action */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm block">Status</span>
                  <span className={`text-xs font-bold font-mono ${isPaused ? "text-rose-400" : "text-[#6EE7B7]"}`}>
                    {isPaused ? "PAUSED (0 rate)" : "ACTIVE"}
                  </span>
                </div>
                {isPaused ? (
                  <button
                    onClick={() => {
                      // Prompt setting a non-zero rate
                      if (Number(rate) === 0) setRate("0.1");
                      setActiveAction("resume");
                    }}
                    disabled={isSubmitting || isConfirming}
                    className="px-3.5 py-1.5 rounded-lg bg-[#6EE7B7]/10 hover:bg-[#6EE7B7]/20 border border-[#6EE7B7]/20 text-[#6EE7B7] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play size={12} /> Resume Rewards
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateRate("0")}
                    disabled={isSubmitting || isConfirming}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Pause size={12} /> Pause Rewards
                  </button>
                )}
              </div>

              {/* Adjust Reward Rate */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm block">
                  Reward Rate (tokens per second)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rate}
                    disabled={isSubmitting || isConfirming}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="0.01"
                    className="flex-1 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-xs font-mono outline-none placeholder:text-white/20 focus:border-[#6EE7B7]/50 disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleUpdateRate(rate)}
                    disabled={isSubmitting || isConfirming || !rate || Number(rate) < 0 || rate === initialRateFormatted}
                    className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </div>

              {/* Adjust Reward Cap */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm block">
                  Total Reward Cap (0 = no cap)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cap}
                    disabled={isSubmitting || isConfirming}
                    onChange={(e) => setCap(e.target.value)}
                    placeholder="0"
                    className="flex-1 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-xs font-mono outline-none placeholder:text-white/20 focus:border-[#6EE7B7]/50 disabled:opacity-50"
                  />
                  <button
                    onClick={handleUpdateCap}
                    disabled={isSubmitting || isConfirming || cap === initialCapFormatted}
                    className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </div>

              {isConfirming && (
                <div className="flex items-center gap-2 text-[#6EE7B7] text-xs bg-[#6EE7B7]/10 border border-[#6EE7B7]/20 rounded-xl px-4 py-2.5">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="font-bold">Transaction confirming on-chain...</span>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2">{error}</p>
              )}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isConfirming}
                className="w-full py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Close Panel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
