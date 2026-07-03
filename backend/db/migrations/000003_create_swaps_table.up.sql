CREATE TABLE IF NOT EXISTS swaps (
    tx_hash String,
    block_number UInt64,
    timestamp DateTime,
    pool_id String,
    sender String,
    recipient String,
    user_address String DEFAULT '',
    amount0 String,
    amount1 String,
    tx_type String DEFAULT 'swap',
    usd_value Float64 DEFAULT 0.0,
    pricing_mode String DEFAULT 'usd'
) ENGINE = MergeTree()
ORDER BY (pool_id, timestamp);

CREATE TABLE IF NOT EXISTS swaps_by_user (
    tx_hash String,
    block_number UInt64,
    timestamp DateTime,
    pool_id String,
    sender String,
    recipient String,
    user_address String,
    amount0 String,
    amount1 String,
    tx_type String DEFAULT 'swap',
    usd_value Float64 DEFAULT 0.0,
    pricing_mode String DEFAULT 'usd'
) ENGINE = MergeTree()
ORDER BY (user_address, timestamp);
