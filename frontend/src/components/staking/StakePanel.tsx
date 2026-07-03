"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { sanitizeDecimalInput } from "@/schema/token";
import { useStakingAction } from "@/hooks/useStakingAction";
import { useStakingAdmin } from "@/hooks/useStakingAdmin";
import { ERC20_ABI } from "@/lib/abis";
import type { StakingPool } from "@/types/staking";
import { Loader2, Gift, Wallet, ChevronDown, Settings } from "lucide-react";
import { formatBalance, formatApr } from "@/lib/format";
import { useConfigStore } from "@/store/useConfigStore";
import FundModal from "./FundModal";
import ManagePoolModal from "./ManagePoolModal";
import TxConfirmedModal from "@/components/shared/TxConfirmedModal";

interface StakePanelProps {
  pool: StakingPool;
  refetchPools: () => Promise<void>;
}

export default function StakePanel({ pool, refetchPools }: StakePanelProps) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"stake" | "unstake">("stake");
  const [showFundModal, setShowFundModal] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [showManageModal, setShowManageModal] = useState(false);
  const { isOwner } = useStakingAdmin();
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);
  const [claimedRewardsCache, setClaimedRewardsCache] = useState("0");

  const { data: rawDecimals } = useReadContract({
    address: pool.staking_token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: !!pool.staking_token },
  });
  const tokenDecimals = (rawDecimals as number) ?? 18;

  const { data: rawBalance, refetch: refetchBalance } = useReadContract({
    address: pool.staking_token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!pool.staking_token },
  });
  const tokenBalance = (rawBalance as bigint) ?? 0n;

  const isClosed = pool.is_closed;

  const {
    step, needsApproval, isApproving, isSigning, isConfirming, isConfirmed, isTxError, error, txHash, action,
    handleApprove, handleDeposit, handleWithdraw, handleClaim, reset,
  } = useStakingAction({
    poolId: pool.pool_id,
    stakingToken: pool.staking_token,
    contractAddress: pool.address,
    amount,
    tokenDecimals,
    pendingRewards: pool.user_pending_rewards,
    stakingTokenSymbol: pool.staking_token_symbol,
    rewardTokenSymbol: pool.reward_token_symbol,
    rewardTokenDecimals: pool.reward_token_decimals,
    enabled: !isClosed,
  });

  const isBusy = isApproving || isSigning || (isConfirming && step === "pending");
  const showStakeTab = !isClosed && tab === "stake";

  useEffect(() => {
    if (isConfirmed) {
      refetchPools();
      refetchBalance();
    }
    if (isTxError) {
      refetchPools();
      refetchBalance();
    }
  }, [isConfirmed, isTxError, refetchPools, refetchBalance]);

  const actionLabel = () => {
    if (isApproving) return "Approving...";
    if (isSigning) return "Confirm in wallet...";
    if (isConfirming) return "Confirming...";
    if (isClosed) return "Pool Closed";
    if (showStakeTab) {
      if (needsApproval) return `Approve ${pool.staking_token_symbol}`;
      return `Stake ${pool.staking_token_symbol}`;
    }
    return `Unstake ${pool.staking_token_symbol}`;
  };

  const handleAction = () => {
    if (isClosed) return;
    setClaimedRewardsCache(pool.user_pending_rewards);
    if (showStakeTab) {
      if (needsApproval) return handleApprove();
      return handleDeposit();
    }
    return handleWithdraw();
  };

  const handleClaimWithCache = () => {
    setClaimedRewardsCache(pool.user_pending_rewards);
    handleClaim();
  };

  const handleMax = () => {
    if (tokenBalance > 0n) {
      setAmount(formatUnits(tokenBalance, tokenDecimals));
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6 md:p-8 max-w-full sm:max-w-md w-full min-h-[400px] flex flex-col justify-between overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
          <button
            onClick={() => { setTab("stake"); reset(); setAmount(""); }}
            disabled={isClosed}
            className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${tab === "stake" && !isClosed ? "bg-[#6EE7B7] text-[#0A0A0A]" : "text-white/70 hover:text-white"}`}
          >
            Stake
          </button>
          <button
            onClick={() => { setTab("unstake"); reset(); setAmount(""); }}
            className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${tab === "unstake" ? "bg-[#6EE7B7] text-[#0A0A0A]" : "text-white/70 hover:text-white"}`}
          >
            Unstake
          </button>
        </div>

        {BigInt(pool.reward_rate) === 0n && !isClosed && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono-dm bg-amber-400/10 text-amber-400 border border-amber-400/20 uppercase tracking-wider">
            Paused
          </span>
        )}
        {isClosed && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono-dm bg-red-400/10 text-red-400 border border-red-400/20 uppercase tracking-wider">
            Closed
          </span>
        )}
        {isOwner && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowFundModal(true)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold font-mono-dm bg-[#6EE7B7]/10 text-[#6EE7B7] border border-[#6EE7B7]/20 hover:bg-[#6EE7B7]/20 transition-colors cursor-pointer flex items-center gap-1"
            >
              <Wallet size={11} /> Fund
            </button>
            <button
              onClick={() => setShowManageModal(true)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center justify-center"
              title="Manage Pool"
            >
              <Settings size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.02] focus-within:border-[#6EE7B7]/30 focus-within:bg-white/[0.03] focus-within:outline-none transition-all space-y-3 overflow-hidden">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm shrink-0">
            {showStakeTab ? "You stake" : "You unstake"}
          </span>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xs text-white/40 font-mono-dm truncate min-w-0">
              Bal: {showStakeTab
                ? formatBalance(tokenBalance, tokenDecimals)
                : formatBalance(BigInt(pool.user_staked || "0"), tokenDecimals)
              }
            </span>
            {tab === "stake" && tokenBalance > 0n && !isClosed && (
              <button
                onClick={handleMax}
                className="text-xs font-bold text-[#6EE7B7] hover:text-[#34D399] transition-colors font-mono tracking-wider uppercase cursor-pointer"
              >
                Max
              </button>
            )}
            {tab === "unstake" && BigInt(pool.user_staked || "0") > 0n && (
              <button
                onClick={() => setAmount(formatUnits(BigInt(pool.user_staked), tokenDecimals))}
                className="text-xs font-bold text-[#6EE7B7] hover:text-[#34D399] transition-colors font-mono tracking-wider uppercase cursor-pointer"
              >
                Max
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
          <input
            type="text"
            inputMode="decimal"
            pattern="^[0-9]*[.,]?[0-9]*$"
            value={amount}
            onChange={(e) => {
              const val = sanitizeDecimalInput(e.target.value);
              if (val !== null) setAmount(val);
            }}
            placeholder="0.0"
            disabled={isBusy || isClosed}
            className="min-w-0 flex-1 bg-transparent text-xl sm:text-2xl font-bold text-white outline-none placeholder:text-white/20 disabled:opacity-50 overflow-hidden"
          />
          <span className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm font-bold text-[#6EE7B7]">
            {pool.staking_token_symbol}
          </span>
        </div>
      </div>

      <div className="text-xs text-white/40 font-mono-dm mt-2 flex flex-wrap justify-between gap-x-2 min-w-0">
        <span className="truncate min-w-0">Staked: {Number(formatUnits(BigInt(pool.user_staked || "0"), tokenDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {pool.staking_token_symbol}</span>
        {!isClosed && Number(pool.user_pending_rewards) > 0 && (
          <span className="text-[#6EE7B7] shrink-0">
            Pending: {Number(formatUnits(BigInt(pool.user_pending_rewards), pool.reward_token_decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {pool.reward_token_symbol}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all mt-4">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between p-3.5 text-xs font-mono-dm text-white/70 hover:text-white/70 transition-colors cursor-pointer"
        >
          <span>Details</span>
          <div className="flex items-center gap-2">
            {!isClosed && (
              <span className="text-[#6EE7B7]">{formatApr(pool.apr)} APR</span>
            )}
            <ChevronDown size={14} className={`transition-transform duration-200 ${showDetails ? "rotate-180 text-white" : "text-white/70"}`} />
          </div>
        </button>

        {showDetails && (
          <div className="px-3.5 pb-3.5 space-y-2 font-mono-dm text-xs text-white/40 border-t border-white/[0.04] pt-2.5 overflow-hidden">
            <div className="flex justify-between items-center min-w-0">
              <span className="shrink-0">APR</span>
              <span className={`shrink ${isClosed ? "text-white/70" : "text-[#6EE7B7]"}`}>
                {isClosed ? "—" : formatApr(pool.apr)}
              </span>
            </div>
            <div className="flex justify-between items-center min-w-0">
              <span className="shrink-0">Total Staked</span>
              <span className="text-white/70 font-bold text-right truncate ml-2 min-w-0">{Number(formatUnits(BigInt(pool.total_staked || "0"), tokenDecimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {pool.staking_token_symbol}</span>
            </div>
            {pool.remaining_rewards !== "0" && (
              <div className="flex justify-between items-center min-w-0">
                <span className="shrink-0">Reward Pool</span>
                <span className="text-white/70 font-bold text-right truncate ml-2 min-w-0">{Number(formatUnits(BigInt(pool.remaining_rewards), pool.reward_token_decimals)).toLocaleString(undefined, { maximumFractionDigits: 2 })} {pool.reward_token_symbol}</span>
              </div>
            )}
            <div className="flex justify-between items-center min-w-0">
              <span className="shrink-0">Pending</span>
              <span className="text-[#6EE7B7] font-bold text-right truncate ml-2 min-w-0">{Number(formatUnits(BigInt(pool.user_pending_rewards), pool.reward_token_decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {pool.reward_token_symbol}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-2 mt-4 text-center font-mono-dm">
          {error}
        </div>
      )}

      <div className="flex gap-2 mt-6 min-w-0">
        <button
          onClick={handleAction}
          disabled={isBusy || !amount || isClosed}
          className="btn-primary flex-1 min-w-0 px-4 sm:px-6 py-3 rounded-xl text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isBusy && <Loader2 size={14} className="animate-spin" />}
          {actionLabel()}
        </button>

        {Number(pool.user_pending_rewards) > 0 && (
          <button
            onClick={handleClaimWithCache}
            disabled={isBusy}
            className="px-4 py-3 rounded-xl text-sm font-bold bg-[#6EE7B7]/10 text-[#6EE7B7] border border-[#6EE7B7]/20 hover:bg-[#6EE7B7]/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Gift size={14} />
            Claim
          </button>
        )}
      </div>

      {showFundModal && (
        <FundModal
          rewarderAddress={pool.rewarder_address}
          rewardToken={pool.reward_token}
          rewardTokenSymbol={pool.reward_token_symbol}
          onClose={() => setShowFundModal(false)}
        />
      )}

      {showManageModal && (
        <ManagePoolModal
          pool={pool}
          onClose={() => setShowManageModal(false)}
          refetchPools={refetchPools}
        />
      )}

      {isConfirmed && (
        <TxConfirmedModal
          title={action === "deposit" ? "Staked!" : action === "withdraw" ? "Unstaked!" : "Rewards Claimed!"}
          details={[
            ...(action === "deposit" || action === "withdraw" ? [{ label: action === "deposit" ? "Staked" : "Unstaked", value: `${amount} ${pool.staking_token_symbol}` }] : []),
            ...((action as string) === "claim" || ((action as string) !== "claim" && claimedRewardsCache && BigInt(claimedRewardsCache) > 0n) ? [{ label: "Received Rewards", value: `${claimedRewardsCache ? Number(formatUnits(BigInt(claimedRewardsCache), pool.reward_token_decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0"} ${pool.reward_token_symbol}`, highlight: true }] : []),
          ]}
          txHash={txHash}
          explorerUrl={explorerUrl}
          accentColor="amber"
          onClose={() => { reset(); setAmount(""); }}
        />
      )}
    </div>
  );
}
