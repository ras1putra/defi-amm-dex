"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { ERC20_ABI } from "@/lib/abis";
import { parseAmount } from "@/lib/amm";
import { formatBalance } from "@/lib/format";
import { txToast } from "@/components/dex/TxToast";
import { useConfigStore } from "@/store/useConfigStore";
import TxConfirmedModal from "@/components/shared/TxConfirmedModal";

interface FundModalProps {
  rewarderAddress: string;
  rewardToken: string;
  rewardTokenSymbol: string;
  onClose: () => void;
}

export default function FundModal({ rewarderAddress, rewardToken, rewardTokenSymbol, onClose }: FundModalProps) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"idle" | "approving" | "signing" | "confirming" | "done">("idle");
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | null>(null);
  const [transferTxHash, setTransferTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);

  const tokenAddr = rewardToken as `0x${string}`;
  const spender = rewarderAddress as `0x${string}`;

  const { data: decimals } = useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const { data: balance } = useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: allowance } = useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, spender] : undefined,
    query: { enabled: !!address },
  });

  const tokenDecimals = (decimals as number) ?? 18;
  const parsedAmount = amount ? parseAmount(amount, tokenDecimals) : 0n;
  const needsApproval = parsedAmount > 0n && !!allowance && allowance < parsedAmount;

  const { writeContractAsync } = useWriteContract();

  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({
    hash: approveTxHash ?? undefined,
  });

  const { isLoading: isTransferConfirming, isSuccess: isTransferConfirmed, isError: isTransferError } = useWaitForTransactionReceipt({
    hash: transferTxHash ?? undefined,
  });

  const transferToastRef = useRef(false);

  useEffect(() => {
    if (step === "confirming" && isTransferConfirmed && transferTxHash && !transferToastRef.current) {
      transferToastRef.current = true;
      txToast({ hash: transferTxHash, status: "success", message: `Funded ${amount} ${rewardTokenSymbol}!` });
      setStep("done");
    }
  }, [step, isTransferConfirmed, transferTxHash, amount, rewardTokenSymbol]);

  useEffect(() => {
    if (step === "confirming" && isTransferError && transferTxHash && !transferToastRef.current) {
      transferToastRef.current = true;
      txToast({ hash: transferTxHash, status: "error", message: "Funding failed" });
      setError("Transaction reverted");
      setStep("idle");
    }
  }, [step, isTransferError, transferTxHash]);

  const handleApprove = async () => {
    if (!address || parsedAmount <= 0n) return;
    setStep("approving");
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, parsedAmount],
      } as Parameters<typeof writeContractAsync>[0]);
      setApproveTxHash(hash);
      txToast({ hash, status: "pending", message: `Approving ${rewardTokenSymbol}...` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setStep("idle");
    }
  };

  const handleTransfer = async () => {
    if (!address || parsedAmount <= 0n) return;
    if (needsApproval) {
      handleApprove();
      return;
    }
    setStep("signing");
    setError(null);
    transferToastRef.current = false;
    try {
      const hash = await writeContractAsync({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [spender, parsedAmount],
      } as Parameters<typeof writeContractAsync>[0]);
      setTransferTxHash(hash);
      setStep("confirming");
      txToast({ hash, status: "pending", message: `Funding ${amount} ${rewardTokenSymbol}...` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transfer failed");
      setStep("idle");
    }
  };

  const isBusy = step === "approving" || step === "signing" || step === "confirming";
  const isDone = step === "done";
  const statusText = isApproveConfirming ? "Waiting for approval..." : isTransferConfirming ? "Waiting for transfer..." : "";

  const getButtonLabel = () => {
    if (step === "approving") return `Approving ${rewardTokenSymbol}...`;
    if (step === "signing") return "Confirm in wallet...";
    if (step === "confirming") return "Confirming transfer...";
    if (needsApproval) return `Approve ${rewardTokenSymbol}`;
    return `Transfer ${rewardTokenSymbol}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-md font-black tracking-tight text-white">Fund Reward Pool</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {isDone ? (
          <TxConfirmedModal
            title="Reward Pool Funded!"
            subtitle="Your tokens have been transferred to the rewarder contract."
            details={[
              { label: "Funded", value: `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${rewardTokenSymbol}` },
              { label: "Rewarder", value: rewarderAddress },
            ]}
            txHash={transferTxHash}
            explorerUrl={explorerUrl}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs sm:text-sm space-y-1 font-mono-dm">
                <div className="flex justify-between text-white/70">
                  <span>Rewarder</span>
                  <span className="text-white/70 font-mono truncate ml-2 max-w-[220px]">{rewarderAddress}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Your Balance</span>
                  <span className="text-white/70">{balance ? formatBalance(balance as bigint, tokenDecimals) : "—"} {rewardTokenSymbol}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm mb-1.5 block">
                  Amount
                </label>
                <div className="flex items-center gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.02] focus-within:border-[#6EE7B7]/30 focus-within:bg-white/[0.03] focus-within:outline-none transition-all">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, "");
                      if (val === "" || /^\d*\.?\d*$/.test(val)) setAmount(val);
                    }}
                    placeholder="0.0"
                    disabled={isBusy}
                    className="min-w-0 flex-1 bg-transparent text-xl font-bold text-white outline-none placeholder:text-white/20 disabled:opacity-50"
                  />
                  <span className="shrink-0 text-sm font-bold text-[#6EE7B7]">{rewardTokenSymbol}</span>
                </div>
                {balance && (balance as bigint) > 0n && (
                  <button
                    onClick={() => {
                      if (balance) {
                        const formatted = formatBalance(balance as bigint, tokenDecimals);
                        setAmount(formatted === "0" ? "" : formatted);
                      }
                    }}
                    className="text-xs font-bold text-[#6EE7B7] hover:text-[#34D399] transition-colors mt-1 cursor-pointer"
                  >
                    Max
                  </button>
                )}
              </div>

              {statusText && (
                <div className="flex items-center gap-2 text-[#6EE7B7] text-xs bg-[#6EE7B7]/10 border border-[#6EE7B7]/20 rounded-xl px-4 py-2.5">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="font-bold">{statusText}</span>
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
                disabled={isBusy}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={!amount || parsedAmount <= 0n || isBusy}
                className="flex-1 btn-primary px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isBusy && <Loader2 size={14} className="animate-spin" />}
                {getButtonLabel()}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
