import { useMemo, useCallback } from "react";
import { useReadContracts, useAccount } from "wagmi";
import { V2_MASTER_CHEF_ABI, REWARDER_ABI, ERC20_ABI } from "@/lib/abis";
import { useConfigStore } from "@/store/useConfigStore";
import type { StakingPool } from "@/types/staking";

interface RewarderData {
  rewardToken: string;
  rewardPerSecond: bigint;
  totalCap: bigint;
  distributed: bigint;
}

interface LpTokenData {
  symbol: string;
  decimals: number;
}

export function useStakingPools() {
  const { address } = useAccount();
  const stakingAddress = useConfigStore((s) => s.config?.contract_staking) as `0x${string}` | undefined;

  const { data: poolLengthData, refetch: refetchPoolLength } = useReadContracts({
    contracts: [
      {
        address: stakingAddress,
        abi: V2_MASTER_CHEF_ABI,
        functionName: "poolLength",
        args: [],
      },
    ],
    query: { enabled: !!stakingAddress },
  });

  const poolLength = (poolLengthData?.[0]?.result as bigint) ?? 0n;

  const poolInfoContracts = useMemo(() => {
    if (!stakingAddress || poolLength === 0n) return [];
    return Array.from({ length: Number(poolLength) }, (_, i) => ({
      address: stakingAddress,
      abi: V2_MASTER_CHEF_ABI,
      functionName: "poolInfo" as const,
      args: [BigInt(i)] as const,
    }));
  }, [stakingAddress, poolLength]);

  const { data: poolInfoData, refetch: refetchPoolInfo } = useReadContracts({
    contracts: poolInfoContracts,
    query: { enabled: poolInfoContracts.length > 0, refetchInterval: 15000, staleTime: 10000 },
  });

  const rewarderAddresses = useMemo(() => {
    if (!poolInfoData) return [] as `0x${string}`[];
    return poolInfoData.map((r) => (r.result as readonly [string, string, bigint] | undefined)?.[1] as `0x${string}` ?? "0x0").filter((a) => a !== "0x0");
  }, [poolInfoData]);

  const rewarderContracts = useMemo(() => {
    return rewarderAddresses.map((addr) => [
      { address: addr, abi: REWARDER_ABI, functionName: "rewardToken" as const, args: [] as const },
      { address: addr, abi: REWARDER_ABI, functionName: "rewardPerSecond" as const, args: [] as const },
      { address: addr, abi: REWARDER_ABI, functionName: "totalRewardCap" as const, args: [] as const },
      { address: addr, abi: REWARDER_ABI, functionName: "rewardDistributed" as const, args: [] as const },
    ]).flat();
  }, [rewarderAddresses]);

  const { data: rewarderResults, refetch: refetchRewarder } = useReadContracts({
    contracts: rewarderContracts,
    query: { enabled: rewarderContracts.length > 0, refetchInterval: 15000, staleTime: 10000 },
  });

  const rewarderDataMap = useMemo(() => {
    const map = new Map<string, RewarderData>();
    if (!rewarderResults) return map;
    for (let i = 0; i < rewarderAddresses.length; i++) {
      const base = i * 4;
      const rewardToken = (rewarderResults[base]?.result as string) ?? "";
      const rewardPerSecond = (rewarderResults[base + 1]?.result as bigint) ?? 0n;
      const totalCap = (rewarderResults[base + 2]?.result as bigint) ?? 0n;
      const distributed = (rewarderResults[base + 3]?.result as bigint) ?? 0n;
      map.set(rewarderAddresses[i].toLowerCase(), { rewardToken, rewardPerSecond, totalCap, distributed });
    }
    return map;
  }, [rewarderAddresses, rewarderResults]);

  const userInfoContracts = useMemo(() => {
    if (!stakingAddress || !address) return [];
    return Array.from({ length: Number(poolLength) }, (_, i) => ({
      address: stakingAddress,
      abi: V2_MASTER_CHEF_ABI,
      functionName: "userInfo" as const,
      args: [BigInt(i), address] as const,
    }));
  }, [stakingAddress, address, poolLength]);

  const { data: userInfoResults, refetch: refetchUserInfo } = useReadContracts({
    contracts: userInfoContracts,
    query: { enabled: userInfoContracts.length > 0, refetchInterval: 15000, staleTime: 10000 },
  });

  const pendingContracts = useMemo(() => {
    if (!stakingAddress || !address) return [];
    return Array.from({ length: Number(poolLength) }, (_, i) => ({
      address: stakingAddress,
      abi: V2_MASTER_CHEF_ABI,
      functionName: "pendingRewards" as const,
      args: [BigInt(i), address] as const,
    }));
  }, [stakingAddress, address, poolLength]);

  const { data: pendingResults, refetch: refetchPending } = useReadContracts({
    contracts: pendingContracts,
    query: { enabled: pendingContracts.length > 0, refetchInterval: 15000, staleTime: 10000 },
  });

  const lpTokenContracts = useMemo(() => {
    if (!poolInfoData) return [];
    return poolInfoData.map((r) => {
      const lpAddr = (r.result as readonly [string, string, bigint] | undefined)?.[0] as `0x${string}` ?? "0x0";
      return [
        { address: lpAddr, abi: ERC20_ABI, functionName: "symbol" as const, args: [] as const },
        { address: lpAddr, abi: ERC20_ABI, functionName: "decimals" as const, args: [] as const },
      ];
    }).flat();
  }, [poolInfoData]);

  const { data: lpTokenResults, refetch: refetchLpTokens } = useReadContracts({
    contracts: lpTokenContracts,
    query: { enabled: lpTokenContracts.length > 0 },
  });

  const lpTokenDataMap = useMemo(() => {
    const map = new Map<number, LpTokenData>();
    if (!lpTokenResults) return map;
    for (let i = 0; i < Number(poolLength); i++) {
      const symbol = (lpTokenResults[i * 2]?.result as string) ?? "LP";
      const decimals = (lpTokenResults[i * 2 + 1]?.result as number) ?? 18;
      map.set(i, { symbol, decimals });
    }
    return map;
  }, [lpTokenResults, poolLength]);

  const rewardTokenContracts = useMemo(() => {
    if (!rewarderAddresses.length) return [];
    return rewarderAddresses.flatMap((addr) => {
      const rd = rewarderDataMap.get(addr.toLowerCase());
      const rtAddr = rd?.rewardToken;
      if (!rtAddr || rtAddr === "0x0") return [];
      return [
        { address: rtAddr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" as const, args: [] as const },
      ];
    });
  }, [rewarderAddresses, rewarderDataMap]);

  const { data: rewardTokenResults, refetch: refetchRewardTokens } = useReadContracts({
    contracts: rewardTokenContracts,
    query: { enabled: rewardTokenContracts.length > 0 },
  });

  const rewardSymbolMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!rewardTokenResults || !rewarderAddresses.length) return map;
    let idx = 0;
    for (const addr of rewarderAddresses) {
      const rd = rewarderDataMap.get(addr.toLowerCase());
      if (rd?.rewardToken && rd.rewardToken !== "0x0") {
        const sym = (rewardTokenResults[idx]?.result as string) ?? "";
        map.set(addr.toLowerCase(), sym);
        idx++;
      }
    }
    return map;
  }, [rewardTokenResults, rewarderAddresses, rewarderDataMap]);

  const rewarderBalanceContracts = useMemo(() => {
    return rewarderAddresses.map((addr) => {
      const rd = rewarderDataMap.get(addr.toLowerCase());
      const rtAddr = rd?.rewardToken;
      if (!rtAddr || rtAddr === "0x0") return [];
      return [
        { address: rtAddr as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [addr] as const },
        { address: rtAddr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" as const, args: [] as const },
      ];
    }).flat();
  }, [rewarderAddresses, rewarderDataMap]);

  const { data: rewarderBalanceResults, refetch: refetchRewarderBalances } = useReadContracts({
    contracts: rewarderBalanceContracts,
    query: { enabled: rewarderBalanceContracts.length > 0, refetchInterval: 15000, staleTime: 10000 },
  });

  const rewarderBalanceMap = useMemo(() => {
    const map = new Map<string, { balance: bigint; decimals: number }>();
    if (!rewarderBalanceResults || !rewarderAddresses.length) return map;
    let idx = 0;
    for (const addr of rewarderAddresses) {
      const rd = rewarderDataMap.get(addr.toLowerCase());
      if (rd?.rewardToken && rd.rewardToken !== "0x0") {
        const balance = (rewarderBalanceResults[idx * 2]?.result as bigint) ?? 0n;
        const decimals = (rewarderBalanceResults[idx * 2 + 1]?.result as number) ?? 18;
        map.set(addr.toLowerCase(), { balance, decimals });
        idx++;
      }
    }
    return map;
  }, [rewarderBalanceResults, rewarderAddresses, rewarderDataMap]);

  const pools = useMemo(() => {
    if (!poolInfoData || !stakingAddress) return [] as StakingPool[];
    const result: StakingPool[] = [];
    const chefAddr = stakingAddress.toLowerCase();

    for (let i = 0; i < Number(poolLength); i++) {
      const poolInfo = poolInfoData[i]?.result as readonly [string, string, bigint] | undefined;
      if (!poolInfo) continue;

      const lpAddr = poolInfo[0];
      const rewarderAddr = poolInfo[1];
      const totalStaked = poolInfo[2].toString();

      const userAmount = (userInfoResults?.[i]?.result as bigint | undefined) ?? 0n;
      const pendingReward = (pendingResults?.[i]?.result as bigint | undefined) ?? 0n;

      const rd = rewarderDataMap.get(rewarderAddr.toLowerCase());
      const rewardTokenAddr = rd?.rewardToken ?? "";
      const rewardPerSec = rd?.rewardPerSecond ?? 0n;
      const totalCap = rd?.totalCap ?? 0n;
      const distributed = rd?.distributed ?? 0n;

      const lpData = lpTokenDataMap.get(i);
      const lpSymbol = lpData?.symbol ?? "LP";
      const lpDecimals = lpData?.decimals ?? 18;

      const rewardSymbol = rewardSymbolMap.get(rewarderAddr.toLowerCase()) ?? "";

      const rb = rewarderBalanceMap.get(rewarderAddr.toLowerCase());
      const actualBalance = rb?.balance ?? 0n;
      const rewardTokenDecimals = rb?.decimals ?? 18;
      const remaining = totalCap > 0n ? totalCap - distributed : actualBalance;
      const effectiveStaked = totalStaked !== "0" ? Number(totalStaked) : 10 ** lpDecimals;
      const apr = rewardPerSec > 0n
        ? (Number(rewardPerSec) * 86400 * 365 / 10 ** rewardTokenDecimals) / (effectiveStaked / 10 ** lpDecimals) * 100
        : 0;

      result.push({
        pool_id: i,
        address: chefAddr,
        rewarder_address: rewarderAddr,
        staking_token: lpAddr,
        staking_token_symbol: lpSymbol,
        reward_token: rewardTokenAddr,
        reward_token_symbol: rewardSymbol,
        total_staked: totalStaked,
        reward_rate: rewardPerSec.toString(),
        apr,
        user_staked: userAmount.toString(),
        user_pending_rewards: pendingReward.toString(),
        total_reward_pool: totalCap.toString(),
        remaining_rewards: remaining.toString(),
        reward_token_decimals: rewardTokenDecimals,
        is_closed: totalCap > 0n && remaining === 0n,
      });
    }

    return result;
  }, [poolInfoData, userInfoResults, rewarderDataMap, lpTokenDataMap, rewardSymbolMap, rewarderBalanceMap, poolLength, pendingResults, stakingAddress]);

  const refetchPools = useCallback(async () => {
    await Promise.all([
      refetchPoolLength(),
      refetchPoolInfo(),
      refetchRewarder(),
      refetchUserInfo(),
      refetchPending(),
      refetchLpTokens(),
      refetchRewardTokens(),
      refetchRewarderBalances(),
    ]);
  }, [
    refetchPoolLength, refetchPoolInfo, refetchRewarder, refetchUserInfo,
    refetchPending, refetchLpTokens, refetchRewardTokens, refetchRewarderBalances,
  ]);

  return {
    data: pools,
    isLoading: !poolInfoData && poolLength !== 0n,
    isError: false,
    error: null,
    refetchPools,
  };
}
