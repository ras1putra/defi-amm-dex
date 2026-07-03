import { useCallback, useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { ERC20_ABI, V2_ROUTER_ABI } from "@/lib/abis";
import { parseAmount, minAmountOut, swapDeadline } from "@/lib/amm";
import { useSwapStore } from "@/store/useSwapStore";
import { useConfigStore } from "@/store/useConfigStore";
import { SWAP_STEP, type TokenOption } from "@/types/dex";
import { txToast } from "@/components/dex/TxToast";
import { type Address, formatUnits } from "viem";

const S = SWAP_STEP;

interface UseSwapParams {
  tokenIn: TokenOption | null;
  tokenOut: TokenOption | null;
  amountIn: string;
  amountOut: bigint;
  slippageBps: number;
  route: string[] | null;
  exceedsReserve?: boolean;
}

export function useSwap({ tokenIn, tokenOut, amountIn, amountOut, slippageBps, route, exceedsReserve = false }: UseSwapParams) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { step, setStep, setTxHash, setError, reset } = useSwapStore();
  const routerAddress = useConfigStore((s) => s.config?.contract_v2_router) as `0x${string}` | undefined;
  const wethAddress = useConfigStore((s) => s.config?.contract_weth) as `0x${string}` | undefined;

  const parsedIn = amountIn ? parseAmount(amountIn, tokenIn?.decimals ?? 18) : 0n;
  const isWethIn = !!wethAddress && !!tokenIn && tokenIn.address.toLowerCase() === wethAddress.toLowerCase();
  const isWethOut = !!wethAddress && !!tokenOut && tokenOut.address.toLowerCase() === wethAddress.toLowerCase();

  const { data: allowance, isLoading: isLoadingAllowance, refetch: refetchAllowance } = useReadContract({
    address: isWethIn || !tokenIn ? undefined : tokenIn.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: isWethIn || !tokenIn || !address || !routerAddress ? undefined : [address, routerAddress],
    query: {
      enabled: !isWethIn && !!tokenIn && !!address && !!routerAddress,
      staleTime: 0,
    },
  });

  const isCheckingAllowance = !isWethIn && !!tokenIn && !!address && isLoadingAllowance;
  const needsApproval = !isWethIn && !!tokenIn && (allowance === undefined || allowance < parsedIn);

  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeSwap } = useWriteContract();

  const txHash = useSwapStore((s) => s.txHash);
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isTxError } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const [pendingApproveTxHash, setPendingApproveTxHash] = useState<`0x${string}` | null>(null);
  const { isSuccess: isApproveConfirmed, isError: isApproveError } = useWaitForTransactionReceipt({
    hash: pendingApproveTxHash ?? undefined,
  });

  useEffect(() => {
    if (step === S.FAILED || step === S.CONFIRMED || step === S.SIGNING || step === S.PENDING || step === S.APPROVING) {
      return;
    }
    if (step === S.IDLE && parsedIn > 0n && !exceedsReserve) {
      if (needsApproval) {
        setTimeout(() => setStep(S.NEEDS_APPROVE), 0);
      } else {
        setTimeout(() => setStep(S.QUOTED), 0);
      }
    }
  }, [parsedIn, needsApproval, step, setStep, exceedsReserve]);

  useEffect(() => {
    if (pendingApproveTxHash) {
      if (isApproveConfirmed) {
        txToast({
          hash: pendingApproveTxHash,
          status: "success",
          message: `${tokenIn?.symbol || "Token"} approved successfully!`,
        });
        refetchAllowance().then(() => {
          setTimeout(() => {
            setPendingApproveTxHash(null);
            setStep(S.IDLE);
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
          setStep(S.FAILED);
        }, 0);
      }
    }
  }, [isApproveConfirmed, isApproveError, pendingApproveTxHash, refetchAllowance, setStep, setError, tokenIn]);

  const handleApprove = useCallback(async () => {
    if (!tokenIn || !routerAddress) return;
    setStep(S.APPROVING);
    setError(null);
    try {
      const hash = await writeApprove({
        address: tokenIn.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [routerAddress, parsedIn],
      });
      setPendingApproveTxHash(hash);
      txToast({ hash, status: "pending", message: `Approving ${tokenIn.symbol}...` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setStep(S.FAILED);
    }
  }, [tokenIn, writeApprove, setStep, setError, routerAddress, parsedIn]);

  const handleSwap = useCallback(async () => {
    if (!tokenIn || !tokenOut || !address || !routerAddress || !route || route.length < 2) {
      setError("Missing configuration or route");
      return;
    }

    if (exceedsReserve) {
      setError("Amount exceeds available pool liquidity");
      setStep(S.FAILED);
      return;
    }

    setStep(S.SIGNING);
    setError(null);

    const minOut = slippageBps > 0 && amountOut > 0n
      ? minAmountOut(amountOut, slippageBps)
      : 0n;

    const deadline = swapDeadline();

    try {
      let hash: `0x${string}`;

      if (isWethIn) {
        hash = await writeSwap({
          address: routerAddress,
          abi: V2_ROUTER_ABI,
          functionName: "swapExactETHForTokens",
          args: [minOut, route as Address[], address, deadline],
          value: parsedIn,
        });
      } else if (isWethOut) {
        hash = await writeSwap({
          address: routerAddress,
          abi: V2_ROUTER_ABI,
          functionName: "swapExactTokensForETH",
          args: [parsedIn, minOut, route as Address[], address, deadline],
        });
      } else {
        hash = await writeSwap({
          address: routerAddress,
          abi: V2_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [parsedIn, minOut, route as Address[], address, deadline],
        });
      }

      setTxHash(hash);
      setStep(S.PENDING);
      txToast({ hash, status: "pending", message: `Swapping ${amountIn} ${tokenIn.symbol} for ${tokenOut.symbol}...`, txType: "swap", sender: address });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Swap failed");
      setStep(S.FAILED);
    }
  }, [
    tokenIn, tokenOut, address, parsedIn, isWethIn, isWethOut, amountOut, slippageBps,
    writeSwap, setStep, setTxHash, setError, routerAddress, exceedsReserve, route, amountIn
  ]);

  useEffect(() => {
    if (step === S.PENDING && isConfirmed && txHash) {
      const outAmtStr = tokenOut
        ? Number(formatUnits(amountOut, tokenOut.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
        : "";
      const msg = tokenIn && tokenOut
        ? `Swapped ${amountIn} ${tokenIn.symbol} for ${outAmtStr} ${tokenOut.symbol}!`
        : "Swap confirmed!";
      txToast({ hash: txHash, status: "success", message: msg, txType: "swap", sender: address });
      queryClient.invalidateQueries({ queryKey: ["pairs"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setStep(S.CONFIRMED);
    }
    if (step === S.PENDING && isTxError && txHash) {
      txToast({ hash: txHash, status: "error", message: "Swap failed", txType: "swap", sender: address });
      setError("Transaction reverted");
      setStep(S.FAILED);
    }
  }, [step, isConfirmed, isTxError, txHash, setStep, setError, tokenIn, tokenOut, amountIn, amountOut, queryClient, address]);

  return {
    step,
    allowance,
    needsApproval,
    isCheckingAllowance,
    isApproving: step === S.APPROVING,
    isSwapping: step === S.SIGNING,
    isConfirming,
    isConfirmed,
    txHash,
    isTxError,
    handleApprove,
    handleSwap,
    reset,
  };
}
