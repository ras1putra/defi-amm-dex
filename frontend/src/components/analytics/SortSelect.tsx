import { ArrowUpDown } from "lucide-react";
import { SORT_OPTIONS, type SortKey } from "@/hooks/useAnalytics";

interface SortSelectProps {
  sortKey: SortKey;
  onChange: (key: SortKey) => void;
}

export function SortSelect({ sortKey, onChange }: SortSelectProps) {
  return (
    <div className="relative">
      <select
        value={sortKey}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="appearance-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 pr-8 text-xs text-white/70 font-mono-dm cursor-pointer focus:outline-none focus:border-[#6EE7B7]/30 transition-colors"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key} className="bg-[#0A0A0A] text-white/70">
            {o.label}
          </option>
        ))}
      </select>
      <ArrowUpDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/70" />
    </div>
  );
}
