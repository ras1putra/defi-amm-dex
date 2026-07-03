export interface StakingPool {
  pool_id: number;
  address: string;
  rewarder_address: string;
  staking_token: string;
  staking_token_symbol: string;
  reward_token: string;
  reward_token_symbol: string;
  total_staked: string;
  reward_rate: string;
  apr: number;
  user_staked: string;
  user_pending_rewards: string;
  total_reward_pool: string;
  remaining_rewards: string;
  reward_token_decimals: number;
  is_closed: boolean;
}

export interface StakingAction {
  pool_id: number;
  pool_address: string;
  amount: string;
}
