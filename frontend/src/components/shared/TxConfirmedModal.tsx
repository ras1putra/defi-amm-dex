"use client";

import { CheckCircle, ExternalLink, X } from "lucide-react";

export interface TxConfirmedDetail {
  label: string;
  value: string;
  highlight?: boolean;
}

interface TxConfirmedModalProps {
  title: string;
  subtitle?: string;
  details?: TxConfirmedDetail[];
  txHash?: string | null;
  explorerUrl?: string | null;
  accentColor?: "green" | "amber";
  onClose: () => void;
}

const accent = {
  green: {
    glow: "bg-[#6EE7B7]/20",
    border: "border-[#6EE7B7]/30",
    bg: "bg-[#6EE7B7]/10",
    icon: "text-[#6EE7B7]",
  },
  amber: {
    glow: "bg-amber-500/20",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    icon: "text-amber-400",
  },
};

export default function TxConfirmedModal({
  title,
  subtitle = "Your transaction has been confirmed on-chain.",
  details,
  txHash,
  explorerUrl,
  accentColor = "green",
  onClose,
}: TxConfirmedModalProps) {
  const a = accent[accentColor];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm">Transaction Confirmed</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-6 py-4 font-mono-dm text-center w-full my-auto">
          <div className="relative">
            <div className={`absolute inset-0 rounded-full ${a.glow} blur-xl animate-pulse`} />
            <div className={`relative h-16 w-16 rounded-full ${a.bg} flex items-center justify-center ${a.border} border`}>
              <CheckCircle size={32} className={a.icon} />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-lg font-black text-white tracking-tight">{title}</p>
            <p className="text-xs text-white/70">{subtitle}</p>
          </div>

          {details && details.length > 0 && (
            <div className="w-full rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 space-y-3 text-left">
              {details.map((d) => (
                <div key={d.label} className="flex justify-between items-center text-xs">
                  <span className="text-white/40">{d.label}</span>
                  <span className={`font-bold font-mono ${d.highlight ? "text-[#6EE7B7]" : "text-white"}`}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="w-full flex flex-col gap-2.5 pt-2">
            {txHash && explorerUrl && (
              <a
                href={`${explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-4 py-2.5 text-xs font-bold text-white transition-all cursor-pointer"
              >
                <span>View on Explorer</span>
                <ExternalLink size={12} className="text-white/40 shrink-0" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-primary w-full py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
