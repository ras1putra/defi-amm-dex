export interface PairAnalytics {
  pool_id: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  price: number;
  price_change_24h: number;
  tvl_usd: number;
  volume_24h_usd: number;
  fees_24h_usd: number;
  apr: number;
  reserve0: number;
  reserve1: number;
}

export interface AnalyticsOverview {
  total_tvl: number;
  total_volume_24h: number;
  pair_count: number;
  pairs: PairAnalytics[];
  pricing_mode?: string;
}

export interface TVLPoint {
  timestamp: number;
  tvl: number;
}

export interface VolumePoint {
  timestamp: number;
  volume: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StakingAPR {
  apr: number;
  total_staked: number;
  rewards_per_year: number;
}

export interface TokenPrice {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_url: string;
  price_usd: number;
  price_eth: number;
  price_change_24h: number;
}
