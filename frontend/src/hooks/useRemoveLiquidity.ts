import { useCallback, useEffect, useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { V2_AMM_ABI } from "@/lib/abis";
import { REMOVE_LIQ_STEP as S, type RemoveLiquidityStep, type TokenOption } from "@/types/dex";
import { txToast } from "@/components/dex/TxToast";

interface UseRemoveLiquidityParams {
  token0: TokenOption | null;
  token1: TokenOption | null;
  poolAddress: `0x${string}` | undefined;
  lpAmount: bigint;
  amount0Min?: bigint;
  amount1Min?: bigint;
}

export function useRemoveLiquidity({
  token0,
  token1,
  poolAddress,
  lpAmount,
  amount0Min = 0n,
  amount1Min = 0n,
}: UseRemoveLiquidityParams) {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  const [step, setStep] = useState<RemoveLiquidityStep>(S.IDLE);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync: writeRemove } = useWriteContract();

  const receipt = useWaitForTransactionReceipt({ hash: txHash ?? undefined });
  const isConfirming = receipt.isLoading;
  const isConfirmed = receipt.isSuccess;
  const isTxError = receipt.isError;

  const canRemove = lpAmount > 0n && !!poolAddress && !!token0 && !!token1;

  const handleRemove = useCallback(async () => {
    if (!poolAddress || lpAmount <= 0n) {
      setError("Missing configuration or invalid amount");
      return;
    }

    setStep(S.SIGNING);
    setError(null);

    try {
      const hash = await writeRemove({
        address: poolAddress,
        abi: V2_AMM_ABI,
        functionName: "removeLiquidity",
        args: [lpAmount, amount0Min, amount1Min],
      });

      setTxHash(hash);
      setStep(S.PENDING);
      txToast({ hash, status: "pending", message: "Removing liquidity...", txType: "remove_liquidity", sender: address });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Remove liquidity failed");
      setStep(S.FAILED);
    }
  }, [poolAddress, lpAmount, amount0Min, amount1Min, writeRemove, address]);

  useEffect(() => {
    if (!txHash) return;
    if (isConfirmed) {
      txToast({ hash: txHash, status: "success", message: "Liquidity removed!", txType: "remove_liquidity", sender: address });
      queryClient.invalidateQueries({ queryKey: ["pairs"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setTimeout(() => setStep(S.CONFIRMED), 0);
    }
    if (isTxError) {
      txToast({ hash: txHash, status: "error", message: "Remove liquidity failed", txType: "remove_liquidity", sender: address });
      setTimeout(() => {
        setError("Transaction reverted");
        setStep(S.FAILED);
      }, 0);
    }
  }, [txHash, isConfirmed, isTxError, queryClient, address]);

  const reset = useCallback(() => {
    setStep(S.IDLE);
    setTxHash(null);
    setError(null);
  }, []);

  return {
    step,
    isConfirming,
    isConfirmed,
    isTxError,
    txHash,
    error,
    canRemove,
    handleRemove,
    reset,
  };
}
