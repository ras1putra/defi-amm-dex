"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Repeat, Menu, X, ArrowLeftRight, Droplets, Gem, BarChart3, Vote, Wallet, ChevronDown, Copy, Check, ExternalLink, LogOut, type LucideIcon } from "lucide-react";
import { useAccount, useDisconnect, useBalance } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useConfig } from "@/hooks/useConfig";
import { usePairs } from "@/hooks/usePairs";
import { useTxHistory } from "@/hooks/useTxHistory";
import { useStakingPools } from "@/hooks/useStaking";
import type { Pair } from "@/types/dex";
import type { StakingPool } from "@/types/staking";
import { groupSwapHops } from "@/lib/tx-format";
import TxHistoryList from "./TxHistoryList";

import { NAV_LINKS } from "@/lib/constants";

const NAV_LINK_ICONS: Record<string, LucideIcon> = {
  "/dex/v2/swap": ArrowLeftRight,
  "/dex/v2/liquidity": Droplets,
  "/dex/v2/staking": Gem,
  "/dex/v2/analytics": BarChart3,
  "/governance": Vote,
};

interface AppNavbarProps {
  title?: string;
}

const HISTORY_PAGE_SIZE = 5;

export default function AppNavbar({ title }: AppNavbarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { data: config } = useConfig();
  const { data: pairs } = usePairs();
  const poolMap = useMemo(() => {
    const map = new Map<string, Pair>();
    if (pairs) {
      for (const p of pairs) {
        map.set(p.address.toLowerCase(), p);
      }
    }
    return map;
  }, [pairs]);
  const { data: stakingPools } = useStakingPools();
  const stakingPoolMap = useMemo(() => {
    const map = new Map<string, StakingPool>();
    if (stakingPools) {
      for (const sp of stakingPools) {
        map.set(String(sp.pool_id), sp);
      }
    }
    return map;
  }, [stakingPools]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const { data: ethBalance } = useBalance({
    address: address,
    query: { enabled: !!address },
  });

  const { data: txHistory } = useTxHistory(historyPage, HISTORY_PAGE_SIZE);
  const displayEntries = useMemo(
    () => groupSwapHops(txHistory?.items ?? [], poolMap),
    [txHistory?.items, poolMap],
  );

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const explorerUrl = config?.chain.explorer_url;

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-4 md:px-12 py-5 border-b border-white/[0.06] bg-[#0A0A0A]/85 backdrop-blur-xl">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#6EE7B7]">
          <Repeat size={16} className="text-[#0A0A0A] stroke-[2.5]" />
        </div>
        <span className="text-lg font-bold tracking-tight">{title || "dexsurl"}</span>
        <div className="hidden sm:flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono-dm bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#6EE7B7]/20">V2</span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono-dm text-white/25 cursor-not-allowed" title="Coming soon">V4</span>
        </div>
      </Link>

      <div className="hidden md:flex items-center gap-6 text-sm text-white/60">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`hover:text-white transition-colors ${pathname === href ? "text-white font-medium" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="hidden md:flex items-center gap-4 shrink-0">
        {!isConnected ? (
          <button
            onClick={openConnectModal}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <Wallet size={14} />
            <span>Connect Wallet</span>
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={() => { setShowDropdown(!showDropdown); setHistoryPage(1); }}
              className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-all overflow-hidden cursor-pointer"
            >
              {ethBalance && (
                <span className="hidden lg:inline-block px-3.5 py-2 border-r border-white/[0.08] text-xs font-mono font-bold text-white/70">
                  {parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4)} ETH
                </span>
              )}
              <span className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold text-white">
                {address?.slice(0, 6)}...{address?.slice(-4)}
                <ChevronDown size={12} className={`text-white/40 transition-transform duration-200 ${showDropdown ? "rotate-180" : ""}`} />
              </span>
            </button>

            {showDropdown && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 mt-2.5 z-40 w-80 max-h-[80vh] overflow-y-auto rounded-2xl bg-zinc-950/95 border border-zinc-800/80 backdrop-blur-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] p-4 space-y-4 font-mono-dm">

                  {/* Top Bar */}
                  <div className="flex justify-between items-center text-[13px] font-medium text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{config?.chain.chain_name || "Connected"}</span>
                    </div>
                    <button
                      onClick={() => { disconnect(); setShowDropdown(false); }}
                      className="px-2.5 py-1 text-[13px] font-semibold text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>

                  {/* Account Card */}
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-emerald-400 shrink-0 shadow-[0_4px_12px_rgba(139,92,246,0.15)]" />
                    <div className="flex flex-col min-w-0">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-sm font-semibold font-mono text-zinc-200 hover:text-white transition-colors cursor-pointer group text-left"
                      >
                        <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                        {copied ? (
                          <Check size={12} className="text-[#6EE7B7] shrink-0" />
                        ) : (
                          <Copy size={12} className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                        )}
                      </button>
                      <span className="text-[12px] text-zinc-500 tracking-wider">Connected wallet</span>
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/40 flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Balance</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-mono font-bold text-white">
                        {ethBalance ? parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4) : "0.0000"}
                      </span>
                      <span className="text-xs text-zinc-400 font-medium">ETH</span>
                    </div>
                  </div>

                  {/* Transactions Section */}
                  <div className="border-t border-zinc-800/40 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest">Transactions</span>
                      {txHistory && txHistory.total > 0 && (
                        <span className="text-[12px] text-zinc-600 font-mono">{txHistory.total} total</span>
                      )}
                    </div>

                    <TxHistoryList
                      displayEntries={displayEntries}
                      txHistory={txHistory}
                      poolMap={poolMap}
                      stakingPoolMap={stakingPoolMap}
                      explorerUrl={explorerUrl}
                      historyPage={historyPage}
                      totalPages={txHistory?.total_pages ?? 1}
                      onPageChange={setHistoryPage}
                      variant="desktop"
                    />
                  </div>

                  {/* Explorer Link */}
                  {explorerUrl && address && (
                    <a
                      href={`${explorerUrl}/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/40 text-xs text-zinc-400 hover:text-zinc-200 transition-all group"
                    >
                      <span className="flex items-center gap-2">
                        <ExternalLink size={12} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                        Explorer Address
                      </span>
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="md:hidden relative z-50 w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-colors cursor-pointer"
        aria-label="Toggle menu"
      >
        {open ? <X size={18} className="text-white" /> : <Menu size={18} className="text-white/70" />}
      </button>

      <div
        className={`absolute top-full left-0 right-0 z-40 md:hidden overflow-hidden transition-all duration-300 ${open ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
          }`}
      >
        <div className="mx-4 mb-3 rounded-2xl bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/[0.08] shadow-xl max-h-[75vh] overflow-y-auto">
          <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/[0.04]">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold font-mono-dm bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#6EE7B7]/20">V2</span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold font-mono-dm text-white/25 cursor-not-allowed" title="Coming soon">V4</span>
          </div>
          {NAV_LINKS.map(({ href, label }, i) => {
            const Icon = NAV_LINK_ICONS[href];
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-5 py-3.5 text-sm transition-colors ${pathname === href
                  ? "text-[#6EE7B7] bg-[#6EE7B7]/5"
                  : "text-white/60 hover:text-white hover:bg-white/[0.02]"
                  } ${i < NAV_LINKS.length - 1 ? "border-b border-white/[0.04]" : ""}`}
              >
                {Icon && <Icon size={16} className={pathname === href ? "text-[#6EE7B7]" : "text-white/40"} />}
                <span className="font-medium">{label}</span>
                {pathname === href && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />}
              </Link>
            );
          })}
          <div className="p-4 bg-white/[0.02] border-t border-white/[0.06] flex flex-col gap-3">
            {!isConnected ? (
              <button
                onClick={() => {
                  if (openConnectModal) openConnectModal();
                  setOpen(false);
                }}
                className="btn-primary w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer"
              >
                <Wallet size={16} />
                <span>Connect Wallet</span>
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 px-1">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-emerald-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 text-sm font-semibold font-mono text-zinc-200 hover:text-white transition-colors cursor-pointer group text-left"
                    >
                      <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                      {copied ? (
                        <Check size={12} className="text-[#6EE7B7] shrink-0" />
                      ) : (
                        <Copy size={12} className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                      )}
                    </button>
                    <span className="text-[11px] text-white/40">Connected wallet</span>
                  </div>
                </div>
                <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex justify-between items-center">
                  <span className="text-xs text-white/40">Balance</span>
                  <span className="text-sm font-mono font-bold text-white">
                    {ethBalance ? parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4) : "0.0000"} ETH
                  </span>
                </div>
                <button
                  onClick={() => { disconnect(); setOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold text-xs tracking-wider uppercase transition-colors cursor-pointer"
                >
                  <LogOut size={12} />
                  <span>Disconnect</span>
                </button>
                {displayEntries.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Transactions</span>
                      {txHistory && txHistory.total > 0 && (
                        <span className="text-[11px] text-white/30 font-mono">{txHistory.total}</span>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <TxHistoryList
                        displayEntries={displayEntries}
                        txHistory={txHistory}
                        poolMap={poolMap}
                        stakingPoolMap={stakingPoolMap}
                        explorerUrl={explorerUrl}
                        historyPage={historyPage}
                        totalPages={txHistory?.total_pages ?? 1}
                        onPageChange={setHistoryPage}
                        variant="mobile"
                      />
                    </div>
                  </div>
                )}
                {explorerUrl && (
                  <a
                    href={`${explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs text-white/40 hover:text-white/60 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      <ExternalLink size={12} />
                      View on Explorer
                    </span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
