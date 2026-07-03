import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { ERC20_ABI, V2_MASTER_CHEF_ABI } from "@/lib/abis";
import { parseAmount, parseErrorMessage } from "@/lib/amm";
import { txToast } from "@/components/dex/TxToast";
import { formatUnits } from "viem";

type StakingStep = "idle" | "needsApprove" | "approving" | "signing" | "pending" | "confirmed" | "failed";

interface UseStakingActionParams {
  poolId: number;
  stakingToken: string;
  contractAddress: string;
  amount: string;
  tokenDecimals: number;
  pendingRewards?: string;
  stakingTokenSymbol?: string;
  rewardTokenSymbol?: string;
  rewardTokenDecimals?: number;
  enabled?: boolean;
}

export function useStakingAction({
  poolId, stakingToken, contractAddress, amount, tokenDecimals,
  pendingRewards, stakingTokenSymbol = "tokens", rewardTokenSymbol = "rewards",
  rewardTokenDecimals = 18, enabled = true
}: UseStakingActionParams) {
  const { address } = useAccount();
  const [step, setStep] = useState<StakingStep>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"deposit" | "withdraw" | "claim" | null>(null);
  const toastShownRef = useRef(false);

  const hasPendingRewards = pendingRewards && BigInt(pendingRewards) > 0n;

  const parsedAmount = amount ? parseAmount(amount, tokenDecimals) : 0n;
  const contractAddr = contractAddress as `0x${string}`;
  const tokenAddr = stakingToken as `0x${string}`;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, contractAddr] : undefined,
    query: { enabled: enabled && !!address && !!stakingToken && !!contractAddress },
  });

  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeContract } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isTxError } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const [pendingApproveTxHash, setPendingApproveTxHash] = useState<`0x${string}` | null>(null);
  const { isSuccess: isApproveConfirmed, isError: isApproveError } = useWaitForTransactionReceipt({
    hash: pendingApproveTxHash ?? undefined,
  });

  useEffect(() => {
    if (step === "pending" && isConfirmed && txHash && !toastShownRef.current) {
      toastShownRef.current = true;
      let label = "Transaction confirmed";
      let txType: "stake" | "unstake" | "claim" = "claim";

      const rewardsStr = pendingRewards
        ? Number(formatUnits(BigInt(pendingRewards), rewardTokenDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
        : "";

      if (action === "deposit") {
        label = hasPendingRewards
          ? `Staked ${amount} ${stakingTokenSymbol} & Claimed ${rewardsStr} ${rewardTokenSymbol}`
          : `Staked ${amount} ${stakingTokenSymbol}`;
        txType = "stake";
      } else if (action === "withdraw") {
        label = hasPendingRewards
          ? `Unstaked ${amount} ${stakingTokenSymbol} & Claimed ${rewardsStr} ${rewardTokenSymbol}`
          : `Unstaked ${amount} ${stakingTokenSymbol}`;
        txType = "unstake";
      } else if (action === "claim") {
        label = `Claimed ${rewardsStr} ${rewardTokenSymbol} rewards`;
        txType = "claim";
      }

      txToast({ hash: txHash, status: "success", message: `${label}!`, txType, sender: address });
      setStep("confirmed");
    }
  }, [step, isConfirmed, txHash, action, hasPendingRewards, address, amount, stakingTokenSymbol, rewardTokenSymbol, rewardTokenDecimals, pendingRewards]);

  useEffect(() => {
    if (step === "pending" && isTxError && txHash && !toastShownRef.current) {
      toastShownRef.current = true;
      const label = action === "deposit" ? "Stake" : action === "withdraw" ? "Unstake" : "Claim";
      const txType = action === "deposit" ? "stake" : action === "withdraw" ? "unstake" : "claim";
      txToast({ hash: txHash, status: "error", message: `${label} failed`, txType, sender: address });
      setError("Transaction reverted");
      setStep("failed");
    }
  }, [step, isTxError, txHash, action, address]);

  useEffect(() => {
    if (pendingApproveTxHash) {
      if (isApproveConfirmed) {
        txToast({
          hash: pendingApproveTxHash,
          status: "success",
          message: "Token approved successfully!",
        });
        refetchAllowance().then(() => {
          setTimeout(() => {
            setPendingApproveTxHash(null);
            setStep("idle");
          }, 0);
        });
      } else if (isApproveError) {
        txToast({
          hash: pendingApproveTxHash,
          status: "error",
          message: "Approval transaction failed",
        });
        setTimeout(() => {
          setPendingApproveTxHash(null);
          setError("Approval transaction failed");
          setStep("failed");
        }, 0);
      }
    }
  }, [isApproveConfirmed, isApproveError, pendingApproveTxHash, refetchAllowance, setStep, setError]);

  const needsApproval = step !== "confirmed" && step !== "failed" && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  const handleApprove = useCallback(async () => {
    if (!address || !tokenAddr || !contractAddr) return;
    setStep("approving");
    setError(null);
    toastShownRef.current = false;
    try {
      const hash = await writeApprove({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [contractAddr, parsedAmount],
      });
      setPendingApproveTxHash(hash);
      txToast({ hash, status: "pending", message: "Approving token..." });
    } catch (e: unknown) {
      setError(parseErrorMessage(e, "Approval failed"));
      setStep("failed");
    }
  }, [address, tokenAddr, contractAddr, writeApprove, setError, parsedAmount]);

  const handleDeposit = useCallback(async () => {
    if (!address || !contractAddr || parsedAmount <= 0n) return;

    if (needsApproval) {
      setStep("needsApprove");
      return;
    }

    setAction("deposit");
    setStep("signing");
    setError(null);
    toastShownRef.current = false;
    try {
      const hash = await writeContract({
        address: contractAddr,
        abi: V2_MASTER_CHEF_ABI,
        functionName: "deposit",
        args: [BigInt(poolId), parsedAmount],
      });
      setStep("pending");
      toastShownRef.current = false;
      const message = hasPendingRewards 
        ? `Staking ${amount} ${stakingTokenSymbol} & Claiming rewards...` 
        : `Staking ${amount} ${stakingTokenSymbol}...`;
      txToast({ hash, status: "pending", message, txType: "stake", sender: address });
      setTxHash(hash);
    } catch (e: unknown) {
      setError(parseErrorMessage(e, "Deposit failed"));
      setStep("failed");
    }
  }, [address, contractAddr, poolId, parsedAmount, amount, needsApproval, writeContract, setError, hasPendingRewards, stakingTokenSymbol]);

  const handleWithdraw = useCallback(async () => {
    if (!address || !contractAddr || parsedAmount <= 0n) return;
    setAction("withdraw");
    setStep("signing");
    setError(null);
    toastShownRef.current = false;
    try {
      const hash = await writeContract({
        address: contractAddr,
        abi: V2_MASTER_CHEF_ABI,
        functionName: "withdraw",
        args: [BigInt(poolId), parsedAmount],
      });
      setStep("pending");
      toastShownRef.current = false;
      const message = hasPendingRewards 
        ? `Unstaking ${amount} ${stakingTokenSymbol} & Claiming rewards...` 
        : `Unstaking ${amount} ${stakingTokenSymbol}...`;
      txToast({ hash, status: "pending", message, txType: "unstake", sender: address });
      setTxHash(hash);
    } catch (e: unknown) {
      setError(parseErrorMessage(e, "Withdraw failed"));
      setStep("failed");
    }
  }, [address, contractAddr, poolId, parsedAmount, amount, writeContract, setError, hasPendingRewards, stakingTokenSymbol]);

  const handleClaim = useCallback(async () => {
    if (!address || !contractAddr) return;
    setAction("claim");
    setStep("signing");
    setError(null);
    toastShownRef.current = false;
    try {
      const hash = await writeContract({
        address: contractAddr,
        abi: V2_MASTER_CHEF_ABI,
        functionName: "harvest",
        args: [BigInt(poolId)],
      });
      setStep("pending");
      toastShownRef.current = false;
      const rewardsStr = pendingRewards
        ? Number(formatUnits(BigInt(pendingRewards), rewardTokenDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
        : "";
      txToast({ hash, status: "pending", message: `Claiming ${rewardsStr} ${rewardTokenSymbol} rewards...`, txType: "claim", sender: address });
      setTxHash(hash);
    } catch (e: unknown) {
      setError(parseErrorMessage(e, "Claim failed"));
      setStep("failed");
    }
  }, [address, contractAddr, poolId, writeContract, setError, pendingRewards, rewardTokenDecimals, rewardTokenSymbol]);

  const reset = useCallback(() => {
    setStep("idle");
    setTxHash(null);
    setError(null);
    setAction(null);
    toastShownRef.current = false;
  }, []);

  return {
    step,
    needsApproval,
    isApproving: step === "approving",
    isSigning: step === "signing",
    isConfirming,
    isConfirmed: step === "confirmed",
    isTxError: step === "failed",
    txHash,
    action,
    error,
    handleApprove,
    handleDeposit,
    handleWithdraw,
    handleClaim,
    reset,
  };
}
