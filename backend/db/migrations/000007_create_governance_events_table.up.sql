CREATE TABLE IF NOT EXISTS governance_events (
    tx_hash String,
    block_number UInt64,
    timestamp DateTime,
    user_address String,
    proposal_id String,
    tx_type String,
    support String,
    weight String,
    usd_value Float64 DEFAULT 0.0
) ENGINE = MergeTree()
ORDER BY (user_address, timestamp);
