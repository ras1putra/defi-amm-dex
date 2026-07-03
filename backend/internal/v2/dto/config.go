package dto

type CurrencyResponse struct {
	Name     string `json:"name"`
	Symbol   string `json:"symbol"`
	Decimals int    `json:"decimals"`
}

type ChainConfigResponse struct {
	ChainID     int              `json:"chain_id"`
	ChainName   string           `json:"chain_name"`
	RPCURL      string           `json:"rpc_url"`
	ExplorerURL string           `json:"explorer_url"`
	Currency    CurrencyResponse `json:"currency"`
}

type ConfigResponse struct {
	ContractV2AMM     string              `json:"contract_v2_amm"`
	ContractV2Router  string              `json:"contract_v2_router"`
	ContractWETH        string              `json:"contract_weth"`
	ContractStaking   string              `json:"contract_staking"`
	ContractGovernor  string              `json:"contract_governor"`
	StablecoinAddress string              `json:"stablecoin_address"`
	Chain             ChainConfigResponse `json:"chain"`
}
