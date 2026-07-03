package service

import (
	"context"
	"math"
	"math/big"
	"strings"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/v2/dbquery"
	"defi-amm-dex/internal/v2/dto"
)

type AnalyticsServicer interface {
	GetOverview(ctx context.Context, intervalSeconds int) (*dto.AnalyticsOverview, error)
	GetTVLHistory(ctx context.Context) ([]dto.TVLPoint, error)
	GetVolumeHistory(ctx context.Context) ([]dto.VolumePoint, error)
	GetPriceHistory(ctx context.Context, poolID string) ([]dto.PricePoint, error)
	GetPairDetail(ctx context.Context, poolID string) (*dto.PairAnalytics, error)
	GetStakingAPR(ctx context.Context) (*dto.StakingAPRResponse, error)
	GetOHLCV(ctx context.Context, poolID string, tokenAddress string, intervalSeconds int, lookbackSeconds int) ([]dto.OHLCVBar, error)
	GetTokenPrices(ctx context.Context, intervalSeconds int) ([]dto.TokenPrice, error)
}

type AnalyticsService struct {
	ch     *clickhouse.Client
	pricer *Pricer
}

func NewAnalyticsService(ch *clickhouse.Client, pricer *Pricer) *AnalyticsService {
	return &AnalyticsService{ch: ch, pricer: pricer}
}

func (s *AnalyticsService) GetOverview(ctx context.Context, intervalSeconds int) (*dto.AnalyticsOverview, error) {
	pairs, err := s.getPairAnalytics(ctx, "", intervalSeconds)
	if err != nil {
		return nil, err
	}

	var totalTVL float64
	var totalVol24h float64
	for _, p := range pairs {
		totalTVL += p.TVLUSD
		totalVol24h += p.Volume24hUSD
	}

	pricingMode := ""
	if len(pairs) > 0 {
		pricingMode = pairs[0].PricingMode
	} else {
		pricingMode = s.pricer.GetPricingMode(ctx)
	}

	return &dto.AnalyticsOverview{
		TotalTVL:       totalTVL,
		TotalVolume24h: totalVol24h,
		PairCount:      len(pairs),
		Pairs:          pairs,
		PricingMode:    pricingMode,
	}, nil
}

func (s *AnalyticsService) getPairAnalytics(ctx context.Context, targetPoolID string, intervalSeconds int) ([]dto.PairAnalytics, error) {
	conn := s.ch.Conn()

	rows, err := conn.Query(ctx, dbquery.SelectPairs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rawPair struct {
		poolID, t0, t1, s0, s1, l0, l1, r0, r1 string
		tvl, vol24hUSD, vol24hWETH, fee        float64
		dec0, dec1                             uint8
	}

	var rawPairs []rawPair
	for rows.Next() {
		var p rawPair
		if err := rows.Scan(&p.poolID, &p.t0, &p.t1, &p.s0, &p.s1, &p.l0, &p.l1, &p.r0, &p.r1, &p.tvl, &p.dec0, &p.dec1, &p.vol24hUSD, &p.vol24hWETH, &p.fee); err != nil {
			return nil, err
		}
		rawPairs = append(rawPairs, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Build reserve info map for pricing
	reserves := make(map[string]ReserveInfo)
	for _, p := range rawPairs {
		r0, ok := new(big.Int).SetString(p.r0, 10)
		if !ok {
			r0 = big.NewInt(0)
		}
		r1, ok := new(big.Int).SetString(p.r1, 10)
		if !ok {
			r1 = big.NewInt(0)
		}
		reserves[p.poolID] = ReserveInfo{
			Reserve0:  r0,
			Reserve1:  r1,
			Decimals0: p.dec0,
			Decimals1: p.dec1,
		}
	}

	prices, pricingMode, ethPriceUSD := s.pricer.ResolveAllPairs(ctx, reserves)

	type oldPrice struct{ t0, t1 float64 }

	oldPrices := make(map[string]oldPrice)
	targetPoolID = strings.ToLower(targetPoolID)
	for _, p := range rawPairs {
		if targetPoolID != "" && strings.ToLower(p.poolID) != targetPoolID {
			continue
		}
		oRows, err := conn.Query(ctx,
			"SELECT token0_price_usd, token1_price_usd FROM price_snapshots WHERE pool_id = ? AND timestamp < now() - INTERVAL ? SECOND AND pricing_mode = ? ORDER BY timestamp DESC LIMIT 1",
			p.poolID, intervalSeconds, pricingMode,
		)
		if err != nil {
			continue
		}
		if oRows.Next() {
			var op oldPrice
			oRows.Scan(&op.t0, &op.t1)
			oldPrices[p.poolID] = op
			oRows.Close()
		} else {
			oRows.Close()
			fallbackRows, err := conn.Query(ctx,
				"SELECT token0_price_usd, token1_price_usd FROM price_snapshots WHERE pool_id = ? AND token0_price_usd > 0.000001 AND token1_price_usd > 0.000001 AND pricing_mode = ? ORDER BY timestamp ASC LIMIT 1",
				p.poolID, pricingMode,
			)
			if err == nil {
				if fallbackRows.Next() {
					var op oldPrice
					fallbackRows.Scan(&op.t0, &op.t1)
					oldPrices[p.poolID] = op
				}
				fallbackRows.Close()
			}
		}
	}

	result := make([]dto.PairAnalytics, 0, len(rawPairs))
	for _, p := range rawPairs {
		pp, hasPrice := prices[p.poolID]
		t0Ref := 0.0
		t1Ref := 0.0
		if hasPrice {
			t0Ref = pp.Token0Price
			t1Ref = pp.Token1Price
		}

		// Compute token0 price from reserves
		price := 0.0
		si, ok := reserves[p.poolID]
		if ok {
			price = reserveToPrice(si.Reserve0, si.Reserve1, si.Decimals0, si.Decimals1)
		}

		dec0 := s.pricer.getTokenDecimals(ctx, p.t0)
		dec1 := s.pricer.getTokenDecimals(ctx, p.t1)

		r0 := new(big.Float)
		r0.SetString(p.r0)
		r0F, _ := r0.Float64()
		r1 := new(big.Float)
		r1.SetString(p.r1)
		r1F, _ := r1.Float64()

		u0 := r0F / math.Pow(10, float64(dec0))
		u1 := r1F / math.Pow(10, float64(dec1))

		stableAddr := strings.ToLower(s.pricer.cfg.StablecoinAddress)
		wethAddr := strings.ToLower(s.pricer.cfg.ContractWETH)
		t0 := strings.ToLower(p.t0)
		t1 := strings.ToLower(p.t1)

		isBase0 := t0 == stableAddr || t0 == wethAddr
		isBase1 := t1 == stableAddr || t1 == wethAddr

		tvlRef := 0.0
		if isBase0 && !isBase1 && t0Ref > 0 {
			tvlRef = 2 * u0 * t0Ref
		} else if isBase1 && !isBase0 && t1Ref > 0 {
			tvlRef = 2 * u1 * t1Ref
		} else {
			tvlRef = u0*t0Ref + u1*t1Ref
		}

		// Convert split volumes to the reference currency
		var volRef float64
		if pricingMode == "usd" && ethPriceUSD > 0 {
			volRef = p.vol24hUSD + p.vol24hWETH*ethPriceUSD
		} else {
			volRef = p.vol24hWETH + p.vol24hUSD
		}

		feesRef := volRef * (p.fee / 100.0)
		apr := 0.0
		if tvlRef > 0 {
			apr = (feesRef * 365 * 100) / tvlRef
		}

		// Resolve pool-specific implied USD prices
		t0PoolPrice := t0Ref
		t1PoolPrice := t1Ref
		if u0 > 0 && u1 > 0 {
			if t0 == stableAddr {
				t1PoolPrice = t0Ref * (u0 / u1)
			} else if t1 == stableAddr {
				t0PoolPrice = t1Ref * (u1 / u0)
			} else if t0 == wethAddr && t1 != stableAddr {
				t1PoolPrice = t0Ref * (u0 / u1)
			} else if t1 == wethAddr && t0 != stableAddr {
				t0PoolPrice = t1Ref * (u1 / u0)
			}
		}

		priceChange := 0.0
		if old, ok := oldPrices[p.poolID]; ok && hasPrice {
			useToken0 := true
			if t1 == stableAddr {
				useToken0 = true
			} else if t0 == stableAddr {
				useToken0 = false
			} else if t1 == wethAddr && t0 != wethAddr {
				useToken0 = true
			} else if t0 == wethAddr && t1 != wethAddr {
				useToken0 = false
			}

			if useToken0 {
				if t0PoolPrice > 0 && old.t0 > 0 {
					priceChange = ((t0PoolPrice - old.t0) / old.t0) * 100
				}
			} else {
				if t1PoolPrice > 0 && old.t1 > 0 {
					priceChange = ((t1PoolPrice - old.t1) / old.t1) * 100
				}
			}
		}

		result = append(result, dto.PairAnalytics{
			PoolID:         p.poolID,
			Token0:         p.t0,
			Token1:         p.t1,
			Symbol0:        p.s0,
			Symbol1:        p.s1,
			Price:          price,
			PriceChange24h: priceChange,
			TVLUSD:         tvlRef,
			Volume24hUSD:   volRef,
			Fees24hUSD:     feesRef,
			APR:            apr,
			PricingMode:    pricingMode,
			Reserve0:       u0,
			Reserve1:       u1,
		})
	}

	return result, nil
}

func (s *AnalyticsService) GetTVLHistory(ctx context.Context) ([]dto.TVLPoint, error) {
	conn := s.ch.Conn()
	rows, err := conn.Query(ctx, dbquery.SelectTVLHistory)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	points := make([]dto.TVLPoint, 0)
	for rows.Next() {
		var ts uint64
		var tvl float64
		if err := rows.Scan(&ts, &tvl); err != nil {
			return nil, err
		}
		points = append(points, dto.TVLPoint{Timestamp: int64(ts), TVL: tvl})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return points, nil
}

func (s *AnalyticsService) GetVolumeHistory(ctx context.Context) ([]dto.VolumePoint, error) {
	conn := s.ch.Conn()
	rows, err := conn.Query(ctx, dbquery.SelectDailyVolume)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	points := make([]dto.VolumePoint, 0)
	for rows.Next() {
		var ts uint64
		var vol float64
		if err := rows.Scan(&ts, &vol); err != nil {
			return nil, err
		}
		points = append(points, dto.VolumePoint{Timestamp: int64(ts), Volume: vol})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return points, nil
}

func (s *AnalyticsService) GetPriceHistory(ctx context.Context, poolID string) ([]dto.PricePoint, error) {
	conn := s.ch.Conn()
	rows, err := conn.Query(ctx, dbquery.SelectPriceHistory, poolID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	points := make([]dto.PricePoint, 0)
	for rows.Next() {
		var ts uint64
		var price float64
		if err := rows.Scan(&ts, &price); err != nil {
			return nil, err
		}
		points = append(points, dto.PricePoint{Timestamp: int64(ts), Price: price})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return points, nil
}

func (s *AnalyticsService) GetPairDetail(ctx context.Context, poolID string) (*dto.PairAnalytics, error) {
	pairs, err := s.getPairAnalytics(ctx, poolID, 86400) // Default 24h
	if err != nil {
		return nil, err
	}
	for _, p := range pairs {
		if p.PoolID == poolID {
			return &p, nil
		}
	}
	return &dto.PairAnalytics{PoolID: poolID}, nil
}

func (s *AnalyticsService) GetStakingAPR(ctx context.Context) (*dto.StakingAPRResponse, error) {
	return &dto.StakingAPRResponse{}, nil
}

func (s *AnalyticsService) GetOHLCV(ctx context.Context, poolID string, tokenAddress string, intervalSeconds int, lookbackSeconds int) ([]dto.OHLCVBar, error) {
	var token0, token1 string
	_ = s.ch.Conn().QueryRow(ctx, "SELECT token0, token1 FROM pairs FINAL WHERE pool_id = ?", strings.ToLower(poolID)).Scan(&token0, &token1)

	useToken1 := tokenAddress != "" && strings.ToLower(tokenAddress) == strings.ToLower(token1)

	conn := s.ch.Conn()
	rows, err := conn.Query(ctx, dbquery.SelectOHLCV,
		intervalSeconds, useToken1, useToken1, useToken1, useToken1, poolID, lookbackSeconds, intervalSeconds,
		intervalSeconds, poolID, lookbackSeconds, intervalSeconds,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	bars := make([]dto.OHLCVBar, 0)
	for rows.Next() {
		var ts uint64
		var open, high, low, close, volume float64
		if err := rows.Scan(&ts, &open, &high, &low, &close, &volume); err != nil {
			return nil, err
		}
		bars = append(bars, dto.OHLCVBar{
			Timestamp: int64(ts),
			Open:      open,
			High:      high,
			Low:       low,
			Close:     close,
			Volume:    volume,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return bars, nil
}

func (s *AnalyticsService) GetTokenPrices(ctx context.Context, intervalSeconds int) ([]dto.TokenPrice, error) {
	conn := s.ch.Conn()

	// Build reserves map from pairs
	pairRows, err := conn.Query(ctx, dbquery.SelectPairs)
	if err != nil {
		return nil, err
	}

	type pairRaw struct {
		poolID     string
		t0, t1     string
		dec0, dec1 uint8
		r0, r1     string
	}
	var rawPairs []pairRaw
	for pairRows.Next() {
		var p pairRaw
		var s0, s1, l0, l1 string
		var tvl, vol24hUSD, vol24hWETH, fee float64
		if err := pairRows.Scan(&p.poolID, &p.t0, &p.t1, &s0, &s1, &l0, &l1, &p.r0, &p.r1, &tvl, &p.dec0, &p.dec1, &vol24hUSD, &vol24hWETH, &fee); err != nil {
			return nil, err
		}
		_ = vol24hUSD
		_ = vol24hWETH
		rawPairs = append(rawPairs, p)
	}
	pairRows.Close()

	reserves := make(map[string]ReserveInfo)
	for _, p := range rawPairs {
		r0, _ := new(big.Int).SetString(p.r0, 10)
		r1, _ := new(big.Int).SetString(p.r1, 10)
		if r0 == nil {
			r0 = big.NewInt(0)
		}
		if r1 == nil {
			r1 = big.NewInt(0)
		}
		reserves[strings.ToLower(p.poolID)] = ReserveInfo{Reserve0: r0, Reserve1: r1, Decimals0: p.dec0, Decimals1: p.dec1}
	}

	tokenPrices, pricingMode, _ := s.pricer.ResolveTokenPrices(ctx, reserves)
	_ = pricingMode

	tokenPricesUSD := make(map[string]float64)
	tokenPricesETH := make(map[string]float64)

	if pricingMode == "usd" {
		for addr, price := range tokenPrices {
			tokenPricesUSD[addr] = price
		}
		wethAddr := strings.ToLower(s.pricer.GetWETHAddress(ctx))
		ethPriceUSD := tokenPricesUSD[wethAddr]

		if ethPriceUSD > 0 {
			for addr, usd := range tokenPricesUSD {
				tokenPricesETH[addr] = usd / ethPriceUSD
			}
		}
	} else if pricingMode == "weth" {
		for addr, price := range tokenPrices {
			tokenPricesETH[addr] = price
			tokenPricesUSD[addr] = price
		}
	}

	// Get token metadata (deduplicated by lowercase address)
	tokenRows, err := conn.Query(ctx, "SELECT lower(address), argMax(symbol, address), argMax(name, address), argMax(decimals, address), argMax(logo_url, address) FROM tokens FINAL GROUP BY lower(address)")
	if err != nil {
		return nil, err
	}
	defer tokenRows.Close()

	tokens := make([]dto.TokenPrice, 0)
	for tokenRows.Next() {
		var t dto.TokenPrice
		if err := tokenRows.Scan(&t.Address, &t.Symbol, &t.Name, &t.Decimals, &t.LogoURL); err != nil {
			continue
		}
		addr := strings.ToLower(t.Address)
		if usd, ok := tokenPricesUSD[addr]; ok {
			t.PriceUSD = usd
		}
		if eth, ok := tokenPricesETH[addr]; ok {
			t.PriceETH = eth
		}
		tokens = append(tokens, t)
	}

	// Compute price change per token dynamically
	for i, t := range tokens {
		queryStr := `
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

		changeRows, err := conn.Query(ctx, queryStr,
			t.Address, intervalSeconds,
			t.Address, intervalSeconds,
			t.Address, intervalSeconds,
			t.Address, intervalSeconds,
		)
		if err != nil {
			continue
		}
		if changeRows.Next() {
			var currentPrice, oldPrice float64
			if err := changeRows.Scan(&currentPrice, &oldPrice); err == nil && oldPrice > 0 {
				tokens[i].PriceChange24h = ((currentPrice - oldPrice) / oldPrice) * 100
			}
		}
		changeRows.Close()
	}

	return tokens, nil
}
