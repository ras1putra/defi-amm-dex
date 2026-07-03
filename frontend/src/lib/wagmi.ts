import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  metaMaskWallet,
  walletConnectWallet,
  okxWallet,
  safeWallet,
  trustWallet,
  rabbyWallet,
  ledgerWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import type { AppConfig } from "./config";

export function defineDEXChain(chain: AppConfig["chain"]) {
  return defineChain({
    id: chain.chain_id,
    name: chain.chain_name,
    nativeCurrency: chain.currency,
    rpcUrls: {
      default: { http: [chain.rpc_url] },
    },
    blockExplorers: chain.explorer_url
      ? { default: { name: "Explorer", url: chain.explorer_url } }
      : undefined,
  });
}

export function getWagmiConfig(appConfig: AppConfig) {
  const dexChain = defineDEXChain(appConfig.chain);
  const projectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    "7d5df2f7cde7b483c66d21469e8e01bd";

  const connectors = connectorsForWallets(
    [
      {
        groupName: "Popular",
        wallets: [
          rainbowWallet,
          metaMaskWallet,
          okxWallet,
          safeWallet,
          trustWallet,
          rabbyWallet,
          ledgerWallet,
          zerionWallet,
          walletConnectWallet,
        ],
      },
    ],
    { appName: "dexsurl", projectId },
  );

  return createConfig({
    connectors,
    chains: [dexChain],
    transports: {
      [dexChain.id]: http(appConfig.chain.rpc_url),
    },
    ssr: true,
  });
}
