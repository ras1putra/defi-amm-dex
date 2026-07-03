import { useCallback, useEffect, useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Address } from "viem";
import { ERC20_ABI, V2_ROUTER_ABI } from "@/lib/abis";
import { parseAmount, swapDeadline, minAmountOut } from "@/lib/amm";
import { useAddLiquidityStore } from "@/store/useAddLiquidityStore";
import { useConfigStore } from "@/store/useConfigStore";
import { ADD_LIQ_STEP as S, type TokenOption } from "@/types/dex";
import { txToast } from "@/components/dex/TxToast";

interface UseAddLiquidityParams {
  token0: TokenOption | null;
  token1: TokenOption | null;
  amount0: string;
  amount1: string;
  slippageBps?: number;
  poolAddress?: `0x${string}`;
}

export function useAddLiquidity({
  token0,
  token1,
  amount0,
  amount1,
  slippageBps = 50,
}: UseAddLiquidityParams) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { step, setStep, setTxHash, setError, reset } = useAddLiquidityStore();

  const routerAddress = useConfigStore((s) => s.config?.contract_v2_router) as `0x${string}` | undefined;
  const wethAddress = useConfigStore((s) => s.config?.contract_weth) as `0x${string}` | undefined;

  const isWeth0 = !!wethAddress && !!token0 && token0.address.toLowerCase() === wethAddress.toLowerCase();
  const isWeth1 = !!wethAddress && !!token1 && token1.address.toLowerCase() === wethAddress.toLowerCase();
  const parsed0 = amount0 ? parseAmount(amount0, token0?.decimals ?? 18) : 0n;
  const parsed1 = amount1 ? parseAmount(amount1, token1?.decimals ?? 18) : 0n;

  const { data: allowance0, refetch: refetchAllowance0 } = useReadContract({
    address: isWeth0 || !token0 ? undefined : token0.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: isWeth0 || !token0 || !address || !routerAddress ? undefined : [address, routerAddress],
    query: { enabled: !isWeth0 && !!token0 && !!address && !!routerAddress },
  });

  const { data: allowance1, refetch: refetchAllowance1 } = useReadContract({
    address: isWeth1 || !token1 ? undefined : token1.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: isWeth1 || !token1 || !address || !routerAddress ? undefined : [address, routerAddress],
    query: { enabled: !isWeth1 && !!token1 && !!address && !!routerAddress },
  });

  const needsApprove0 = !isWeth0 && !!token0 && allowance0 !== undefined && allowance0 < parsed0;
  const needsApprove1 = !isWeth1 && !!token1 && allowance1 !== undefined && allowance1 < parsed1;

  const allowancesLoaded =
    (isWeth0 || !token0 || !routerAddress || allowance0 !== undefined) &&
    (isWeth1 || !token1 || !routerAddress || allowance1 !== undefined);

  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeAddLiquidity } = useWriteContract();

  const txHash = useAddLiquidityStore((s) => s.txHash);

  const [pendingApproveTxHash, setPendingApproveTxHash] = useState<`0x${string}` | null>(null);
  const [addLiqTxHash, setAddLiqTxHash] = useState<`0x${string}` | null>(null);

  const { isSuccess: isApproveConfirmed, isError: isApproveError } =
    useWaitForTransactionReceipt({ hash: pendingApproveTxHash ?? undefined });

  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isTxError } =
    useWaitForTransactionReceipt({ hash: addLiqTxHash ?? undefined });

  useEffect(() => {
    if (step === S.FAILED || step === S.CONFIRMED || step === S.SIGNING || step === S.PENDING ||
      step === S.APPROVING_0 || step === S.APPROVING_1) {
      return;
    }
    if (parsed0 === 0n && parsed1 === 0n) {
      if (step !== S.IDLE) {
        setTimeout(() => setStep(S.IDLE), 0);
      }
      return;
    }
    if (!allowancesLoaded) return;

    if (needsApprove0) {
      if (step !== S.NEEDS_APPROVE_0) {
        setTimeout(() => setStep(S.NEEDS_APPROVE_0), 0);
      }
    } else if (needsApprove1) {
      if (step !== S.NEEDS_APPROVE_1) {
        setTimeout(() => setStep(S.NEEDS_APPROVE_1), 0);
      }
    } else {
      if (step !== S.READY) {
        setTimeout(() => setStep(S.READY), 0);
      }
    }
  }, [parsed0, parsed1, needsApprove0, needsApprove1, allowancesLoaded, step, setStep]);

  useEffect(() => {
    if (pendingApproveTxHash) {
      if (isApproveConfirmed) {
        const isToken0Approve = step === S.APPROVING_0;
        const refetch = isToken0Approve ? refetchAllowance0 : refetchAllowance1;
        const tokenSymbol = isToken0Approve ? token0?.symbol : token1?.symbol;

        txToast({
          hash: pendingApproveTxHash,
          status: "success",
          message: `${tokenSymbol || "Token"} approved successfully!`,
        });

        refetch().then(() => {
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
  }, [
    isApproveConfirmed,
    isApproveError,
    pendingApproveTxHash,
    step,
    refetchAllowance0,
    refetchAllowance1,
    setStep,
    setError,
    token0?.symbol,
    token1?.symbol,
  ]);

  const handleApprove0 = useCallback(async () => {
    if (!token0 || !routerAddress) return;
    setStep(S.APPROVING_0);
    setError(null);
    try {
      const hash = await writeApprove({
        address: token0.address as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [routerAddress, parsed0],
      });
      setPendingApproveTxHash(hash);
      txToast({ hash, status: "pending", message: `Approving ${token0.symbol}...` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setStep(S.FAILED);
    }
  }, [token0, routerAddress, writeApprove, setStep, setError, parsed0]);

  const handleApprove1 = useCallback(async () => {
    if (!token1 || !routerAddress) return;
    setStep(S.APPROVING_1);
    setError(null);
    try {
      const hash = await writeApprove({
        address: token1.address as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [routerAddress, parsed1],
      });
      setPendingApproveTxHash(hash);
      txToast({ hash, status: "pending", message: `Approving ${token1.symbol}...` });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setStep(S.FAILED);
    }
  }, [token1, routerAddress, writeApprove, setStep, setError, parsed1]);

  const handleAddLiquidity = useCallback(async () => {
    if (!token0 || !token1 || !address || !routerAddress) {
      setError("Missing configuration");
      return;
    }
    setStep(S.SIGNING);
    setError(null);

    const amount0Min = slippageBps > 0 ? minAmountOut(parsed0, slippageBps) : 0n;
    const amount1Min = slippageBps > 0 ? minAmountOut(parsed1, slippageBps) : 0n;
    const deadline = swapDeadline();

    try {
      let hash: `0x${string}`;

      if (isWeth0 || isWeth1) {
        const token = isWeth0 ? token1 : token0;
        const amountToken = isWeth0 ? parsed1 : parsed0;
        const amountETH = isWeth0 ? parsed0 : parsed1;
        const amountTokenMin = isWeth0 ? amount1Min : amount0Min;
        const amountETHMin = isWeth0 ? amount0Min : amount1Min;

        hash = await writeAddLiquidity({
          address: routerAddress,
          abi: V2_ROUTER_ABI,
          functionName: "addLiquidityETH",
          args: [token.address, amountToken, amountTokenMin, amountETHMin, address, deadline],
          value: amountETH,
        });
      } else {
        hash = await writeAddLiquidity({
          address: routerAddress,
          abi: V2_ROUTER_ABI,
          functionName: "addLiquidity",
          args: [token0.address, token1.address, parsed0, parsed1, amount0Min, amount1Min, address, deadline],
        });
      }

      setAddLiqTxHash(hash);
      setTxHash(hash);
      setStep(S.PENDING);
      txToast({ hash, status: "pending", message: `Adding liquidity to ${token0.symbol}/${token1.symbol}...`, txType: "add_liquidity", sender: address });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Add liquidity failed");
      setStep(S.FAILED);
    }
  }, [
    token0, token1, address, routerAddress, parsed0, parsed1, isWeth0, isWeth1,
    writeAddLiquidity, setStep, setTxHash, setError, slippageBps,
  ]);

  useEffect(() => {
    if (step === S.PENDING && isConfirmed && addLiqTxHash) {
      txToast({ hash: addLiqTxHash, status: "success", message: "Liquidity added!", txType: "add_liquidity", sender: address });
      queryClient.invalidateQueries({ queryKey: ["pairs"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setTimeout(() => setStep(S.CONFIRMED), 0);
    }
    if (step === S.PENDING && isTxError && addLiqTxHash) {
      txToast({ hash: addLiqTxHash, status: "error", message: "Add liquidity failed", txType: "add_liquidity", sender: address });
      setTimeout(() => {
        setError("Transaction reverted");
        setStep(S.FAILED);
      }, 0);
    }
  }, [step, isConfirmed, isTxError, addLiqTxHash, setStep, setError, queryClient, address]);

  return {
    step,
    needsApprove0,
    needsApprove1,
    isConfirming,
    isConfirmed,
    isTxError,
    txHash,
    allowancesLoaded,
    handleApprove0,
    handleApprove1,
    handleAddLiquidity,
    reset,
  };
}
