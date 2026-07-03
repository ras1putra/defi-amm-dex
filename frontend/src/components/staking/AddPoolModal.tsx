"use client";

import { useState } from "react";
import { X, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { parseEther } from "viem";
import { useStakingAdmin } from "@/hooks/useStakingAdmin";
import { useConfigStore } from "@/store/useConfigStore";

interface AddPoolModalProps {
  onClose: () => void;
  refetchPools: () => Promise<void>;
}

export default function AddPoolModal({ onClose, refetchPools }: AddPoolModalProps) {
  const { addPoolWithRewarder, isConfirmed, isConfirming, txHash } = useStakingAdmin();
  const [lpToken, setLpToken] = useState("");
  const [rewardToken, setRewardToken] = useState("");
  const [rate, setRate] = useState("");
  const [cap, setCap] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);

  const isValidAddress = (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr);
  const canSubmit = isValidAddress(lpToken) && isValidAddress(rewardToken) && Number(rate) > 0 && !isSubmitting && !isConfirmed && !isConfirming;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addPoolWithRewarder(
        lpToken,
        rewardToken,
        parseEther(rate),
        cap ? parseEther(cap) : 0n,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async () => {
    await refetchPools();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={isConfirming ? undefined : onClose}>
      <div
        className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isConfirmed ? (
          <div className="flex flex-col items-center gap-6 py-6 font-mono-dm text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#6EE7B7]/20 blur-xl animate-pulse" />
              <div className="relative h-16 w-16 rounded-full bg-[#6EE7B7]/10 flex items-center justify-center border border-[#6EE7B7]/30">
                <CheckCircle size={32} className="text-[#6EE7B7]" />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-lg font-black text-white tracking-tight">Staking Pool Deployed!</p>
              <p className="text-xs text-white/70">Your new staking pool has been successfully initialized on-chain.</p>
            </div>

            <div className="w-full rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-3 text-left text-xs">
              <div className="flex justify-between items-center">
                <span className="text-white/40">LP Token Address</span>
                <span className="text-white font-mono truncate ml-2 max-w-[200px]">{lpToken}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/40">Reward Token Address</span>
                <span className="text-white font-mono truncate ml-2 max-w-[200px]">{rewardToken}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/40">Reward Rate</span>
                <span className="text-[#6EE7B7] font-bold font-mono">{rate} tokens/sec</span>
              </div>
              {cap && Number(cap) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-white/40">Total Cap</span>
                  <span className="text-white font-mono">{cap} tokens</span>
                </div>
              )}
            </div>

            <div className="w-full flex flex-col gap-2.5 pt-2">
              {txHash && explorerUrl && (
                <a
                  href={`${explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-4 py-2.5 text-xs font-bold text-white transition-all cursor-pointer"
                >
                  <span>View on Explorer</span>
                  <ExternalLink size={12} className="text-white/40 shrink-0" />
                </a>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="btn-primary w-full py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black tracking-tight text-white">Add Staking Pool</h2>
              <button type="button" onClick={onClose} disabled={isConfirming} className="text-white/40 hover:text-white transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm mb-1.5 block">
                  LP Token Address
                </label>
                <input
                  type="text"
                  value={lpToken}
                  disabled={isConfirming}
                  onChange={(e) => setLpToken(e.target.value)}
                  placeholder="0x..."
                  className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm font-mono outline-none placeholder:text-white/20 focus:border-[#6EE7B7]/50 transition-colors disabled:opacity-50"
                />
                {lpToken && !isValidAddress(lpToken) && (
                  <p className="text-xs text-red-400 mt-1">Invalid contract address</p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm mb-1.5 block">
                  Reward Token Address
                </label>
                <input
                  type="text"
                  value={rewardToken}
                  disabled={isConfirming}
                  onChange={(e) => setRewardToken(e.target.value)}
                  placeholder="0x..."
                  className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm font-mono outline-none placeholder:text-white/20 focus:border-[#6EE7B7]/50 transition-colors disabled:opacity-50"
                />
                {rewardToken && !isValidAddress(rewardToken) && (
                  <p className="text-xs text-red-400 mt-1">Invalid contract address</p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm mb-1.5 block">
                  Reward Rate (tokens per second)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rate}
                  disabled={isConfirming}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="0.01"
                  className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm font-mono outline-none placeholder:text-white/20 focus:border-[#6EE7B7]/50 transition-colors disabled:opacity-50"
                />
                <p className="text-xs text-white/70 mt-1 font-mono-dm">
                  How many reward tokens distributed per second across all stakers.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm mb-1.5 block">
                  Total Reward Cap (0 = no cap)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cap}
                  disabled={isConfirming}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="1000000"
                  className="w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm font-mono outline-none placeholder:text-white/20 focus:border-[#6EE7B7]/50 transition-colors disabled:opacity-50"
                />
                <p className="text-xs text-white/70 mt-1 font-mono-dm">
                  Maximum total rewards to distribute. 0 = unlimited. Pool closes when cap is reached.
                </p>
              </div>

              {isConfirming && (
                <div className="flex items-center gap-2 text-[#6EE7B7] text-xs bg-[#6EE7B7]/10 border border-[#6EE7B7]/20 rounded-xl px-4 py-2.5">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="font-bold">Deploying staking pool on-chain...</span>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2">{error}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isConfirming}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 btn-primary px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {(isSubmitting || isConfirming) && <Loader2 size={14} className="animate-spin" />}
                {isConfirming ? "Confirming..." : isSubmitting ? "Deploying..." : "Deploy Pool"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
