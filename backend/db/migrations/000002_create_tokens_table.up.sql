CREATE TABLE IF NOT EXISTS tokens (
    address String,
    symbol String,
    name String,
    decimals UInt8,
    logo_url String
) ENGINE = ReplacingMergeTree()
ORDER BY address;
