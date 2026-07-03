package dto

type TxHistoryItem struct {
	TxHash    string  `json:"tx_hash"`
	Timestamp uint32  `json:"timestamp"`
	TxType    string  `json:"tx_type"`
	PoolID    string  `json:"pool_id"`
	Sender    string  `json:"sender"`
	Amount0   string  `json:"amount0"`
	Amount1   string  `json:"amount1"`
	USDValue  float64 `json:"usd_value"`
}

type TxHistoryResponse struct {
	Items      []TxHistoryItem `json:"items"`
	Total      int             `json:"total"`
	Page       int             `json:"page"`
	PageSize   int             `json:"page_size"`
	TotalPages int             `json:"total_pages"`
}
