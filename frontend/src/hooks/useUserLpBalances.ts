import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { V2_AMM_ABI, V2_LP_TOKEN_ABI } from "@/lib/abis";

interface LpInfo {
  balance: bigint;
  sharePct: string;
}

export function useUserLpBalances(
  poolAddresses: `0x${string}`[],
  userAddress: `0x${string}` | undefined,
) {
  const lpTokenResults = useReadContracts({
    contracts: poolAddresses.map((addr) => ({
      address: addr,
      abi: V2_AMM_ABI,
      functionName: "lpToken",
    })),
    query: {
      enabled: !!userAddress && poolAddresses.length > 0,
    },
  });

  const poolLpPairs = useMemo(() => {
    if (!lpTokenResults.data) return [] as { poolAddr: string; lpAddr: `0x${string}` }[];
    const pairs: { poolAddr: string; lpAddr: `0x${string}` }[] = [];
    lpTokenResults.data.forEach((r, i) => {
      const lpAddr = r.result as `0x${string}` | undefined;
      if (lpAddr && lpAddr !== "0x0000000000000000000000000000000000000000") {
        pairs.push({ poolAddr: poolAddresses[i].toLowerCase(), lpAddr });
      }
    });
    return pairs;
  }, [lpTokenResults.data, poolAddresses]);

  const balanceResults = useReadContracts({
    contracts: poolLpPairs.map((p) => ({
      address: p.lpAddr,
      abi: V2_LP_TOKEN_ABI,
      functionName: "balanceOf",
      args: [userAddress!],
    })),
    query: {
      enabled: poolLpPairs.length > 0 && !!userAddress,
    },
  });

  const supplyResults = useReadContracts({
    contracts: poolLpPairs.map((p) => ({
      address: p.lpAddr,
      abi: V2_LP_TOKEN_ABI,
      functionName: "totalSupply",
    })),
    query: {
      enabled: poolLpPairs.length > 0,
    },
  });

  const poolLpInfos = useMemo(() => {
    const map = new Map<string, LpInfo>();
    if (!balanceResults.data || !supplyResults.data) return map;
    balanceResults.data.forEach((r, i) => {
      const balance = r.result as bigint | undefined;
      if (!balance || balance <= 0n) return;
      const supply = supplyResults.data[i]?.result as bigint | undefined;
      if (!supply || supply <= 0n) return;
      const pct = (Number(balance) / Number(supply)) * 100;
      map.set(poolLpPairs[i].poolAddr, {
        balance,
        sharePct: pct < 0.01 ? "<0.01" : pct.toFixed(2),
      });
    });
    return map;
  }, [balanceResults.data, supplyResults.data, poolLpPairs]);

  return {
    poolLpInfos,
    isLoading: lpTokenResults.isLoading || balanceResults.isLoading || supplyResults.isLoading,
    refetch: () => {
      lpTokenResults.refetch();
      balanceResults.refetch();
      supplyResults.refetch();
    },
  };
}
