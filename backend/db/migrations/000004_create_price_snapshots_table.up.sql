CREATE TABLE IF NOT EXISTS price_snapshots (
    pool_id String,
    timestamp DateTime,
    token0_price_usd Float64,
    token1_price_usd Float64,
    pricing_mode String DEFAULT 'usd'
) ENGINE = ReplacingMergeTree()
ORDER BY (pool_id, timestamp);

CREATE TABLE IF NOT EXISTS tvl_snapshots (
    timestamp DateTime,
    tvl Float64
) ENGINE = MergeTree()
ORDER BY timestamp;
