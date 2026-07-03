export interface ChainConfig {
  chain_id: number;
  chain_name: string;
  rpc_url: string;
  explorer_url?: string;
  currency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface AppConfig {
  contract_v2_amm: string;
  contract_v2_router: string;
  contract_weth: string;
  contract_staking: string;
  contract_governor: string;
  stablecoin_address: string;
  chain: ChainConfig;
}
