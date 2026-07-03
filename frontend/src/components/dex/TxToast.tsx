"use client";

import { ExternalLink, ArrowUpRight, Plus, Minus, Gem, Loader2, Check, X, Vote } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/store/useConfigStore";
import { useTxStore } from "@/store/useTxStore";
import { formatDecimalsInString } from "@/lib/format";

interface TxToastOptions {
  hash: string;
  status: "pending" | "success" | "error";
  message: string;
  txType?: string;
  sender?: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Loader2 size={14} className="text-yellow-400 animate-spin" />,
  success: <Check size={14} className="text-[#6EE7B7]" />,
  error: <X size={14} className="text-red-400" />,
};

const statusBorder: Record<string, string> = {
  pending: "border-yellow-400/30",
  success: "border-[#6EE7B7]/30",
  error: "border-red-400/30",
};

function TxToastInner({ hash, status, message }: TxToastOptions) {
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);
  const txUrl = explorerUrl ? `${explorerUrl}/tx/${hash}` : null;

  return (
    <div className="flex items-start gap-3 min-w-0 py-0.5">
      <div className={`flex items-center justify-center w-7 h-7 rounded-full border ${statusBorder[status]} bg-white/[0.03] shrink-0 mt-0.5`}>
        {statusIcons[status]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className="text-xs font-bold text-white whitespace-pre-wrap break-words leading-normal">{message}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-mono text-white/40">
            {hash.slice(0, 8)}...{hash.slice(-6)}
          </span>
          {txUrl && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-bold text-white/40 hover:text-white transition-colors"
            >
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function txToast(opts: TxToastOptions) {
  const pendingId = `tx-p-${opts.hash}`;
  const finalId = `tx-${opts.hash}`;

  const formattedMessage = formatDecimalsInString(opts.message);
  const formattedOpts = { ...opts, message: formattedMessage };

  if (formattedOpts.status === "pending" && formattedOpts.hash.startsWith("0x") && formattedOpts.txType && formattedOpts.sender) {
    useTxStore.getState().addTx({
      tx_hash: formattedOpts.hash,
      tx_type: formattedOpts.txType,
      sender: formattedOpts.sender,
      timestamp: Math.floor(Date.now() / 1000),
      status: "pending",
    });
  } else if (formattedOpts.status !== "pending" && formattedOpts.hash.startsWith("0x")) {
    useTxStore.getState().updateTx(formattedOpts.hash, formattedOpts.status === "success" ? "confirmed" : "failed");
  }

  if (formattedOpts.status === "pending") {
    toast(<TxToastInner {...formattedOpts} />, { id: pendingId, duration: Infinity });
  } else {
    toast.dismiss(pendingId);
    toast(<TxToastInner {...formattedOpts} />, { id: finalId, duration: formattedOpts.status === "success" ? 5000 : 8000 });
  }
}

export function txTypeIcon(txType: string) {
  switch (txType) {
    case "swap": return <ArrowUpRight size={14} className="text-[#6EE7B7]" />;
    case "add_liquidity": return <Plus size={14} className="text-blue-400" />;
    case "remove_liquidity": return <Minus size={14} className="text-amber-400" />;
    case "stake": return <Gem size={14} className="text-purple-400" />;
    case "unstake": return <Minus size={14} className="text-purple-400/60" />;
    case "claim": return <Gem size={14} className="text-[#6EE7B7]" />;
    case "propose":
    case "vote":
    case "delegate":
    case "execute":
    case "cancel":
      return <Vote size={14} className="text-[#6EE7B7]" />;
    default: return <ArrowUpRight size={14} className="text-white/40" />;
  }
}

export function txTypeLabel(txType: string) {
  switch (txType) {
    case "swap": return "Swap";
    case "add_liquidity": return "Add";
    case "remove_liquidity": return "Remove";
    case "stake": return "Stake";
    case "unstake": return "Unstake";
    case "claim": return "Claim";
    case "propose": return "Propose";
    case "vote": return "Vote";
    case "delegate": return "Delegate";
    case "execute": return "Execute";
    case "cancel": return "Cancel";
    default: return txType;
  }
}
