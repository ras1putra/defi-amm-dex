package dto

type PairResponse struct {
	Address     string  `json:"address"`
	Token0      string  `json:"token0"`
	Token1      string  `json:"token1"`
	Symbol0     string  `json:"symbol0"`
	Symbol1     string  `json:"symbol1"`
	Logo0       string  `json:"logo0"`
	Logo1       string  `json:"logo1"`
	Reserve0    string  `json:"reserve0"`
	Reserve1    string  `json:"reserve1"`
	Decimals0   uint8   `json:"decimals0"`
	Decimals1   uint8   `json:"decimals1"`
	TVL         float64 `json:"tvl"`
	Volume24h   float64 `json:"volume_24h"`
	Fee         float64 `json:"fee"`
	PricingMode string  `json:"pricing_mode"`
}


