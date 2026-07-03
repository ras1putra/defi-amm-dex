"use client";

import { useState, useMemo } from "react";
import { X, Loader2, AlertCircle, Minus, Wallet, Info } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { V2_AMM_ABI, V2_LP_TOKEN_ABI } from "@/lib/abis";
import { useConfigStore } from "@/store/useConfigStore";
import { REMOVE_LIQ_STEP as S, type TokenOption } from "@/types/dex";
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity";
import { minAmountOut } from "@/lib/amm";
import TxConfirmedModal from "@/components/shared/TxConfirmedModal";
import SlippageSelector from "@/components/shared/SlippageSelector";

interface RemoveLiquidityModalProps {
  poolAddress: `0x${string}`;
  token0: TokenOption;
  token1: TokenOption;
  onClose: () => void;
}

export default function RemoveLiquidityModal({ poolAddress, token0, token1, onClose }: RemoveLiquidityModalProps) {
  const { address } = useAccount();
  const [percent, setPercent] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);

  const { data: lpTokenAddress } = useReadContract({
    address: poolAddress,
    abi: V2_AMM_ABI,
    functionName: "lpToken",
    query: { enabled: !!poolAddress },
  });

  const lpTokenAddr = lpTokenAddress as `0x${string}` | undefined;

  const { data: userLpBalance } = useReadContract({
    address: lpTokenAddr,
    abi: V2_LP_TOKEN_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!lpTokenAddr && !!address },
  });

  const lpDecimals = 18;
  const lpBalance = (userLpBalance as bigint) ?? 0n;

  const lpAmount = useMemo(() => {
    if (percent <= 0 || lpBalance <= 0n) return 0n;
    return (lpBalance * BigInt(percent)) / 100n;
  }, [percent, lpBalance]);

  const { data: reservesData } = useReadContract({
    address: poolAddress,
    abi: V2_AMM_ABI,
    functionName: "getReserves",
    query: { enabled: !!poolAddress },
  });

  const { data: totalLpSupply } = useReadContract({
    address: lpTokenAddr,
    abi: V2_LP_TOKEN_ABI,
    functionName: "totalSupply",
    query: { enabled: !!lpTokenAddr },
  });

  const reserve0 = (reservesData as readonly bigint[])?.[0] ?? 0n;
  const reserve1 = (reservesData as readonly bigint[])?.[1] ?? 0n;
  const totalSupply = (totalLpSupply as bigint) ?? 1n;

  const estimated0 = lpAmount <= 0n || totalSupply <= 0n ? 0n : (lpAmount * reserve0) / totalSupply;
  const estimated1 = lpAmount <= 0n || totalSupply <= 0n ? 0n : (lpAmount * reserve1) / totalSupply;

  const [slippageBps, setSlippageBps] = useState(50);

  const amount0Min = estimated0 <= 0n || slippageBps <= 0 ? 0n : minAmountOut(estimated0, slippageBps);
  const amount1Min = estimated1 <= 0n || slippageBps <= 0 ? 0n : minAmountOut(estimated1, slippageBps);

  const {
    step,
    isConfirming,
    isConfirmed,
    txHash,
    error,
    handleRemove,
    reset,
  } = useRemoveLiquidity({ token0, token1, poolAddress, lpAmount, amount0Min, amount1Min });

  const handleClose = () => { reset(); onClose(); };

  const isBusy = step === S.SIGNING || step === S.PENDING;

  const canSubmit = percent > 0 && lpAmount > 0n && !isBusy && !isConfirmed;

  const actionLabel = () => {
    if (step === S.SIGNING) return "Confirm in wallet…";
    if (step === S.PENDING || isConfirming) return "Removing…";
    if (isConfirmed) return "Done!";
    return "Remove Liquidity";
  };

  const handleAction = () => {
    if (!showConfirm && percent > 0 && lpAmount > 0n) {
      reset(); // clear stale error/step from any previous failed attempt
      setShowConfirm(true);
    }
  };

  const handleConfirmRemove = () => {
    setShowConfirm(false);
    handleRemove();
  };

  const percentageButtons = [25, 50, 75, 100];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={handleClose}>
        <div className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Minus size={14} className="text-amber-400" />
              </div>
              <h2 className="text-md font-black tracking-tight">Remove Liquidity</h2>
            </div>
            <button type="button" onClick={handleClose} className="text-white/40 hover:text-white transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {isConfirmed ? (
            <TxConfirmedModal
              title="Liquidity Removed!"
              subtitle="Your LP tokens have been redeemed on-chain."
              accentColor="amber"
              details={[
                { label: `Received ${token0.symbol}`, value: Number(formatUnits(estimated0, token0.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }) },
                { label: `Received ${token1.symbol}`, value: Number(formatUnits(estimated1, token1.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }) },
              ]}
              txHash={txHash}
              explorerUrl={explorerUrl}
              onClose={handleClose}
            />
          ) : (
            <>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5 mb-4">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-[#6EE7B7]/20 flex items-center justify-center text-[10px] font-bold text-[#6EE7B7]">
                      {token0.symbol[0]}
                    </div>
                    <span className="text-sm font-bold">{token0.symbol}</span>
                  </div>
                  <span className="text-white/70 text-xs">+</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-[#22D3EE]/20 flex items-center justify-center text-[10px] font-bold text-[#22D3EE]">
                      {token1.symbol[0]}
                    </div>
                    <span className="text-sm font-bold">{token1.symbol}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                  <span className="flex items-center gap-1">
                    <Wallet size={12} /> LP Balance
                  </span>
                  <span className="font-mono font-bold text-white/70">
                    {formatUnits(lpBalance, lpDecimals)} LP
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-white/40 font-mono-dm uppercase tracking-wider">Amount to remove</p>
                </div>
                <div className="mb-3">
                  <SlippageSelector value={slippageBps} onChange={setSlippageBps} accentColor="amber" showCustomInput={false} />
                </div>
                <div className="flex gap-2">
                  {percentageButtons.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPercent(percent === p ? 0 : p)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${percent === p
                        ? "bg-amber-500 text-zinc-950 shadow-[0_4px_12px_rgba(245,158,11,0.15)]"
                        : "bg-white/[0.04] border border-white/[0.08] text-white/70 hover:bg-white/[0.08]"
                        }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
                {percent > 0 && (
                  <p className="text-center mt-2 text-xs font-mono text-white/60">
                    {formatUnits(lpAmount, lpDecimals)} LP ≈ {token0.symbol} + {token1.symbol}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-xs md:text-sm mb-4 bg-red-400/10 rounded-xl px-4 py-2">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              {showConfirm ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-4 space-y-3">
                    <p className="text-xs font-mono-dm uppercase tracking-wider text-white/40">You will remove</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">{formatUnits(lpAmount, lpDecimals)} LP</span>
                      <span className="text-white/40 text-xs">{token0.symbol}/{token1.symbol}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] p-4 space-y-3">
                    <p className="text-xs font-mono-dm uppercase tracking-wider text-white/40">You will receive</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white font-bold font-mono">{formatUnits(estimated0, token0.decimals)}</span>
                      <span className="text-white/70">{token0.symbol}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white font-bold font-mono">{formatUnits(estimated1, token1.decimals)}</span>
                      <span className="text-white/70">{token1.symbol}</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 flex items-center gap-2">
                    <Info size={14} className="text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-400/80 leading-relaxed">
                      Output amounts are estimated. The actual amounts received may vary slightly depending on block execution order.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConfirm(false)}
                      className="flex-1 py-3 rounded-xl text-sm font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRemove}
                      className="flex-1 py-3 rounded-xl text-sm font-bold bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-all cursor-pointer"
                    >
                      Confirm Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleAction}
                    className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    {isBusy && <Loader2 size={16} className="animate-spin" />}
                    {actionLabel()}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
