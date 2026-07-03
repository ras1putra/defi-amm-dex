"use client";

import { useState } from "react";
import { SLIPPAGE_PRESETS_BPS } from "@/lib/constants";
import { sanitizeDecimalInput } from "@/schema/token";

interface SlippageSelectorProps {
  value: number;
  onChange: (bps: number) => void;
  accentColor?: "green" | "amber";
  showCustomInput?: boolean;
}

const accentClasses = {
  green: "bg-[#6EE7B7] text-[#0A0A0A] shadow-[0_4px_12px_rgba(110,231,183,0.15)]",
  amber: "bg-amber-500 text-zinc-950",
};

export default function SlippageSelector({
  value,
  onChange,
  accentColor = "green",
  showCustomInput = true,
}: SlippageSelectorProps) {
  const [customText, setCustomText] = useState("");
  const activeClass = accentClasses[accentColor];

  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.01]">
      <span className="text-xs text-white/40 font-mono-dm uppercase tracking-wider">Slippage</span>
      <div className="flex items-center gap-1.5">
        {SLIPPAGE_PRESETS_BPS.map((bps) => (
          <button
            key={bps}
            onClick={() => { onChange(bps); setCustomText(""); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono-dm transition-all cursor-pointer ${
              value === bps && customText === ""
                ? activeClass
                : "bg-white/[0.04] text-white/70 border border-white/[0.06] hover:bg-white/[0.08]"
            }`}
          >
            {bps / 100}%
          </button>
        ))}
        {showCustomInput && (
          <input
            type="text"
            inputMode="decimal"
            value={customText}
            onChange={(e) => {
              const val = sanitizeDecimalInput(e.target.value);
              if (val === null) return;
              setCustomText(val);
              if (val === "" || val === ".") return;
              const num = parseFloat(val);
              if (!isNaN(num) && num > 0 && num <= 50) {
                onChange(Math.round(num * 100));
              }
            }}
            placeholder="Custom"
            className="w-12 px-1.5 py-1 rounded-lg text-xs font-bold font-mono-dm bg-white/[0.04] text-white/70 border border-white/[0.06] outline-none focus:border-[#6EE7B7]/50 text-center"
          />
        )}
      </div>
    </div>
  );
}
