package service

import (
	"context"
	"math"
	"math/big"
	"strings"
	"sync"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/config"
	"defi-amm-dex/pkg/logger"
)

type Pricer struct {
	cfg            *config.Config
	ch             *clickhouse.Client
	mu             sync.RWMutex
	stablePoolID   string
	stableIsToken0 bool
}

func NewPricer(cfg *config.Config, ch *clickhouse.Client) *Pricer {
	return &Pricer{cfg: cfg, ch: ch}
}

type PairPrices struct {
	Token0Price float64
	Token1Price float64
}

type ReserveInfo struct {
	Reserve0  *big.Int
	Reserve1  *big.Int
	Decimals0 uint8
	Decimals1 uint8
}

type poolTokens struct {
	PoolID string
	Token0 string
	Token1 string
}

func reserveToPrice(r0, r1 *big.Int, dec0, dec1 uint8) float64 {
	if r0 == nil || r1 == nil || r0.Sign() == 0 {
		return 0
	}
	r0Adj, _ := new(big.Float).Quo(
		new(big.Float).SetInt(r0),
		new(big.Float).SetFloat64(math.Pow(10, float64(dec0))),
	).Float64()
	r1Adj, _ := new(big.Float).Quo(
		new(big.Float).SetInt(r1),
		new(big.Float).SetFloat64(math.Pow(10, float64(dec1))),
	).Float64()
	if r0Adj == 0 {
		return 0
	}
	return r1Adj / r0Adj
}

func (p *Pricer) loadAllPools(ctx context.Context) []poolTokens {
	conn := p.ch.Conn()
	rows, err := conn.Query(ctx, "SELECT pool_id, token0, token1 FROM pairs FINAL")
	if err != nil {
		return nil
	}
	defer rows.Close()

	var pairs []poolTokens
	for rows.Next() {
		var pt poolTokens
		if err := rows.Scan(&pt.PoolID, &pt.Token0, &pt.Token1); err != nil {
			continue
		}
		pt.PoolID = strings.ToLower(pt.PoolID)
		pt.Token0 = strings.ToLower(pt.Token0)
		pt.Token1 = strings.ToLower(pt.Token1)
		pairs = append(pairs, pt)
	}
	if err := rows.Err(); err != nil {
		return nil
	}
	return pairs
}

// ResolveAllPairs returns per-pool token prices in the reference currency
// and a pricing mode string: "usd", "weth", or "" (no pricing available).
func (p *Pricer) ResolveTokenPrices(ctx context.Context, reserves map[string]ReserveInfo) (map[string]float64, string, []poolTokens) {
	stableAddr := strings.ToLower(p.cfg.StablecoinAddress)
	wethAddress := p.GetWETHAddress(ctx)

	if stableAddr == "" {
		logger.Ctx(ctx).Warn("No stablecoin address configured")
	}

	p.mu.RLock()
	stablePoolID := p.stablePoolID
	stableIsToken0 := p.stableIsToken0
	p.mu.RUnlock()

	if stableAddr != "" && stablePoolID == "" {
		poolID, isToken0 := p.findStablePool(ctx, stableAddr)
		if poolID != "" {
			p.mu.Lock()
			p.stablePoolID = poolID
			p.stableIsToken0 = isToken0
			p.mu.Unlock()
			stablePoolID = poolID
			stableIsToken0 = isToken0
		}
	}

	allPools := p.loadAllPools(ctx)
	if len(allPools) == 0 {
		return nil, "", nil
	}

	type neighbor struct {
		poolID   string
		isToken0 bool
		reserve  ReserveInfo
	}
	adj := make(map[string][]neighbor)
	poolTokenMap := make(map[string]struct{ t0, t1 string })
	for _, pt := range allPools {
		if si, ok := reserves[pt.PoolID]; ok {
			adj[pt.Token0] = append(adj[pt.Token0], neighbor{poolID: pt.PoolID, isToken0: true, reserve: si})
			adj[pt.Token1] = append(adj[pt.Token1], neighbor{poolID: pt.PoolID, isToken0: false, reserve: si})
			poolTokenMap[pt.PoolID] = struct{ t0, t1 string }{t0: pt.Token0, t1: pt.Token1}
		}
	}

	tokenPrice := make(map[string]float64)
	queue := []string{}
	visited := make(map[string]bool)
	mode := ""

	// Try USD pricing first via USDC/ETH pool
	if stablePoolID != "" {
		if si, ok := reserves[stablePoolID]; ok {
			price := reserveToPrice(si.Reserve0, si.Reserve1, si.Decimals0, si.Decimals1)
			var wethPrice float64
			if stableIsToken0 {
				if price > 0 {
					wethPrice = 1.0 / price
				}
			} else {
				wethPrice = price
			}
			if wethPrice > 0 {
				tokenPrice[stableAddr] = 1.0
				tokenPrice[wethAddress] = wethPrice
				queue = append(queue, stableAddr, wethAddress)
				mode = "usd"
			}
		}
	}

	// Fallback to ETH pricing if no USD
	if mode == "" && len(adj[wethAddress]) > 0 {
		tokenPrice[wethAddress] = 1.0
		queue = append(queue, wethAddress)
		mode = "weth"
		logger.Ctx(ctx).Info("No USD pricing available, using WETH as reference")
	}

	if mode == "" {
		logger.Ctx(ctx).Warn("No USD or ETH pools found — all prices will be $0")
		return nil, "", allPools
	}

	// BFS to propagate prices
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if visited[current] {
			continue
		}
		visited[current] = true

		currentPrice, ok := tokenPrice[current]
		if !ok || currentPrice <= 0 {
			continue
		}

		for _, n := range adj[current] {
			si := n.reserve
			r0Adj, _ := new(big.Float).Quo(
				new(big.Float).SetInt(si.Reserve0),
				new(big.Float).SetFloat64(math.Pow(10, float64(si.Decimals0))),
			).Float64()
			r1Adj, _ := new(big.Float).Quo(
				new(big.Float).SetInt(si.Reserve1),
				new(big.Float).SetFloat64(math.Pow(10, float64(si.Decimals1))),
			).Float64()
			if r0Adj <= 0 || r1Adj <= 0 {
				continue
			}

			var pairedPrice float64
			var pairedToken string
			if n.isToken0 {
				pairedPrice = currentPrice * (r0Adj / r1Adj)
				pairedToken = poolTokenMap[n.poolID].t1
			} else {
				pairedPrice = currentPrice * (r1Adj / r0Adj)
				pairedToken = poolTokenMap[n.poolID].t0
			}

			if pairedPrice > 0 {
				if existing, ok := tokenPrice[pairedToken]; !ok || existing <= 0 {
					tokenPrice[pairedToken] = pairedPrice
					queue = append(queue, pairedToken)
				}
			}
		}
	}

	return tokenPrice, mode, allPools
}

func (p *Pricer) ResolveAllPairs(ctx context.Context, reserves map[string]ReserveInfo) (map[string]PairPrices, string, float64) {
	tokenPrice, mode, allPools := p.ResolveTokenPrices(ctx, reserves)
	if mode == "" || len(tokenPrice) == 0 || allPools == nil {
		return make(map[string]PairPrices), mode, 0
	}

	result := make(map[string]PairPrices)
	for _, pt := range allPools {
		t0Price := tokenPrice[pt.Token0]
		t1Price := tokenPrice[pt.Token1]
		if t0Price < 0 {
			t0Price = 0
		}
		if t1Price < 0 {
			t1Price = 0
		}
		result[pt.PoolID] = PairPrices{
			Token0Price: t0Price,
			Token1Price: t1Price,
		}
	}

	wethAddr := p.GetWETHAddress(ctx)
	ethPriceUSD := tokenPrice[wethAddr]

	return result, mode, ethPriceUSD
}

// GetPricingMode returns the current pricing mode without BFS.
func (p *Pricer) GetPricingMode(ctx context.Context) string {
	stableAddr := strings.ToLower(p.cfg.StablecoinAddress)
	wethAddress := p.GetWETHAddress(ctx)

	if stableAddr != "" {
		poolID, _ := p.findStablePool(ctx, stableAddr)
		if poolID != "" {
			return "usd"
		}
	}

	// Check if WETH has any pair
	conn := p.ch.Conn()
	rows, err := conn.Query(ctx, "SELECT 1 FROM pairs FINAL WHERE token0 = ? OR token1 = ?", wethAddress, wethAddress)
	if err != nil {
		return ""
	}
	defer rows.Close()
	if rows.Next() {
		return "weth"
	}

	return ""
}

func (p *Pricer) findStablePool(ctx context.Context, stableAddr string) (poolID string, isToken0 bool) {
	conn := p.ch.Conn()
	wethAddr := p.GetWETHAddress(ctx)
	rows, err := conn.Query(ctx,
		"SELECT pool_id, token0, token1 FROM pairs FINAL WHERE (token0 = ? AND token1 = ?) OR (token1 = ? AND token0 = ?)",
		stableAddr, wethAddr, stableAddr, wethAddr)
	if err != nil {
		return "", false
	}
	defer rows.Close()

	for rows.Next() {
		var poolID, t0, t1 string
		if err := rows.Scan(&poolID, &t0, &t1); err != nil {
			continue
		}
		return poolID, strings.ToLower(t0) == stableAddr
	}
	return "", false
}

func (p *Pricer) getTokenDecimals(ctx context.Context, tokenAddr string) uint8 {
	conn := p.ch.Conn()
	rows, err := conn.Query(ctx, "SELECT decimals FROM tokens FINAL WHERE address = ?", strings.ToLower(tokenAddr))
	if err != nil {
		return 18
	}
	defer rows.Close()

	if rows.Next() {
		var decimals uint8
		if err := rows.Scan(&decimals); err == nil {
			return decimals
		}
	}
	return 18
}

func (p *Pricer) GetWETHAddress(ctx context.Context) string {
	return strings.ToLower(p.cfg.ContractWETH)
}

func (p *Pricer) GetStablecoinAddress(ctx context.Context) string {
	return strings.ToLower(p.cfg.StablecoinAddress)
}
