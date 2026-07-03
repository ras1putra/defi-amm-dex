package dto

type StakingPoolResponse struct {
	PoolID             int     `json:"pool_id"`
	Address            string  `json:"address"`
	StakingToken       string  `json:"staking_token"`
	StakingTokenSymbol string  `json:"staking_token_symbol"`
	RewardToken        string  `json:"reward_token"`
	RewardTokenSymbol  string  `json:"reward_token_symbol"`
	TotalStaked        string  `json:"total_staked"`
	RewardRate         string  `json:"reward_rate"`
	APR                float64 `json:"apr"`
	UserStaked         string  `json:"user_staked"`
	UserPendingRewards string  `json:"user_pending_rewards"`
	IsClosed           bool    `json:"is_closed"`
}
