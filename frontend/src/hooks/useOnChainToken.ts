import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { isAddress } from "viem";
import { ERC20_ABI } from "@/lib/abis";
import type { TokenOption } from "@/types/dex";

export function useOnChainToken(search: string) {
  const isValidAddress = isAddress(search);

  const { data: nameData } = useReadContract({
    address: isValidAddress ? (search as `0x${string}`) : undefined,
    abi: ERC20_ABI,
    functionName: "name",
  });

  const { data: symbolData } = useReadContract({
    address: isValidAddress ? (search as `0x${string}`) : undefined,
    abi: ERC20_ABI,
    functionName: "symbol",
  });

  const { data: decimalsData } = useReadContract({
    address: isValidAddress ? (search as `0x${string}`) : undefined,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  return useMemo<TokenOption | null>(() => {
    if (!isValidAddress || !nameData || !symbolData || decimalsData === undefined) return null;
    return {
      address: search as `0x${string}`,
      name: String(nameData),
      symbol: String(symbolData),
      decimals: Number(decimalsData),
      logo: undefined,
    };
  }, [isValidAddress, search, nameData, symbolData, decimalsData]);
}
