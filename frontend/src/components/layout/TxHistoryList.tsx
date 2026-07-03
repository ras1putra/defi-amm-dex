"use client";

import { ExternalLink, X, ChevronLeft, ChevronRight } from "lucide-react";
import { txTypeIcon, txTypeLabel } from "@/components/dex/TxToast";
import { txAmountLabel, relativeTime } from "@/lib/tx-format";
import type { DisplayEntry } from "@/lib/tx-format";
import type { Pair } from "@/types/dex";
import type { StakingPool } from "@/types/staking";
import type { TxHistoryResponse } from "@/types/history";

interface TxHistoryListProps {
  displayEntries: DisplayEntry[];
  txHistory: TxHistoryResponse | undefined;
  poolMap: Map<string, Pair>;
  stakingPoolMap: Map<string, StakingPool>;
  explorerUrl: string | undefined;
  historyPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  variant?: "desktop" | "mobile";
}

export default function TxHistoryList({
  displayEntries,
  txHistory,
  poolMap,
  stakingPoolMap,
  explorerUrl,
  historyPage,
  totalPages,
  onPageChange,
  variant = "desktop",
}: TxHistoryListProps) {
  const d = variant === "desktop";

  if (!txHistory || displayEntries.length === 0) {
    return <p className={`text-[13px] ${d ? "text-zinc-600" : "text-white/30"} py-4 text-center`}>No transactions yet</p>;
  }

  return (
    <>
      <div className="space-y-1">
        {displayEntries.map((entry, idx) => {
          const amountLabel = entry.combinedLabel ?? txAmountLabel(entry.item, poolMap, stakingPoolMap);
          const isFailed = entry.item.status === "failed";
          return (
            <div
              key={`${entry.item.tx_hash}-${idx}`}
              className={`flex items-center gap-2 rounded-lg transition-colors ${d ? "gap-2.5 py-2 px-2.5 hover:bg-zinc-900/40" : "py-1.5 px-2"} ${isFailed ? "opacity-50" : ""}`}
            >
              <span className={`rounded-full flex items-center justify-center shrink-0 ${d ? "w-7 h-7" : "w-6 h-6"} ${isFailed ? "bg-red-500/10" : "bg-white/[0.04]"}`}>
                {isFailed ? <X size={d ? 13 : 11} className="text-red-400" /> : txTypeIcon(entry.item.tx_type)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[13px] font-bold ${isFailed ? "text-red-400" : "text-zinc-300"}`}>
                    {txTypeLabel(entry.item.tx_type)}
                  </span>
                  {d && isFailed && (
                    <span className="shrink-0 text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded leading-none border border-red-500/20">Failed</span>
                  )}
                  {d && entry.hopCount > 1 && (
                    <span className="shrink-0 text-[11px] font-mono text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded leading-none">({entry.hopCount} hops)</span>
                  )}
                  {amountLabel && (
                    <span className={`text-[12px] truncate ${d ? "text-zinc-400" : "text-zinc-500"}`}>{amountLabel}</span>
                  )}
                </div>
                <span className={`text-[12px] ${d ? "text-zinc-600" : "text-white/30"}`}>{relativeTime(entry.item.timestamp)}</span>
              </div>
              {explorerUrl && (
                <a
                  href={`${explorerUrl}/tx/${entry.item.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 p-1 rounded transition-colors ${d ? "text-zinc-600 hover:text-zinc-300" : "text-white/20 hover:text-white/50"}`}
                >
                  <ExternalLink size={d ? 11 : 10} />
                </a>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className={`flex items-center justify-between mt-2 pt-2 border-t ${d ? "border-zinc-800/30" : "border-white/[0.04]"}`}>
          <span className={`text-[12px] font-mono ${d ? "text-zinc-600" : "text-white/30"}`}>
            {historyPage}/{totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, historyPage - 1))}
              disabled={historyPage <= 1}
              className={`p-1 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer ${d ? "text-zinc-600 hover:text-zinc-300" : "text-white/30 hover:text-white/60"}`}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, historyPage + 1))}
              disabled={historyPage >= totalPages}
              className={`p-1 rounded disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer ${d ? "text-zinc-600 hover:text-zinc-300" : "text-white/30 hover:text-white/60"}`}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
