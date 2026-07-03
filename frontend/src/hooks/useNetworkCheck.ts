"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useConfig } from "@/hooks/useConfig";

interface UseNetworkCheckReturn {
  isWrongNetwork: boolean;
  walletChainId: number | null;
  expectedChainId: number | null;
  expectedChainName: string | null;
}

export function useNetworkCheck(): UseNetworkCheckReturn {
  const { isConnected } = useAccount();
  const { data: appConfig } = useConfig();
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const expectedChainId = appConfig?.chain.chain_id ?? null;

  useEffect(() => {
    if (!isConnected || typeof window === "undefined") {
      setTimeout(() => setWalletChainId(null), 0);
      return;
    }

    const ethereum = (window as { ethereum?: unknown }).ethereum as {
      request?: (args: { method: string }) => Promise<string | number>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    } | undefined;

    if (!ethereum?.request) return;

    ethereum.request({ method: "eth_chainId" })
      .then((id) => {
        setWalletChainId(parseInt(id as string, 16));
      })
      .catch(() => {});

    const handleChainChanged = (chainId: unknown) => {
      setWalletChainId(parseInt(chainId as string, 16));
    };

    ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      ethereum.removeListener?.("chainChanged", handleChainChanged);
      setTimeout(() => setWalletChainId(null), 0);
    };
  }, [isConnected]);

  const isWrongNetwork = isConnected
    && walletChainId !== null
    && expectedChainId !== null
    && walletChainId !== expectedChainId;

  return {
    isWrongNetwork,
    walletChainId,
    expectedChainId,
    expectedChainName: appConfig?.chain.chain_name ?? null,
  };
}
