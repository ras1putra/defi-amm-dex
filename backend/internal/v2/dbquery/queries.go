package dbquery

const (
	// SelectPairs fetches all trading pools with token metadata
	SelectPairs = `
		SELECT
			p.pool_id,
			p.token0,
			p.token1,
			if(t0.address = '', 'UNKNOWN', t0.symbol) as symbol0,
			if(t1.address = '', 'UNKNOWN', t1.symbol) as symbol1,
			if(t0.address = '', '', t0.logo_url) as logo0,
			if(t1.address = '', '', t1.logo_url) as logo1,
			p.reserve0,
			p.reserve1,
			p.tvl,
			if(t0.address = '', 18, t0.decimals) as dec0,
			if(t1.address = '', 18, t1.decimals) as dec1,
			COALESCE(v.vol_24h_usd, 0.0) as volume_24h_usd,
			COALESCE(v.vol_24h_weth, 0.0) as volume_24h_weth,
			p.fee
		FROM (SELECT * FROM pairs FINAL) AS p
		LEFT JOIN (SELECT * FROM tokens FINAL) AS t0 ON p.token0 = t0.address
		LEFT JOIN (SELECT * FROM tokens FINAL) AS t1 ON p.token1 = t1.address
		LEFT JOIN (
			SELECT pool_id,
				sum(if(pricing_mode = 'usd', usd_value, 0)) AS vol_24h_usd,
				sum(if(pricing_mode = 'weth', usd_value, 0)) AS vol_24h_weth
			FROM swaps
			WHERE timestamp >= now() - INTERVAL 24 HOUR
			GROUP BY pool_id
		) AS v ON p.pool_id = v.pool_id
	`

	// SelectPairsList is used by the indexer to load known pools from database
	SelectPairsList = `
		SELECT
			p.pool_id, p.token0, p.token1, p.fee,
			if(t0.address = '', 18, t0.decimals) as dec0,
			if(t1.address = '', 18, t1.decimals) as dec1,
			COALESCE(p.reserve0, '0') as r0,
			COALESCE(p.reserve1, '0') as r1
		FROM (SELECT * FROM pairs FINAL) AS p
		LEFT JOIN (SELECT * FROM tokens FINAL) AS t0 ON p.token0 = t0.address
		LEFT JOIN (SELECT * FROM tokens FINAL) AS t1 ON p.token1 = t1.address
	`

	// InsertPairInitial creates a new pool with zero reserves
	InsertPairInitial = `
		INSERT INTO pairs (pool_id, token0, token1, reserve0, reserve1, tvl, volume_24h, fee)
		VALUES (?, ?, ?, '0', '0', 0.0, 0.0, ?)
	`

	// InsertPairReserves updates reserves and tvl for a pool
	InsertPairReserves = `
		INSERT INTO pairs (pool_id, token0, token1, reserve0, reserve1, tvl, volume_24h, fee)
		VALUES (?, ?, ?, ?, ?, ?, 0.0, ?)
	`

	// InsertSwap inserts a new indexed Swap event
	InsertSwap = `
		INSERT INTO swaps (tx_hash, block_number, timestamp, pool_id, sender, recipient, user_address, amount0, amount1, tx_type, usd_value, pricing_mode)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	InsertPriceSnapshot = `
		INSERT INTO price_snapshots (pool_id, timestamp, token0_price_usd, token1_price_usd, pricing_mode)
		VALUES (?, now(), ?, ?, ?)
	`

	SelectLatestPriceSnapshot = `
		SELECT token0_price_usd, token1_price_usd
		FROM price_snapshots
		WHERE pool_id = ?
		ORDER BY timestamp DESC
		LIMIT 1
	`

	SelectPriceHistory = `
		SELECT toUnixTimestamp(timestamp) * 1000 AS ts, token0_price_usd
		FROM price_snapshots
		WHERE pool_id = ? AND pricing_mode = 'usd' AND timestamp > now() - INTERVAL 7 DAY
		ORDER BY timestamp ASC
	`

	SelectPrice24hAgo = `
		SELECT token0_price_usd, token1_price_usd
		FROM price_snapshots
		WHERE pool_id = ? AND timestamp < now() - INTERVAL 24 HOUR
		ORDER BY timestamp DESC
		LIMIT 1
	`

	SelectPriceAgoDynamic = `
		SELECT token0_price_usd, token1_price_usd
		FROM price_snapshots
		WHERE pool_id = ? AND timestamp < now() - INTERVAL ? SECOND
		ORDER BY timestamp DESC
		LIMIT 1
	`

	SelectGlobalTVL = `
		SELECT sum(tvl) FROM pairs FINAL
	`

	SelectDailyVolume = `
		SELECT
			toUnixTimestamp(toStartOfDay(timestamp)) * 1000 AS ts,
			SUM(usd_value) AS vol
		FROM swaps
		WHERE timestamp > now() - INTERVAL 30 DAY
		GROUP BY toStartOfDay(timestamp)
		ORDER BY ts ASC
	`

	SelectTVLHistory = `
		SELECT toUnixTimestamp(timestamp) * 1000 AS ts, tvl
		FROM tvl_snapshots
		WHERE timestamp > now() - INTERVAL 30 DAY
		ORDER BY timestamp ASC
	`

	InsertTVLSnapshot = `
		INSERT INTO tvl_snapshots (timestamp, tvl)
		VALUES (now(), ?)
	`

	SelectOHLCV = `
		SELECT
			c.ts,
			c.open,
			c.high,
			c.low,
			c.close,
			COALESCE(v.vol, 0.0) AS volume
		FROM (
			SELECT
				toUInt64(toStartOfInterval(timestamp, INTERVAL ? SECOND)) * 1000 AS ts,
				argMin(if(?, token1_price_usd, token0_price_usd), timestamp) AS open,
				max(if(?, token1_price_usd, token0_price_usd)) AS high,
				min(if(?, token1_price_usd, token0_price_usd)) AS low,
				argMax(if(?, token1_price_usd, token0_price_usd), timestamp) AS close
			FROM price_snapshots
			WHERE pool_id = ? AND pricing_mode = 'usd' AND timestamp > now() - INTERVAL ? SECOND
			GROUP BY toStartOfInterval(timestamp, INTERVAL ? SECOND)
		) c
		LEFT JOIN (
			SELECT
				toUInt64(toStartOfInterval(timestamp, INTERVAL ? SECOND)) * 1000 AS ts,
				sum(usd_value) AS vol
			FROM swaps
			WHERE pool_id = ? AND timestamp > now() - INTERVAL ? SECOND
			GROUP BY toStartOfInterval(timestamp, INTERVAL ? SECOND)
		) v ON c.ts = v.ts
		ORDER BY c.ts ASC
	`

	SelectTokenPrices = `
		SELECT
			address,
			any(symbol) AS symbol,
			any(name) AS name,
			any(decimals) AS decimals,
			any(logo_url) AS logo_url,
			max(price_usd) AS price_usd,
			max(price_eth) AS price_eth
		FROM (
			SELECT p.token0 AS address, t.symbol, t.name, t.decimals, t.logo_url,
				argMax(ps.token0_price_usd, ps.timestamp) AS price_usd,
				0.0 AS price_eth
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			INNER JOIN (SELECT * FROM tokens FINAL) AS t ON p.token0 = t.address
			GROUP BY p.token0, t.symbol, t.name, t.decimals, t.logo_url
			UNION ALL
			SELECT p.token1 AS address, t.symbol, t.name, t.decimals, t.logo_url,
				0.0 AS price_usd,
				argMax(ps.token1_price_usd, ps.timestamp) AS price_eth
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			INNER JOIN (SELECT * FROM tokens FINAL) AS t ON p.token1 = t.address
			GROUP BY p.token1, t.symbol, t.name, t.decimals, t.logo_url
		)
		GROUP BY address
	`

	SelectTokenPriceChange = `
		SELECT
			argMax(current_price, ts) AS current_price,
			argMax(old_price, old_ts) AS old_price
		FROM (
			SELECT ps.token0_price_usd AS current_price, toUnixTimestamp(ps.timestamp) AS ts, 0.0 AS old_price, 0 AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token0 = ? AND ps.timestamp > now() - INTERVAL 24 HOUR
			UNION ALL
			SELECT 0.0 AS current_price, 0 AS ts, ps.token0_price_usd AS old_price, toUnixTimestamp(ps.timestamp) AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token0 = ? AND ps.timestamp < now() - INTERVAL 24 HOUR
			UNION ALL
			SELECT ps.token1_price_usd AS current_price, toUnixTimestamp(ps.timestamp) AS ts, 0.0 AS old_price, 0 AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token1 = ? AND ps.timestamp > now() - INTERVAL 24 HOUR
			UNION ALL
			SELECT 0.0 AS current_price, 0 AS ts, ps.token1_price_usd AS old_price, toUnixTimestamp(ps.timestamp) AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token1 = ? AND ps.timestamp < now() - INTERVAL 24 HOUR
		)
	`

	SelectTokenPriceChangeDynamic = `
		SELECT
			argMax(current_price, ts) AS current_price,
			argMax(old_price, old_ts) AS old_price
		FROM (
			SELECT ps.token0_price_usd AS current_price, toUnixTimestamp(ps.timestamp) AS ts, 0.0 AS old_price, 0 AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token0 = ? AND ps.timestamp > now() - INTERVAL ? SECOND
			UNION ALL
			SELECT 0.0 AS current_price, 0 AS ts, ps.token0_price_usd AS old_price, toUnixTimestamp(ps.timestamp) AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token0 = ? AND ps.timestamp < now() - INTERVAL ? SECOND
			UNION ALL
			SELECT ps.token1_price_usd AS current_price, toUnixTimestamp(ps.timestamp) AS ts, 0.0 AS old_price, 0 AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token1 = ? AND ps.timestamp > now() - INTERVAL ? SECOND
			UNION ALL
			SELECT 0.0 AS current_price, 0 AS ts, ps.token1_price_usd AS old_price, toUnixTimestamp(ps.timestamp) AS old_ts
			FROM price_snapshots ps
			INNER JOIN (SELECT * FROM pairs FINAL) AS p ON ps.pool_id = p.pool_id
			WHERE p.token1 = ? AND ps.timestamp < now() - INTERVAL ? SECOND
		)
	`

	InsertLiquidityEvent = `
		INSERT INTO liquidity_events (tx_hash, block_number, timestamp, pool_id, sender, tx_type, amount0, amount1, lp_amount, usd_value, user_address)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	InsertStakingEvent = `
		INSERT INTO staking_events (tx_hash, block_number, timestamp, user_address, pool_id, tx_type, amount, reward_amount, usd_value)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	InsertGovernanceEvent = `
		INSERT INTO governance_events (tx_hash, block_number, timestamp, user_address, proposal_id, tx_type, support, weight, usd_value)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	SelectTxHistory = `
		SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, pool_id, sender, amount0, amount1, usd_value
		FROM swaps
		WHERE user_address = ?
		ORDER BY timestamp DESC
	`

	SelectTxHistoryLiquidity = `
		SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, pool_id, sender, amount0, amount1, usd_value
		FROM liquidity_events
		WHERE sender = ?
	`

	SelectTxHistoryStaking = `
		SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, toString(pool_id) AS pool_id, user_address AS sender, amount AS amount0, reward_amount AS amount1, usd_value
		FROM staking_events
		WHERE user_address = ?
	`

	SelectTxHistoryGovernance = `
		SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, proposal_id AS pool_id, user_address AS sender, support AS amount0, weight AS amount1, usd_value
		FROM governance_events
		WHERE user_address = ?
	`
)
