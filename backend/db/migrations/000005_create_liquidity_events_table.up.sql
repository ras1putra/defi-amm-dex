CREATE TABLE IF NOT EXISTS liquidity_events (
    tx_hash String,
    block_number UInt64,
    timestamp DateTime,
    pool_id String,
    sender String,
    user_address String DEFAULT '',
    tx_type String DEFAULT 'liquidity',
    amount0 String,
    amount1 String,
    lp_amount String,
    usd_value Float64 DEFAULT 0.0
) ENGINE = MergeTree()
ORDER BY (user_address, timestamp);
