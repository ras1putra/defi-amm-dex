"use client";

import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { useReadContract } from "wagmi";
import { V2_AMM_ABI } from "@/lib/abis";
import type { Pool } from "@/types/dex";

interface PoolCardProps {
  pool: Pool;
  lpSharePct?: string;
  onAdd?: () => void;
  onRemove?: () => void;
}

function fmtRef(val: number, mode: string): string {
  if (mode === "usd") return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (mode === "weth") return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETH`;
  return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PoolCard({ pool, lpSharePct, onAdd, onRemove }: PoolCardProps) {
  const mode = pool.pricingMode || "";
  const [copied, setCopied] = useState(false);

  const { data: lpTokenAddr } = useReadContract({
    address: pool.address as `0x${string}`,
    abi: V2_AMM_ABI,
    functionName: "lpToken",
    query: { enabled: !!pool.address },
  });

  const lpAddress = (lpTokenAddr as string) ?? "";

  const handleCopyLp = () => {
    if (!lpAddress) return;
    navigator.clipboard.writeText(lpAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex -space-x-2 shrink-0">
            <div className="w-8 h-8 rounded-full bg-[#6EE7B7]/20 flex items-center justify-center text-xs font-bold text-[#6EE7B7] border-2 border-[#0A0A0A]">
              {pool.token0.slice(0, 2)}
            </div>
            <div className="w-8 h-8 rounded-full bg-[#22D3EE]/20 flex items-center justify-center text-xs font-bold text-[#22D3EE] border-2 border-[#0A0A0A]">
              {pool.token1.slice(0, 2)}
            </div>
          </div>
          <span className="font-bold text-base truncate">{pool.token0}/{pool.token1}</span>
          {lpSharePct && (
            <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6EE7B7]/15 border border-[#6EE7B7]/30 text-[10px] font-bold text-[#6EE7B7] shadow-[0_0_8px_rgba(110,231,183,0.2)]">
              <Sparkles size={10} className="text-[#6EE7B7]" />
              your LP {lpSharePct}%
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs sm:text-sm font-mono-dm px-2 py-1 rounded-full bg-[#6EE7B7]/10 text-[#6EE7B7]">
          {fmtRef(pool.fees_24h, mode)} 24h fees
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
        <div>
          <p className="text-xs sm:text-sm text-white/40 font-mono-dm mb-1">TVL</p>
          <p className="font-bold">{fmtRef(pool.tvl, mode)}</p>
        </div>
        <div>
          <p className="text-xs sm:text-sm text-white/40 font-mono-dm mb-1">24h Volume</p>
          <p className="font-bold">{fmtRef(pool.volume_24h, mode)}</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs sm:text-sm text-white/40 font-mono-dm mb-1">Reserves</p>
          <p className="font-bold font-mono text-xs sm:text-sm">
            {pool.reserve0.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {pool.token0}
            <br />
            {pool.reserve1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {pool.token1}
          </p>
        </div>
      </div>
      {lpAddress && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-[11px] text-white/40 font-mono-dm">LP Token</span>
          <button
            onClick={handleCopyLp}
            className="flex items-center gap-1.5 text-[11px] font-mono text-white/70 hover:text-white/70 transition-colors cursor-pointer"
          >
            <span>{lpAddress.slice(0, 6)}...{lpAddress.slice(-4)}</span>
            {copied ? <Check size={10} className="text-[#6EE7B7]" /> : <Copy size={10} />}
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 sm:gap-3 mt-4 pt-4 border-t border-white/[0.06]">
        <button
          onClick={onAdd}
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-[#6EE7B7]/10 hover:bg-[#6EE7B7]/20 border border-[#6EE7B7]/20 text-[#6EE7B7] text-xs font-bold transition-all cursor-pointer"
        >
          + Add Liquidity
        </button>
        <button
          onClick={onRemove}
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-xs font-bold transition-all cursor-pointer"
        >
          − Remove
        </button>
      </div>
    </div>
  );
}
