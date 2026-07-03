CREATE TABLE IF NOT EXISTS pairs (
    pool_id String,
    token0 String,
    token1 String,
    reserve0 String,
    reserve1 String,
    tvl Float64,
    volume_24h Float64,
    fee Float64
) ENGINE = ReplacingMergeTree()
ORDER BY pool_id;
