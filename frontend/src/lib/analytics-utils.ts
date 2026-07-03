import type { PairAnalytics } from "@/types/analytics";
import type { AnalyticsOverview } from "@/types/analytics";

export type SortKey = "volume" | "tvl" | "apr" | "priceChange" | "name";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "volume", label: "Volume" },
  { key: "tvl", label: "TVL" },
  { key: "apr", label: "APR" },
  { key: "priceChange", label: "Price Change" },
  { key: "name", label: "Name" },
];

export const PER_PAGE = 20;

export function sortPairs(pairs: PairAnalytics[], key: SortKey): PairAnalytics[] {
  const sorted = [...pairs];
  switch (key) {
    case "volume":
      sorted.sort((a, b) => b.volume_24h_usd - a.volume_24h_usd);
      break;
    case "tvl":
      sorted.sort((a, b) => b.tvl_usd - a.tvl_usd);
      break;
    case "apr":
      sorted.sort((a, b) => b.apr - a.apr);
      break;
    case "priceChange":
      sorted.sort((a, b) => b.price_change_24h - a.price_change_24h);
      break;
    case "name":
      sorted.sort((a, b) => `${a.symbol0}/${a.symbol1}`.localeCompare(`${b.symbol0}/${b.symbol1}`));
      break;
  }
  return sorted;
}

export function findPoolForToken(
  overview: AnalyticsOverview | null | undefined,
  tokenAddress: string,
): string | null {
  if (!overview) return null;
  const addr = tokenAddress.toLowerCase();
  const pair = overview.pairs.find(
    (p) => p.token0.toLowerCase() === addr || p.token1.toLowerCase() === addr,
  );
  return pair?.pool_id ?? null;
}
