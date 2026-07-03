import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { V2_MASTER_CHEF_ABI } from "@/lib/abis";
import { useConfigStore } from "@/store/useConfigStore";
import { txToast } from "@/components/dex/TxToast";

export function useStakingAdmin() {
  const { address } = useAccount();
  const stakingAddress = useConfigStore((s) => s.config?.contract_staking) as `0x${string}` | undefined;

  const STAKING_ADMIN_ROLE = "0x24791c44c040514a5d2580696fc45e7d3cb6c9fa65bf3db2e4755362d6c155b5";

  const { data: hasAdminRole } = useReadContract({
    address: stakingAddress,
    abi: V2_MASTER_CHEF_ABI,
    functionName: "hasRole",
    args: [STAKING_ADMIN_ROLE as `0x${string}`, address as `0x${string}`],
    query: { enabled: !!stakingAddress && !!address },
  });

  const { writeContractAsync: writeContract } = useWriteContract();

  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isTxError } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  useEffect(() => {
    if (isConfirmed && txHash) {
      txToast({ hash: txHash, status: "success", message: "Transaction confirmed!" });
    }
  }, [isConfirmed, txHash]);

  useEffect(() => {
    if (isTxError && txHash) {
      txToast({ hash: txHash, status: "error", message: "Transaction failed" });
    }
  }, [isTxError, txHash]);

  const isOwner = !!hasAdminRole;

  const reset = useCallback(() => {
    setTxHash(null);
  }, []);

  const addPoolWithRewarder = useCallback(async (
    lpToken: string,
    rewardToken: string,
    rewardPerSecond: bigint,
    totalRewardCap: bigint,
  ) => {
    if (!stakingAddress || !address) return;
    try {
      const hash = await writeContract({
        address: stakingAddress,
        abi: V2_MASTER_CHEF_ABI,
        functionName: "addPoolWithRewarder",
        args: [lpToken as `0x${string}`, rewardToken as `0x${string}`, rewardPerSecond, totalRewardCap],
      });
      setTxHash(hash);
      txToast({ hash, status: "pending", message: "Adding pool..." });
      return hash;
    } catch (e: unknown) {
      txToast({ hash: `error-${Date.now()}`, status: "error", message: e instanceof Error ? e.message : "Failed to add pool" });
      return null;
    }
  }, [stakingAddress, address, writeContract]);

  const setPoolRewardRate = useCallback(async (pid: number, rewardPerSecond: bigint) => {
    if (!stakingAddress || !address) return null;
    try {
      const hash = await writeContract({
        address: stakingAddress,
        abi: V2_MASTER_CHEF_ABI,
        functionName: "setPoolRewardRate",
        args: [BigInt(pid), rewardPerSecond],
      });
      setTxHash(hash);
      txToast({ hash, status: "pending", message: "Updating reward rate..." });
      return hash;
    } catch (e: unknown) {
      txToast({ hash: `error-${Date.now()}`, status: "error", message: e instanceof Error ? e.message : "Failed to update reward rate" });
      return null;
    }
  }, [stakingAddress, address, writeContract]);

  const setPoolRewardCap = useCallback(async (pid: number, totalRewardCap: bigint) => {
    if (!stakingAddress || !address) return null;
    try {
      const hash = await writeContract({
        address: stakingAddress,
        abi: V2_MASTER_CHEF_ABI,
        functionName: "setPoolRewardCap",
        args: [BigInt(pid), totalRewardCap],
      });
      setTxHash(hash);
      txToast({ hash, status: "pending", message: "Updating reward cap..." });
      return hash;
    } catch (e: unknown) {
      txToast({ hash: `error-${Date.now()}`, status: "error", message: e instanceof Error ? e.message : "Failed to update reward cap" });
      return null;
    }
  }, [stakingAddress, address, writeContract]);

  return {
    isOwner,
    owner: undefined,
    stakingAddress,
    addPoolWithRewarder,
    setPoolRewardRate,
    setPoolRewardCap,
    isConfirmed,
    isConfirming,
    txHash,
    reset,
  };
}
