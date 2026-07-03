CREATE TABLE IF NOT EXISTS staking_events (
    tx_hash String,
    block_number UInt64,
    timestamp DateTime,
    user_address String,
    pool_id String,
    tx_type String,
    amount String,
    reward_amount String,
    usd_value Float64 DEFAULT 0.0
) ENGINE = MergeTree()
ORDER BY (user_address, timestamp);
