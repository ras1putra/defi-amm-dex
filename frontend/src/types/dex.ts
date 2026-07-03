export interface Pair {
  address: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  reserve0: string;
  reserve1: string;
  decimals0: number;
  decimals1: number;
  tvl: number;
  volume_24h: number;
  fee: number;
  pricing_mode: string;
  logo0?: string;
  logo1?: string;
}

export interface SwapQuote {
  amount_in: string;
  amount_out: string;
  price_impact: number;
  route: string[];
}

export interface RouteOption {
  route: string[];
  amountOut: bigint;
  amountOutFormatted: number;
  priceImpact: number;
  totalFeePercent: number;
  hopCount: number;
  poolReserveIn: bigint;
}

export interface LiquidityPosition {
  pair: string;
  user_lp_balance: string;
  share: number;
  token0_deposited: string;
  token1_deposited: string;
}

export interface Pool {
  address: string;
  name: string;
  token0: string;
  token1: string;
  reserve0: number;
  reserve1: number;
  tvl: number;
  volume_24h: number;
  fees_24h: number;
  apr: number;
  pricingMode?: string;
  logo0?: string;
  logo1?: string;
}

export type SwapStep = "idle" | "quoting" | "quoted" | "needsApprove" | "approving" | "signing" | "pending" | "confirmed" | "failed";

export const SWAP_STEP = {
  IDLE: "idle",
  QUOTING: "quoting",
  QUOTED: "quoted",
  NEEDS_APPROVE: "needsApprove",
  APPROVING: "approving",
  SIGNING: "signing",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FAILED: "failed",
} as const satisfies Record<string, SwapStep>;

export type AddLiquidityStep =
  | "idle"
  | "needsApprove0"
  | "needsApprove1"
  | "approving0"
  | "approving1"
  | "ready"
  | "signing"
  | "pending"
  | "confirmed"
  | "failed";

export const ADD_LIQ_STEP = {
  IDLE: "idle",
  NEEDS_APPROVE_0: "needsApprove0",
  NEEDS_APPROVE_1: "needsApprove1",
  APPROVING_0: "approving0",
  APPROVING_1: "approving1",
  READY: "ready",
  SIGNING: "signing",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FAILED: "failed",
} as const satisfies Record<string, AddLiquidityStep>;

export type RemoveLiquidityStep =
  | "idle"
  | "needsApprove"
  | "approving"
  | "ready"
  | "signing"
  | "pending"
  | "confirmed"
  | "failed";

export const REMOVE_LIQ_STEP = {
  IDLE: "idle",
  NEEDS_APPROVE: "needsApprove",
  APPROVING: "approving",
  READY: "ready",
  SIGNING: "signing",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  FAILED: "failed",
} as const satisfies Record<string, RemoveLiquidityStep>;

export interface TokenOption {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  name: string;
  logo?: string;
}

export interface ApiToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_url: string;
}
