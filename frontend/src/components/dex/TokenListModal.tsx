"use client";

import { useState } from "react";
import Image from "next/image";
import { Search, Trash2, AlertTriangle } from "lucide-react";
import type { TokenOption } from "@/types/dex";
import { useOnChainToken } from "@/hooks/useOnChainToken";
import { useTokenList } from "@/hooks/useTokenList";
import { useConfigStore } from "@/store/useConfigStore";
import type { ApiToken } from "@/types/dex";

interface TokenListModalProps {
  apiTokens: ApiToken[];
  customTokens: TokenOption[];
  onSelect: (token: TokenOption) => void;
  onImport: (token: TokenOption) => void;
  onRemove: (address: string) => void;
  onClose: () => void;
  excludeAddress?: string;
}

export default function TokenListModal({
  apiTokens,
  customTokens,
  onSelect,
  onImport,
  onRemove,
  onClose,
  excludeAddress,
}: TokenListModalProps) {
  const [search, setSearch] = useState("");
  const wethAddress = useConfigStore((s) => s.config?.contract_weth);
  const wethToken: TokenOption | undefined = wethAddress
    ? { address: wethAddress as `0x${string}`, symbol: "ETH", decimals: 18, name: "Ethereum" }
    : undefined;
  const tokens = useTokenList(apiTokens, customTokens, wethToken, search);
  const onChainToken = useOnChainToken(search);

  const filteredTokens = excludeAddress
    ? tokens.filter((t) => t.address.toLowerCase() !== excludeAddress.toLowerCase())
    : tokens;

  const handleImportAndSelect = () => {
    if (!onChainToken) return;
    onImport(onChainToken);
    onSelect(onChainToken);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="rounded-2xl bg-[#0A0A0A] border border-white/[0.08] p-4 sm:p-6 w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xs font-bold text-white/70 uppercase tracking-widest font-mono-dm mb-4">Select Token</h3>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/70" />
          <input
            type="text"
            placeholder="Search symbol, name, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/70 focus:border-[#6EE7B7]/50 focus:outline-none transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredTokens.map((t) => {
            const isCustom = customTokens.some((ct) => ct.address.toLowerCase() === t.address.toLowerCase());
            return (
              <div key={t.address} className="group relative flex items-center rounded-xl hover:bg-white/[0.03] transition-colors">
                <button
                  onClick={() => { onSelect(t); onClose(); }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 pr-12 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {t.logo ? (
                      <Image src={t.logo} alt={t.symbol} width={32} height={32} unoptimized className="rounded-full object-contain shrink-0" />
                    ) : (
                      <div className="w-8 h-8 shrink-0 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-bold text-white/70">
                        {t.symbol[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-white/90 truncate">{t.symbol}</p>
                        {isCustom && (
                          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 font-bold tracking-wider uppercase font-mono-dm scale-90">
                            Imported
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/70 truncate">{t.name}</p>
                    </div>
                  </div>
                </button>
                {isCustom && (
                  <button
                    onClick={() => onRemove(t.address)}
                    className="absolute right-3 p-2 text-white/70 hover:text-red-400 transition-colors cursor-pointer"
                    title="Remove custom token"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {onChainToken && !filteredTokens.some((t) => t.address.toLowerCase() === onChainToken.address.toLowerCase()) && (
            <div className="mt-4 p-4 rounded-xl border border-white/[0.08] bg-white/[0.03] space-y-3.5 animate-fade-in">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-base font-extrabold tracking-tight text-white">{onChainToken.symbol}</p>
                  <p className="text-xs text-white/70 truncate">{onChainToken.name} · Decimals: {onChainToken.decimals}</p>
                  <p
                    className="text-[10px] font-mono text-white/70 bg-white/[0.02] px-2 py-1 rounded border border-white/5 mt-1.5 truncate max-w-full"
                    title={onChainToken.address}
                  >
                    {onChainToken.address.slice(0, 10)}...{onChainToken.address.slice(-8)}
                  </p>
                </div>
                <button
                  onClick={handleImportAndSelect}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-[#6EE7B7] text-[#0A0A0A] hover:bg-[#34D399] text-xs font-black transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(110,231,183,0.2)] cursor-pointer"
                >
                  Import Token
                </button>
              </div>
              <div className="flex gap-2.5 items-start bg-amber-500/5 border border-amber-500/10 p-3 rounded-lg text-amber-400/90">
                <AlertTriangle size={14} className="shrink-0 text-amber-400 mt-0.5" />
                <p className="text-xs leading-normal font-mono-dm">
                  <strong className="font-bold text-amber-400 font-mono-dm">Unknown Token:</strong> Anyone can deploy custom tokens. Please verify this contract address before trading.
                </p>
              </div>
            </div>
          )}

          {filteredTokens.length === 0 && !onChainToken && (
            <p className="text-center py-8 text-sm text-white/70">No tokens found</p>
          )}
        </div>
      </div>
    </div>
  );
}
