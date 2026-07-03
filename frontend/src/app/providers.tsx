"use client";

import { type ReactNode, useMemo, useState } from "react";
import { WagmiProvider, useDisconnect } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { linearTheme } from "@/lib/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getWagmiConfig } from "@/lib/wagmi";
import { useConfig } from "@/hooks/useConfig";
import { useNetworkCheck } from "@/hooks/useNetworkCheck";
import { AlertCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTxSocket } from "@/hooks/useTxSocket";

function WagmiAppWrapper({ children }: { children: ReactNode }) {
  const { isError, data: appConfig } = useConfig();
  const pathname = usePathname();

  const wagmiConfig = useMemo(() => {
    if (!appConfig) return null;
    try {
      return getWagmiConfig(appConfig);
    } catch (e) {
      console.error("Failed to generate Wagmi config:", e);
      return null;
    }
  }, [appConfig]);

  const isLanding = pathname === "/";

  if (isError) {
    if (!isLanding) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0A0A0A] p-6">
          <div className="max-w-md w-full rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden">
            <div className="p-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <h2 className="text-xl font-black tracking-tight text-white mb-2">Config failed to load</h2>
              <p className="text-sm text-white/70 font-mono-dm">Could not connect to the server. Please try again.</p>
            </div>
            <div className="border-t border-white/[0.06] px-8 pb-6">
              <button
                onClick={() => window.location.reload()}
                className="btn-primary w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm tracking-wider uppercase cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  if (!appConfig || !wagmiConfig) {
    if (!isLanding) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0A0A0A]">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#6EE7B7] border-t-transparent" />
            <p className="text-sm text-white/70 animate-pulse font-mono-dm">Loading configuration...</p>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={linearTheme}>
        <NetworkGuard>{children}</NetworkGuard>
      </RainbowKitProvider>
    </WagmiProvider>
  );
}

function NetworkGuard({ children }: { children: ReactNode }) {
  const { disconnect } = useDisconnect();
  useTxSocket();
  const { isWrongNetwork, expectedChainId, expectedChainName } = useNetworkCheck();

  if (isWrongNetwork) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0A0A0A] p-6">
        <div className="max-w-md w-full rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden backdrop-blur-md">
          <div className="p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            </div>
            <h2 className="text-xl font-black tracking-tight text-white mb-2">Wrong Network</h2>
            <p className="text-sm text-white/70 font-mono-dm leading-relaxed">
              Switch to <span className="text-amber-400 font-bold">{expectedChainName || "supported network"}</span> to access the DEX.
            </p>
          </div>
          <div className="border-t border-white/[0.06] px-8 pb-8 pt-6 flex flex-col gap-3">
            <button
              onClick={() => {
                const eth = (window as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
                eth?.request({
                  method: "wallet_switchEthereumChain",
                  params: [{ chainId: `0x${expectedChainId?.toString(16)}` }],
                }).catch(() => {});
              }}
              className="btn-primary w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm tracking-wider uppercase cursor-pointer"
            >
              Switch Network
            </button>
            <button
              onClick={() => disconnect()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm tracking-wider uppercase font-bold border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors rounded-xl cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiAppWrapper>
        {children}
      </WagmiAppWrapper>
    </QueryClientProvider>
  );
}
