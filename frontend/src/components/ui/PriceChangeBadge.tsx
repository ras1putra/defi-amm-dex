import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceChangeBadgeProps {
  pct: number;
  size?: "sm" | "xs";
  showMinus?: boolean;
}

export function PriceChangeBadge({ pct, size = "xs", showMinus = true }: PriceChangeBadgeProps) {
  const iconSize = size === "sm" ? 14 : 12;
  const textSize = size === "sm" ? "text-sm font-bold" : "text-xs";

  if (pct === 0) {
    if (showMinus) {
      return (
        <span className={`inline-flex items-center justify-end text-white/40 font-mono-dm ${textSize}`}>
          <Minus size={iconSize} />
        </span>
      );
    }
    return <span className={`inline-flex items-center justify-end text-white/40 font-mono-dm ${textSize}`}>0.00%</span>;
  }

  if (pct > 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-[#6EE7B7] font-mono-dm ${textSize}`}>
        <TrendingUp size={iconSize} /> +{pct.toFixed(2)}%
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-red-400 font-mono-dm ${textSize}`}>
      <TrendingDown size={iconSize} /> {pct.toFixed(2)}%
    </span>
  );
}
