package dto

type AnalyticsOverview struct {
	TotalTVL       float64         `json:"total_tvl"`
	TotalVolume24h float64         `json:"total_volume_24h"`
	PairCount      int             `json:"pair_count"`
	Pairs          []PairAnalytics `json:"pairs"`
	PricingMode    string          `json:"pricing_mode"`
}

type PairAnalytics struct {
	PoolID         string  `json:"pool_id"`
	Token0         string  `json:"token0"`
	Token1         string  `json:"token1"`
	Symbol0        string  `json:"symbol0"`
	Symbol1        string  `json:"symbol1"`
	Price          float64 `json:"price"`
	PriceChange24h float64 `json:"price_change_24h"`
	TVLUSD         float64 `json:"tvl_usd"`
	Volume24hUSD   float64 `json:"volume_24h_usd"`
	Fees24hUSD     float64 `json:"fees_24h_usd"`
	APR            float64 `json:"apr"`
	Reserve0       float64 `json:"reserve0"`
	Reserve1       float64 `json:"reserve1"`
	PricingMode    string  `json:"pricing_mode"`
}

type TVLPoint struct {
	Timestamp int64   `json:"timestamp"`
	TVL       float64 `json:"tvl"`
}

type VolumePoint struct {
	Timestamp int64   `json:"timestamp"`
	Volume    float64 `json:"volume"`
}

type PricePoint struct {
	Timestamp int64   `json:"timestamp"`
	Price     float64 `json:"price"`
}

type OHLCVBar struct {
	Timestamp int64   `json:"timestamp"`
	Open      float64 `json:"open"`
	High      float64 `json:"high"`
	Low       float64 `json:"low"`
	Close     float64 `json:"close"`
	Volume    float64 `json:"volume"`
}

type StakingAPRResponse struct {
	APR            float64 `json:"apr"`
	TotalStaked    float64 `json:"total_staked"`
	RewardsPerYear float64 `json:"rewards_per_year"`
}

type TokenPrice struct {
	Address        string  `json:"address"`
	Symbol         string  `json:"symbol"`
	Name           string  `json:"name"`
	Decimals       uint8   `json:"decimals"`
	LogoURL        string  `json:"logo_url"`
	PriceUSD       float64 `json:"price_usd"`
	PriceETH       float64 `json:"price_eth"`
	PriceChange24h float64 `json:"price_change_24h"`
}
