import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "DEX | Swap, Stake & Earn",
  description: "AMM DEX with staking and real-time analytics. Swap tokens, provide liquidity, and earn rewards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark" suppressHydrationWarning>
      <body className="min-h-full flex flex-col grain-overlay" suppressHydrationWarning>
        <Providers>{children}</Providers>
        <Toaster position="top-right" theme="dark" toastOptions={{ className: "cyberpunk-toast" }} />
      </body>
    </html>
  );
}
