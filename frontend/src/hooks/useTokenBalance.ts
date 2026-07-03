import { useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { ERC20_ABI } from "@/lib/abis";
import { useConfigStore } from "@/store/useConfigStore";
import type { TokenOption } from "@/types/dex";

export function useTokenBalance(token: TokenOption | null, userAddress: `0x${string}` | undefined) {
  const wethAddress = useConfigStore((s) => s.config?.contract_weth);
  const isWeth = !!wethAddress && !!token && token.address.toLowerCase() === wethAddress.toLowerCase();
  const { data: ethBalance } = useBalance({
    address: userAddress,
    query: { enabled: isWeth && !!userAddress },
  });
  const { data: erc20Balance } = useReadContract({
    address: !isWeth && token ? token.address : undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !isWeth && !!token && !!userAddress },
  });

  if (!token) return undefined;
  if (isWeth && ethBalance) return formatUnits(ethBalance.value, 18);
  if (!isWeth && erc20Balance !== undefined) return formatUnits(erc20Balance as bigint, token.decimals);
  return undefined;
}
