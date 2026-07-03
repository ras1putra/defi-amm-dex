import type { ProposalStatus } from "@/types/governance";
import type { Address } from "viem";

export const API_CONFIG = "/api/config";
export const API_DEX_PAIRS = "/api/v2/dex/pairs";
export const API_DEX_TOKENS = "/api/v2/dex/tokens";
export const API_STAKING_POOLS = "/api/v2/staking/pools";
export const API_ANALYTICS_OHLCV = "/api/v2/analytics/pairs";
export const API_ANALYTICS_TVL = "/api/v2/analytics/tvl-history";
export const API_ANALYTICS_VOLUME = "/api/v2/analytics/volume-history";
export const API_ANALYTICS_TOKENS = "/api/v2/analytics/tokens";
export const API_ANALYTICS_APR = "/api/v2/analytics/staking/apr";

export const API_TX_HISTORY = "/api/v2/history";
export const WS_BASE_URL = "/api/v2/ws";

export const SWAP_DEFAULT_SLIPPAGE_BPS = 50;
export const SWAP_DEADLINE_MINUTES = 20;
export const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;

export const CHAIN_NOT_ADDED = 4902;
export const USER_REJECTED = 4001;
export const DEFAULT_PAGE_SIZE = 10;

export const DAYS_IN_YEAR = 365;

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export const BALANCE_REFETCH_INTERVAL = 10_000;
export const BALANCE_STALE_TIME = 2_000;

export const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/dex/v2/swap", label: "Swap V2" },
    { href: "/dex/v2/liquidity", label: "Liquidity V2" },
    { href: "/dex/v2/staking", label: "Staking V2" },
    { href: "/governance", label: "Governance" },
    { href: "/dex/v2/analytics", label: "Analytics V2" },
] as const;

export const GOVERNANCE_STATUS_LABELS: Record<ProposalStatus, string> = {
    pending: "Pending",
    active: "Active",
    executed: "Executed",
    defeated: "Defeated",
    expired: "Expired",
    canceled: "Canceled",
} as const;

export const GOVERNANCE_STATUS_COLORS: Record<ProposalStatus, string> = {
    pending: "text-yellow-400 bg-yellow-400/10",
    active: "text-[#6EE7B7] bg-[#6EE7B7]/10",
    executed: "text-blue-400 bg-blue-400/10",
    defeated: "text-red-400 bg-red-400/10",
    expired: "text-white/40 bg-white/[0.06]",
    canceled: "text-orange-400 bg-orange-400/10",
} as const;

export const SWAP_FEE = 997n;
export const SWAP_FEE_DENOM = 1_000n;
export const SWAP_FEE_PERCENTAGE = Number((SWAP_FEE_DENOM - SWAP_FEE) * 100n) / Number(SWAP_FEE_DENOM);
export const MAX_ROUTE_DEPTH = 3;

export const NATIVE_TOKEN: Address = "0x0000000000000000000000000000000000000000";
export const NULL_ADDRESS: Address = "0x0000000000000000000000000000000000000001";

export const BASE_QUOTE_ASSETS = ["WETH", "ETH", "USDC", "USDT", "DAI", "WBTC"] as const;

export const TIME_RANGES = [
  { label: "1H", interval: 60, lookback: 3600 },
  { label: "4H", interval: 300, lookback: 14400 },
  { label: "1D", interval: 900, lookback: 86400 },
  { label: "1W", interval: 3600, lookback: 604800 },
  { label: "1M", interval: 14400, lookback: 2592000 },
] as const;

