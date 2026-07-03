package service

import (
	"context"
	"math"
	"math/big"
	"strings"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/config"
	shareddb "defi-amm-dex/internal/dbquery"
	shareddto "defi-amm-dex/internal/dto"
	"defi-amm-dex/internal/v2/dbquery"
	"defi-amm-dex/internal/v2/dto"
)

type DEXServicer interface {
	ListPairs(ctx context.Context) ([]dto.PairResponse, error)
	ListTokens(ctx context.Context) ([]shareddto.TokenResponse, error)
	ListTokensPaginated(ctx context.Context, search string, limit, offset int) ([]shareddto.TokenResponse, error)
}

type DEXService struct {
	ch         *clickhouse.Client
	cfg        *config.Config
	pricingPricer *Pricer
}

func NewDEXService(ch *clickhouse.Client, cfg *config.Config, pricer *Pricer) *DEXService {
	return &DEXService{ch: ch, cfg: cfg, pricingPricer: pricer}
}

func (s *DEXService) getEthPrice(ctx context.Context) float64 {
	wethAddr := s.pricingPricer.GetWETHAddress(ctx)
	reserves := make(map[string]ReserveInfo)
	prices, _, _ := s.pricingPricer.ResolveTokenPrices(ctx, reserves)
	return prices[wethAddr]
}

func (s *DEXService) ListPairs(ctx context.Context) ([]dto.PairResponse, error) {
	conn := s.ch.Conn()

	rows, err := conn.Query(ctx, dbquery.SelectPairs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	pricingMode := s.pricingPricer.GetPricingMode(ctx)

	type scannedPair struct {
		address, token0, token1, symbol0, symbol1, logo0, logo1 string
		reserve0Str, reserve1Str                                 string
		storedTVL, vol24hUSD, vol24hWETH, fee                   float64
		dec0, dec1                                               uint8
	}

	var scanned []scannedPair
	for rows.Next() {
		var sp scannedPair
		if err := rows.Scan(
			&sp.address, &sp.token0, &sp.token1, &sp.symbol0, &sp.symbol1, &sp.logo0, &sp.logo1,
			&sp.reserve0Str, &sp.reserve1Str, &sp.storedTVL, &sp.dec0, &sp.dec1,
			&sp.vol24hUSD, &sp.vol24hWETH, &sp.fee,
		); err != nil {
			return nil, err
		}
		scanned = append(scanned, sp)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Build reserves map for live BFS pricing
	reserves := make(map[string]ReserveInfo)
	for _, sp := range scanned {
		r0, ok := new(big.Int).SetString(sp.reserve0Str, 10)
		if !ok {
			r0 = big.NewInt(0)
		}
		r1, ok := new(big.Int).SetString(sp.reserve1Str, 10)
		if !ok {
			r1 = big.NewInt(0)
		}
		reserves[strings.ToLower(sp.address)] = ReserveInfo{
			Reserve0:  r0,
			Reserve1:  r1,
			Decimals0: sp.dec0,
			Decimals1: sp.dec1,
		}
	}

	prices, _, ethPriceUSD := s.pricingPricer.ResolveAllPairs(ctx, reserves)

	stableAddr := strings.ToLower(s.cfg.StablecoinAddress)
	wethAddr := strings.ToLower(s.cfg.ContractWETH)

	pairs := make([]dto.PairResponse, 0, len(scanned))
	for _, sp := range scanned {
		poolKey := strings.ToLower(sp.address)
		pp, hasPrice := prices[poolKey]

		t0 := strings.ToLower(sp.token0)
		t1 := strings.ToLower(sp.token1)
		isBase0 := t0 == stableAddr || t0 == wethAddr
		isBase1 := t1 == stableAddr || t1 == wethAddr

		// Compute human-readable reserve amounts
		r0 := reserves[poolKey].Reserve0
		r1 := reserves[poolKey].Reserve1
		pR0, _ := new(big.Float).SetInt(r0).Float64()
		pR1, _ := new(big.Float).SetInt(r1).Float64()
		u0 := pR0 / math.Pow(10, float64(sp.dec0))
		u1 := pR1 / math.Pow(10, float64(sp.dec1))

		// Recompute TVL from live prices (avoids stale WETH-mode stored value)
		tvl := sp.storedTVL
		if hasPrice && (pp.Token0Price > 0 || pp.Token1Price > 0) {
			if isBase0 && !isBase1 && pp.Token0Price > 0 {
				tvl = 2 * u0 * pp.Token0Price
			} else if isBase1 && !isBase0 && pp.Token1Price > 0 {
				tvl = 2 * u1 * pp.Token1Price
			} else {
				tvl = u0*pp.Token0Price + u1*pp.Token1Price
			}
		}

		// Convert split volumes to current pricing unit
		var vol24h float64
		if pricingMode == "usd" && ethPriceUSD > 0 {
			vol24h = sp.vol24hUSD + sp.vol24hWETH*ethPriceUSD
		} else {
			vol24h = sp.vol24hWETH + sp.vol24hUSD
		}

		pairs = append(pairs, dto.PairResponse{
			Address:     sp.address,
			Token0:      sp.token0,
			Token1:      sp.token1,
			Symbol0:     sp.symbol0,
			Symbol1:     sp.symbol1,
			Logo0:       sp.logo0,
			Logo1:       sp.logo1,
			Reserve0:    sp.reserve0Str,
			Reserve1:    sp.reserve1Str,
			Decimals0:   sp.dec0,
			Decimals1:   sp.dec1,
			TVL:         tvl,
			Volume24h:   vol24h,
			Fee:         sp.fee,
			PricingMode: pricingMode,
		})
	}

	return pairs, nil
}

func (s *DEXService) ListTokens(ctx context.Context) ([]shareddto.TokenResponse, error) {
	conn := s.ch.Conn()

	rows, err := conn.Query(ctx, shareddb.SelectTokens)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := make([]shareddto.TokenResponse, 0)
	for rows.Next() {
		var address, symbol, name, logoURL string
		var decimals uint8

		if err := rows.Scan(&address, &symbol, &name, &decimals, &logoURL); err != nil {
			return nil, err
		}

		tokens = append(tokens, shareddto.TokenResponse{
			Address:  address,
			Symbol:   symbol,
			Name:     name,
			Decimals: decimals,
			LogoURL:  logoURL,
		})
	}

	return tokens, nil
}

func (s *DEXService) ListTokensPaginated(ctx context.Context, search string, limit, offset int) ([]shareddto.TokenResponse, error) {
	conn := s.ch.Conn()

	if limit <= 0 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	searchParam := ""
	if search != "" {
		searchParam = "%" + strings.ToLower(search) + "%"
	}

	rows, err := conn.Query(ctx, shareddb.SelectTokensPaginated,
		strings.ToLower(search),
		searchParam,
		searchParam,
		strings.ToLower(search),
		limit,
		offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := make([]shareddto.TokenResponse, 0)
	for rows.Next() {
		var address, symbol, name, logoURL string
		var decimals uint8

		if err := rows.Scan(&address, &symbol, &name, &decimals, &logoURL); err != nil {
			return nil, err
		}

		tokens = append(tokens, shareddto.TokenResponse{
			Address:  address,
			Symbol:   symbol,
			Name:     name,
			Decimals: decimals,
			LogoURL:  logoURL,
		})
	}

	return tokens, nil
}
