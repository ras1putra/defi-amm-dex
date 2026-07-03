package indexer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"go.uber.org/zap"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/config"
	shareddb "defi-amm-dex/internal/dbquery"
	"defi-amm-dex/internal/v2/dbquery"
	"defi-amm-dex/internal/v2/service"
	"defi-amm-dex/pkg/logger"
	"defi-amm-dex/pkg/utils"
)

var (
	topicLiquidityAdded    = crypto.Keccak256Hash([]byte("LiquidityAdded(address,uint256,uint256,uint256)"))
	topicLiquidityRemoved  = crypto.Keccak256Hash([]byte("LiquidityRemoved(address,uint256,uint256,uint256)"))
	topicSwapped           = crypto.Keccak256Hash([]byte("Swapped(address,address,uint256,uint256)"))
	topicDeposited         = crypto.Keccak256Hash([]byte("Deposited(address,uint256,uint256)"))
	topicWithdrawn         = crypto.Keccak256Hash([]byte("Withdrawn(address,uint256,uint256)"))
	topicRewardsClaimed    = crypto.Keccak256Hash([]byte("RewardsClaimed(address,uint256,uint256)"))
	poolInfoSelector       = crypto.Keccak256([]byte("poolInfo()"))[:4]
	allPairsLengthSelector = crypto.Keccak256([]byte("allPairsLength()"))[:4]
	allPairsSelector       = crypto.Keccak256([]byte("allPairs(uint256)"))[:4]

	topicProposalCreated  = crypto.Keccak256Hash([]byte("ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],string,string,uint256,uint256,uint256,uint256)"))
	topicVoteCast         = crypto.Keccak256Hash([]byte("VoteCast(uint256,address,uint8,uint256)"))
	topicProposalExecuted = crypto.Keccak256Hash([]byte("ProposalExecuted(uint256)"))
	topicProposalCanceled = crypto.Keccak256Hash([]byte("ProposalCanceled(uint256)"))
	topicDelegateChanged  = crypto.Keccak256Hash([]byte("DelegateChanged(address,address,address)"))
)

type PairInfo struct {
	Token0    string
	Token1    string
	Fee       float64
	Decimals0 uint8
	Decimals1 uint8
	Reserve0  *big.Int
	Reserve1  *big.Int
}

type Indexer struct {
	cfg               *config.Config
	clickhouse        *clickhouse.Client
	pricer            *service.Pricer
	mu                sync.RWMutex
	knownPairs        map[string]PairInfo       // pool_id -> info
	v2amms            map[common.Address]bool    // set of V2AMM contract addresses
	governorTokenAddr common.Address             // resolved dynamically
	httpClient        *http.Client               // reused for broadcast calls
}

func New(cfg *config.Config, ch *clickhouse.Client) *Indexer {
	return &Indexer{
		cfg:        cfg,
		clickhouse: ch,
		pricer:     service.NewPricer(cfg, ch),
		knownPairs: make(map[string]PairInfo),
		v2amms:     make(map[common.Address]bool),
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (idx *Indexer) Start(ctx context.Context) error {
	if idx.cfg.ContractV2AMM == "" {
		logger.Ctx(ctx).Warn("No CONTRACT_V2_AMM (Factory) configured, indexer idle")
		<-ctx.Done()
		return nil
	}

	factoryAddr := common.HexToAddress(idx.cfg.ContractV2AMM)

	logger.Ctx(ctx).Info("Connecting to EVM RPC node", zap.String("url", idx.cfg.NodeRPCURL))
	client, err := ethclient.Dial(idx.cfg.NodeRPCURL)
	if err != nil {
		return fmt.Errorf("failed to dial EVM RPC: %w", err)
	}
	defer client.Close()

	if idx.cfg.ContractGovernor != "" {
		govAddr := common.HexToAddress(idx.cfg.ContractGovernor)
		tokenResult, err := client.CallContract(ctx, ethereum.CallMsg{
			To:   &govAddr,
			Data: crypto.Keccak256([]byte("token()"))[:4],
		}, nil)
		if err == nil && len(tokenResult) >= 32 {
			idx.mu.Lock()
			idx.governorTokenAddr = common.BytesToAddress(tokenResult[12:32])
			idx.mu.Unlock()
			logger.Ctx(ctx).Info("Resolved governor token address dynamically", zap.String("token", idx.governorTokenAddr.Hex()))
		} else {
			logger.Ctx(ctx).Warn("Failed to resolve governor token address dynamically", zap.Error(err))
		}
	}

	// Also load any existing pairs from DB
	if err := idx.loadPairsFromDB(ctx); err != nil {
		logger.Ctx(ctx).Warn("Failed to load existing pools from ClickHouse", zap.Error(err))
	} else {
		idx.mu.RLock()
		pairsCopy := make(map[string]PairInfo, len(idx.knownPairs))
		for pid, info := range idx.knownPairs {
			pairsCopy[pid] = info
		}
		idx.mu.RUnlock()

		for pid, info := range pairsCopy {
			idx.updateReserves(ctx, pid, info.Token0, info.Token1, info.Reserve0, info.Reserve1, info.Decimals0, info.Decimals1, info.Fee, nil)
		}
	}

	var lastProcessedBlock uint64

	currentBlock, err := client.BlockNumber(ctx)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to get current block number", zap.Error(err))
		lastProcessedBlock = 0
	} else {
		latestIndexed := idx.getLatestIndexedBlock(ctx)
		if latestIndexed > 0 {
			lastProcessedBlock = latestIndexed
			logger.Ctx(ctx).Info("Resuming indexing from latest indexed block", zap.Uint64("block", lastProcessedBlock))
		} else {
			if idx.cfg.IsDev() {
				lastProcessedBlock = 0
				logger.Ctx(ctx).Info("No indexed blocks found. Dev mode: starting indexing from block 0")
			} else {
				lastProcessedBlock = currentBlock
				logger.Ctx(ctx).Info("No indexed blocks found. Production mode: starting indexing from current block", zap.Uint64("block", lastProcessedBlock))
			}
		}
	}

	// Discover pairs from on-chain Factory contract
	if err := idx.discoverPairsFromFactory(ctx, client, factoryAddr, lastProcessedBlock); err != nil {
		logger.Ctx(ctx).Warn("Failed to discover pairs from factory on-chain", zap.Error(err))
	}

	logger.Ctx(ctx).Info("Indexer loop starting",
		zap.Int("interval_seconds", idx.cfg.IndexerSyncInterval),
		zap.Int("v2amms", len(idx.v2amms)),
	)

	ticker := time.NewTicker(time.Duration(idx.cfg.IndexerSyncInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			current, err := client.BlockNumber(ctx)
			if err != nil {
				logger.Ctx(ctx).Error("Failed to get block number during poll", zap.Error(err))
				continue
			}

			if current > lastProcessedBlock {
				fromBlock := lastProcessedBlock + 1
				toBlock := current

				// Discover any new pools since last check
				if err := idx.discoverPairsFromFactory(ctx, client, factoryAddr, lastProcessedBlock); err != nil {
					logger.Ctx(ctx).Warn("Failed to discover pairs from factory during poll", zap.Error(err))
				}

				if err := idx.indexLiquidityEvents(ctx, client, fromBlock, toBlock); err != nil {
					logger.Ctx(ctx).Error("Error indexing liquidity events", zap.Uint64("from", fromBlock), zap.Uint64("to", toBlock), zap.Error(err))
				}

				if err := idx.indexSwapEvents(ctx, client, fromBlock, toBlock); err != nil {
					logger.Ctx(ctx).Error("Error indexing swap events", zap.Uint64("from", fromBlock), zap.Uint64("to", toBlock), zap.Error(err))
				}

				if err := idx.indexStakingEvents(ctx, client, fromBlock, toBlock); err != nil {
					logger.Ctx(ctx).Error("Error indexing staking events", zap.Uint64("from", fromBlock), zap.Uint64("to", toBlock), zap.Error(err))
				}

				if err := idx.indexGovernorEvents(ctx, client, fromBlock, toBlock); err != nil {
					logger.Ctx(ctx).Error("Error indexing governor events", zap.Uint64("from", fromBlock), zap.Uint64("to", toBlock), zap.Error(err))
				}

				idx.mu.RLock()
				tokenAddr := idx.governorTokenAddr
				idx.mu.RUnlock()

				if tokenAddr != (common.Address{}) {
					if err := idx.indexDelegateEvents(ctx, client, tokenAddr, fromBlock, toBlock); err != nil {
						logger.Ctx(ctx).Error("Error indexing delegate events", zap.Uint64("from", fromBlock), zap.Uint64("to", toBlock), zap.Error(err))
					}
				}

				lastProcessedBlock = toBlock
			}

		case <-ctx.Done():
			logger.Ctx(ctx).Info("Stopping indexer loop")
			return nil
		}
	}
}

func (idx *Indexer) discoverPairsFromFactory(ctx context.Context, client *ethclient.Client, factoryAddr common.Address, atBlock uint64) error {
	result, err := client.CallContract(ctx, ethereum.CallMsg{
		To:   &factoryAddr,
		Data: allPairsLengthSelector,
	}, nil)
	if err != nil {
		return fmt.Errorf("failed to call allPairsLength(): %w", err)
	}

	if len(result) < 32 {
		return fmt.Errorf("invalid allPairsLength() response length: %d", len(result))
	}

	totalPairs := new(big.Int).SetBytes(result[0:32]).Int64()

	for i := int64(0); i < totalPairs; i++ {
		argBytes := common.LeftPadBytes(big.NewInt(i).Bytes(), 32)
		data := append(allPairsSelector, argBytes...)

		pairResult, err := client.CallContract(ctx, ethereum.CallMsg{
			To:   &factoryAddr,
			Data: data,
		}, nil)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to call allPairs()", zap.Int64("index", i), zap.Error(err))
			continue
		}

		if len(pairResult) < 32 {
			logger.Ctx(ctx).Error("Invalid allPairs() response length", zap.Int64("index", i))
			continue
		}

		v2ammAddr := common.BytesToAddress(pairResult[12:32])
		poolID := strings.ToLower(v2ammAddr.Hex())

		idx.mu.RLock()
		_, exists := idx.knownPairs[poolID]
		idx.mu.RUnlock()

		idx.mu.Lock()
		idx.v2amms[v2ammAddr] = true
		idx.mu.Unlock()

		if exists {
			continue
		}

		logger.Ctx(ctx).Info("Discovered new pool from factory", zap.String("address", poolID), zap.Int64("index", i))

		poolInfoResult, err := client.CallContract(ctx, ethereum.CallMsg{
			To:   &v2ammAddr,
			Data: poolInfoSelector,
		}, nil)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to call poolInfo() on V2AMM pool", zap.String("address", poolID), zap.Error(err))
			continue
		}

		if len(poolInfoResult) < 192 {
			logger.Ctx(ctx).Error("Invalid poolInfo() response length", zap.String("address", poolID), zap.Int("len", len(poolInfoResult)))
			continue
		}

		token0 := common.BytesToAddress(poolInfoResult[0:32]).Hex()
		token1 := common.BytesToAddress(poolInfoResult[32:64]).Hex()

		var reserve0, reserve1 *big.Int
		if atBlock > 0 {
			poolInfoHistorical, err := client.CallContract(ctx, ethereum.CallMsg{
				To:   &v2ammAddr,
				Data: poolInfoSelector,
			}, new(big.Int).SetUint64(atBlock))
			if err != nil || len(poolInfoHistorical) < 192 {
				reserve0 = big.NewInt(0)
				reserve1 = big.NewInt(0)
			} else {
				reserve0 = new(big.Int).SetBytes(poolInfoHistorical[128:160])
				reserve1 = new(big.Int).SetBytes(poolInfoHistorical[160:192])
			}
		} else {
			reserve0 = big.NewInt(0)
			reserve1 = big.NewInt(0)
		}

		logger.Ctx(ctx).Info("Discovered pool pair info",
			zap.String("pool_id", poolID),
			zap.String("token0", token0),
			zap.String("token1", token1),
			zap.String("reserve0", reserve0.String()),
			zap.String("reserve1", reserve1.String()),
		)

		dec0 := idx.registerTokenIfMissing(ctx, client, token0)
		dec1 := idx.registerTokenIfMissing(ctx, client, token1)

		conn := idx.clickhouse.Conn()
		err = conn.Exec(ctx, dbquery.InsertPairInitial,
			poolID,
			strings.ToLower(token0),
			strings.ToLower(token1),
			0.3,
		)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to insert pair into ClickHouse", zap.Error(err))
		}

		idx.mu.Lock()
		idx.knownPairs[poolID] = PairInfo{
			Token0:    strings.ToLower(token0),
			Token1:    strings.ToLower(token1),
			Fee:       0.3,
			Decimals0: dec0,
			Decimals1: dec1,
			Reserve0:  reserve0,
			Reserve1:  reserve1,
		}
		idx.mu.Unlock()

		if reserve0.Sign() > 0 || reserve1.Sign() > 0 {
			idx.updateReserves(ctx, poolID, token0, token1, reserve0, reserve1, dec0, dec1, 0.3, nil)
		}

		idx.writePriceSnapshot(ctx, poolID, nil)
	}

	return nil
}

func (idx *Indexer) loadPairsFromDB(ctx context.Context) error {
	conn := idx.clickhouse.Conn()
	rows, err := conn.Query(ctx, dbquery.SelectPairsList)
	if err != nil {
		return err
	}
	defer rows.Close()

	idx.mu.Lock()
	for rows.Next() {
		var poolId, token0, token1 string
		var fee float64
		var dec0, dec1 uint8
		var reserve0Str, reserve1Str string
		if err := rows.Scan(&poolId, &token0, &token1, &fee, &dec0, &dec1, &reserve0Str, &reserve1Str); err != nil {
			idx.mu.Unlock()
			return err
		}

		r0, ok := new(big.Int).SetString(reserve0Str, 10)
		if !ok {
			r0 = big.NewInt(0)
		}
		r1, ok := new(big.Int).SetString(reserve1Str, 10)
		if !ok {
			r1 = big.NewInt(0)
		}

		poolIDLow := strings.ToLower(poolId)
		idx.knownPairs[poolIDLow] = PairInfo{
			Token0:    strings.ToLower(token0),
			Token1:    strings.ToLower(token1),
			Fee:       fee,
			Decimals0: dec0,
			Decimals1: dec1,
			Reserve0:  r0,
			Reserve1:  r1,
		}

		v2ammAddr := common.HexToAddress(poolIDLow)
		idx.v2amms[v2ammAddr] = true
	}
	idx.mu.Unlock()

	logger.Ctx(ctx).Info("Loaded existing pools from database", zap.Int("count", len(idx.knownPairs)))
	return nil
}

func (idx *Indexer) v2ammAddresses() []common.Address {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	addrs := make([]common.Address, 0, len(idx.v2amms))
	for addr := range idx.v2amms {
		addrs = append(addrs, addr)
	}
	return addrs
}

func (idx *Indexer) indexLiquidityEvents(ctx context.Context, client *ethclient.Client, fromBlock, toBlock uint64) error {
	if len(idx.v2amms) == 0 {
		return nil
	}

	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
		Addresses: idx.v2ammAddresses(),
		Topics:    [][]common.Hash{{topicLiquidityAdded, topicLiquidityRemoved}},
	}

	logs, err := client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	conn := idx.clickhouse.Conn()

	for _, log := range logs {
		poolId := strings.ToLower(log.Address.Hex())

		idx.mu.RLock()
		poolInfo, isKnown := idx.knownPairs[poolId]
		idx.mu.RUnlock()

		if !isKnown {
			continue
		}

		if len(log.Data) < 96 {
			continue
		}

		sender := common.BytesToAddress(log.Topics[1].Bytes()).Hex()

		// Fetch tx.origin (the EOA that initiated the tx)
		txOrigin := ""
		tx, _, err := client.TransactionByHash(ctx, log.TxHash)
		if err == nil {
			signer := types.LatestSignerForChainID(tx.ChainId())
			if origin, originErr := types.Sender(signer, tx); originErr == nil {
				txOrigin = strings.ToLower(origin.Hex())
			}
		}

		amount0 := new(big.Int).SetBytes(log.Data[0:32])
		amount1 := new(big.Int).SetBytes(log.Data[32:64])
		lpAmount := new(big.Int).SetBytes(log.Data[64:96])

		isAdd := log.Topics[0] == topicLiquidityAdded

		var newR0, newR1 *big.Int
		if isAdd {
			newR0 = new(big.Int).Add(poolInfo.Reserve0, amount0)
			newR1 = new(big.Int).Add(poolInfo.Reserve1, amount1)
		} else {
			newR0 = new(big.Int).Sub(poolInfo.Reserve0, amount0)
			newR1 = new(big.Int).Sub(poolInfo.Reserve1, amount1)
			if newR0.Sign() < 0 {
				newR0.SetInt64(0)
			}
			if newR1.Sign() < 0 {
				newR1.SetInt64(0)
			}
		}

		txType := "remove_liquidity"
		if isAdd {
			txType = "add_liquidity"
		}

		logger.Ctx(ctx).Info("Indexed V2 "+txType,
			zap.String("pool_id", poolId),
			zap.String("tx", log.TxHash.Hex()),
			zap.String("sender", sender),
			zap.String("amount0", amount0.String()),
			zap.String("amount1", amount1.String()),
		)

		header, err := client.HeaderByHash(ctx, log.BlockHash)
		var timestamp uint64
		if err != nil {
			timestamp = uint64(time.Now().Unix())
		} else {
			timestamp = header.Time
		}

		// Resolve prices to compute USD value
		prices := idx.resolveAllPrices(ctx)
		pp := prices[poolId]

		// Calculate USD value of liquidity event
		a0Float, _ := new(big.Float).SetInt(amount0).Float64()
		a1Float, _ := new(big.Float).SetInt(amount1).Float64()
		var usdValue float64
		if pp.Token0Price > 0 && pp.Token1Price > 0 {
			usdValue = (a0Float/math.Pow(10, float64(poolInfo.Decimals0)))*pp.Token0Price +
				(a1Float/math.Pow(10, float64(poolInfo.Decimals1)))*pp.Token1Price
		} else if pp.Token0Price > 0 {
			usdValue = (a0Float / math.Pow(10, float64(poolInfo.Decimals0))) * pp.Token0Price * 2.0
		} else if pp.Token1Price > 0 {
			usdValue = (a1Float / math.Pow(10, float64(poolInfo.Decimals1))) * pp.Token1Price * 2.0
		}

		err = conn.Exec(ctx, dbquery.InsertLiquidityEvent,
			log.TxHash.Hex(),
			log.BlockNumber,
			timestamp,
			poolId,
			strings.ToLower(sender),
			txType,
			amount0.String(),
			amount1.String(),
			lpAmount.String(),
			usdValue,
			txOrigin,
		)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to insert liquidity event into ClickHouse", zap.Error(err))
		}

		idx.mu.Lock()
		info := idx.knownPairs[poolId]
		info.Reserve0 = newR0
		info.Reserve1 = newR1
		idx.knownPairs[poolId] = info
		idx.mu.Unlock()

		idx.updateReserves(ctx, poolId, info.Token0, info.Token1, newR0, newR1, info.Decimals0, info.Decimals1, info.Fee, prices)
		idx.writePriceSnapshot(ctx, poolId, prices)

		// Broadcast AFTER reserves/TVL are written to DB so frontend gets fresh data
		idx.broadcastEventInternal(
			log.TxHash.Hex(),
			strings.ToLower(sender),
			txType,
			poolId,
			amount0.String(),
			amount1.String(),
			usdValue,
			int64(timestamp),
		)
	}

	return nil
}

func (idx *Indexer) indexSwapEvents(ctx context.Context, client *ethclient.Client, fromBlock, toBlock uint64) error {
	if len(idx.v2amms) == 0 {
		return nil
	}

	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
		Addresses: idx.v2ammAddresses(),
		Topics:    [][]common.Hash{{topicSwapped}},
	}

	logs, err := client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	conn := idx.clickhouse.Conn()

	for _, log := range logs {
		poolId := strings.ToLower(log.Address.Hex())

		idx.mu.RLock()
		_, isKnown := idx.knownPairs[poolId]
		idx.mu.RUnlock()

		if !isKnown {
			continue
		}

		if len(log.Topics) < 3 || len(log.Data) < 64 {
			continue
		}

		sender := common.BytesToAddress(log.Topics[1].Bytes()).Hex()
		tokenIn := common.BytesToAddress(log.Topics[2].Bytes()).Hex()

		// Fetch tx.origin (the EOA that initiated the tx)
		txOrigin := ""
		tx, _, err := client.TransactionByHash(ctx, log.TxHash)
		if err == nil {
			signer := types.LatestSignerForChainID(tx.ChainId())
			if origin, originErr := types.Sender(signer, tx); originErr == nil {
				txOrigin = strings.ToLower(origin.Hex())
			}
		}

		amountIn := new(big.Int).SetBytes(log.Data[0:32])
		amountOut := new(big.Int).SetBytes(log.Data[32:64])

		// Get block timestamp
		header, err := client.HeaderByHash(ctx, log.BlockHash)
		var timestamp uint64
		if err != nil {
			logger.Ctx(ctx).Warn("Could not get block header for timestamp, using current time", zap.Error(err))
			timestamp = uint64(time.Now().Unix())
		} else {
			timestamp = header.Time
		}

		logger.Ctx(ctx).Info("Indexed V2 SWAP transaction",
			zap.String("pool_id", poolId),
			zap.String("tx", log.TxHash.Hex()),
			zap.String("sender", sender),
			zap.String("tokenIn", tokenIn),
			zap.String("amountIn", amountIn.String()),
			zap.String("amountOut", amountOut.String()),
		)

		// Update reserves based on swap direction
		tokenInAddr := strings.ToLower(tokenIn)
		var amount0, amount1 string

		idx.mu.Lock()
		info := idx.knownPairs[poolId]
		if tokenInAddr == info.Token0 {
			// Swapping token0 for token1: reserve0 increases, reserve1 decreases
			info.Reserve0 = new(big.Int).Add(info.Reserve0, amountIn)
			info.Reserve1 = new(big.Int).Sub(info.Reserve1, amountOut)
			amount0 = amountIn.String()
			amount1 = new(big.Int).Neg(amountOut).String()
		} else {
			// Swapping token1 for token0: reserve1 increases, reserve0 decreases
			info.Reserve1 = new(big.Int).Add(info.Reserve1, amountIn)
			info.Reserve0 = new(big.Int).Sub(info.Reserve0, amountOut)
			amount0 = new(big.Int).Neg(amountOut).String()
			amount1 = amountIn.String()
		}
		if info.Reserve0.Sign() < 0 {
			info.Reserve0.SetInt64(0)
		}
		if info.Reserve1.Sign() < 0 {
			info.Reserve1.SetInt64(0)
		}
		idx.knownPairs[poolId] = info
		idx.mu.Unlock()

		// Resolve prices to compute USD value
		prices := idx.resolveAllPrices(ctx)
		pp := prices[poolId]

		usdValue := 0.0
		pR0, _ := new(big.Float).SetInt(amountIn).Float64()
		pR1, _ := new(big.Float).SetInt(amountOut).Float64()

		if tokenInAddr == info.Token0 {
			if pp.Token0Price > 0 {
				usdValue = (pR0 / math.Pow(10, float64(info.Decimals0))) * pp.Token0Price
			} else if pp.Token1Price > 0 {
				usdValue = (pR1 / math.Pow(10, float64(info.Decimals1))) * pp.Token1Price
			}
		} else {
			if pp.Token1Price > 0 {
				usdValue = (pR0 / math.Pow(10, float64(info.Decimals1))) * pp.Token1Price
			} else if pp.Token0Price > 0 {
				usdValue = (pR1 / math.Pow(10, float64(info.Decimals0))) * pp.Token0Price
			}
		}

		// Insert swap
		pricingMode := idx.pricer.GetPricingMode(ctx)
		err = conn.Exec(ctx, dbquery.InsertSwap,
			log.TxHash.Hex(),
			log.BlockNumber,
			timestamp,
			poolId,
			strings.ToLower(sender),
			"", // recipient not in V2 Swapped event
			txOrigin,
			amount0,
			amount1,
			"swap",
			usdValue,
			pricingMode,
		)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to insert swap into ClickHouse", zap.Error(err))
		}

		idx.updateReserves(ctx, poolId, info.Token0, info.Token1, info.Reserve0, info.Reserve1, info.Decimals0, info.Decimals1, info.Fee, prices)
		idx.writePriceSnapshot(ctx, poolId, prices)

		// Broadcast AFTER reserves/TVL are written to DB so frontend gets fresh data
		idx.broadcastEventInternal(
			log.TxHash.Hex(),
			strings.ToLower(sender),
			"swap",
			poolId,
			amount0,
			amount1,
			usdValue,
			int64(timestamp),
		)
	}

	return nil
}

func (idx *Indexer) resolveAllPrices(ctx context.Context) map[string]service.PairPrices {
	idx.mu.RLock()
	reserves := make(map[string]service.ReserveInfo)
	for pid, pair := range idx.knownPairs {
		reserves[strings.ToLower(pid)] = service.ReserveInfo{
			Reserve0:  pair.Reserve0,
			Reserve1:  pair.Reserve1,
			Decimals0: pair.Decimals0,
			Decimals1: pair.Decimals1,
		}
	}
	idx.mu.RUnlock()

	prices, _, _ := idx.pricer.ResolveAllPairs(ctx, reserves)
	return prices
}

func (idx *Indexer) broadcastEventInternal(txHash, sender, txType, poolId, amount0, amount1 string, usdValue float64, timestamp int64) {
	url := fmt.Sprintf("http://backend-api:%s/api/v2/internal/broadcast", idx.cfg.APIPort)
	payload := map[string]interface{}{
		"tx_hash":   txHash,
		"sender":    sender,
		"tx_type":   txType,
		"pool_id":   poolId,
		"amount0":   amount0,
		"amount1":   amount1,
		"usd_value": usdValue,
		"timestamp": timestamp,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		zap.L().Error("Failed to marshal internal broadcast payload", zap.Error(err))
		return
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil {
		zap.L().Error("Failed to create internal broadcast request", zap.Error(err))
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := idx.httpClient.Do(req)
	if err != nil {
		zap.L().Warn("Failed to send internal broadcast", zap.Error(err))
		return
	}
	resp.Body.Close()
}

func (idx *Indexer) updateReserves(ctx context.Context, poolId, token0, token1 string, r0, r1 *big.Int, dec0, dec1 uint8, fee float64, cachedPrices map[string]service.PairPrices) {
	if dec0 == 0 {
		dec0 = 18
	}
	if dec1 == 0 {
		dec1 = 18
	}

	// Ensure knownPairs has the latest info for this pool
	idx.mu.Lock()
	idx.knownPairs[poolId] = PairInfo{
		Token0:    strings.ToLower(token0),
		Token1:    strings.ToLower(token1),
		Fee:       fee,
		Decimals0: dec0,
		Decimals1: dec1,
		Reserve0:  r0,
		Reserve1:  r1,
	}
	idx.mu.Unlock()

	// Resolve prices for ALL pools at once (BFS over all knownPairs)
	var prices map[string]service.PairPrices
	if cachedPrices != nil {
		prices = cachedPrices
	} else {
		prices = idx.resolveAllPrices(ctx)
	}

	// Snapshot all known pairs under read lock
	idx.mu.RLock()
	allPairs := make(map[string]PairInfo, len(idx.knownPairs))
	for pid, info := range idx.knownPairs {
		allPairs[pid] = info
	}
	idx.mu.RUnlock()

	conn := idx.clickhouse.Conn()

	totalTVL := 0.0

	for pid, info := range allPairs {
		pp := prices[strings.ToLower(pid)]

		pR0, _ := new(big.Float).SetInt(info.Reserve0).Float64()
		pR1, _ := new(big.Float).SetInt(info.Reserve1).Float64()
		d0, d1 := info.Decimals0, info.Decimals1
		if d0 == 0 {
			d0 = 18
		}
		if d1 == 0 {
			d1 = 18
		}

		var tvl float64
		if pp.Token0Price > 0 || pp.Token1Price > 0 {
			stableAddr := strings.ToLower(idx.cfg.StablecoinAddress)
			wethAddr := strings.ToLower(idx.cfg.ContractWETH)
			t0 := strings.ToLower(info.Token0)
			t1 := strings.ToLower(info.Token1)

			isBase0 := t0 == stableAddr || t0 == wethAddr
			isBase1 := t1 == stableAddr || t1 == wethAddr

			u0 := pR0 / math.Pow(10, float64(d0))
			u1 := pR1 / math.Pow(10, float64(d1))

			if isBase0 && !isBase1 && pp.Token0Price > 0 {
				tvl = 2 * u0 * pp.Token0Price
			} else if isBase1 && !isBase0 && pp.Token1Price > 0 {
				tvl = 2 * u1 * pp.Token1Price
			} else {
				tvl = u0*pp.Token0Price + u1*pp.Token1Price
			}
		}

		totalTVL += tvl

		logger.Ctx(ctx).Info("Updating V2 pool reserves in database",
			zap.String("pool_id", pid),
			zap.String("reserve0", info.Reserve0.String()),
			zap.String("reserve1", info.Reserve1.String()),
			zap.Float64("tvl", tvl),
		)

		if err := conn.Exec(ctx, dbquery.InsertPairReserves,
			strings.ToLower(pid),
			info.Token0,
			info.Token1,
			info.Reserve0.String(),
			info.Reserve1.String(),
			tvl,
			info.Fee,
		); err != nil {
			logger.Ctx(ctx).Error("Failed to update reserves in database",
				zap.String("pool_id", pid),
				zap.Error(err),
			)
		}
	}

	// Write aggregated TVL snapshot
	if totalTVL > 0 {
		if err := conn.Exec(ctx, dbquery.InsertTVLSnapshot, totalTVL); err != nil {
			logger.Ctx(ctx).Error("Failed to insert TVL snapshot", zap.Error(err))
		}
	}
}

func (idx *Indexer) writePriceSnapshot(ctx context.Context, poolId string, cachedPrices map[string]service.PairPrices) {
	var prices map[string]service.PairPrices
	if cachedPrices != nil {
		prices = cachedPrices
	} else {
		prices = idx.resolveAllPrices(ctx)
	}
	pp, ok := prices[strings.ToLower(poolId)]
	if !ok {
		return
	}

	pricingMode := idx.pricer.GetPricingMode(ctx)

	conn := idx.clickhouse.Conn()
	err := conn.Exec(ctx, dbquery.InsertPriceSnapshot,
		strings.ToLower(poolId),
		pp.Token0Price,
		pp.Token1Price,
		pricingMode,
	)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to insert price snapshot", zap.Error(err))
	}
}

func (idx *Indexer) registerTokenIfMissing(ctx context.Context, client *ethclient.Client, tokenAddrStr string) uint8 {
	tokenAddrStr = strings.ToLower(tokenAddrStr)
	conn := idx.clickhouse.Conn()

	rows, err := conn.Query(ctx, "SELECT count() FROM tokens FINAL WHERE address = ?", tokenAddrStr)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to check token existence", zap.String("address", tokenAddrStr), zap.Error(err))
		return 18
	}
	defer rows.Close()

	var count uint64
	if rows.Next() {
		if err := rows.Scan(&count); err != nil {
			logger.Ctx(ctx).Error("Failed to scan token count", zap.Error(err))
			return 18
		}
	}

	if count > 0 {
		var decimals uint8
		rowsDec, err := conn.Query(ctx, "SELECT decimals FROM tokens FINAL WHERE address = ?", tokenAddrStr)
		if err == nil {
			defer rowsDec.Close()
			if rowsDec.Next() {
				rowsDec.Scan(&decimals)
				return decimals
			}
		}
		return 18
	}

	// Fetch symbol, name, decimals from EVM
	addr := common.HexToAddress(tokenAddrStr)

	symbolData, err := utils.CallContract(ctx, client, addr, "95d89b41")
	if err != nil {
		logger.Ctx(ctx).Error("Failed to call symbol()", zap.String("address", tokenAddrStr), zap.Error(err))
		return 18
	}
	symbol, err := utils.ParseABIString(symbolData)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to parse symbol", zap.Error(err))
		return 18
	}

	nameData, err := utils.CallContract(ctx, client, addr, "06fdde03")
	if err != nil {
		logger.Ctx(ctx).Error("Failed to call name()", zap.String("address", tokenAddrStr), zap.Error(err))
		return 18
	}
	name, err := utils.ParseABIString(nameData)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to parse name", zap.Error(err))
		return 18
	}

	decimalsData, err := utils.CallContract(ctx, client, addr, "313ce567")
	if err != nil {
		logger.Ctx(ctx).Error("Failed to call decimals()", zap.String("address", tokenAddrStr), zap.Error(err))
		return 18
	}
	if len(decimalsData) < 32 {
		logger.Ctx(ctx).Error("Invalid decimals data length", zap.String("address", tokenAddrStr))
		return 18
	}
	decimals := decimalsData[31]

	logger.Ctx(ctx).Info("Discovered and registering new token metadata from blockchain",
		zap.String("address", tokenAddrStr),
		zap.String("symbol", symbol),
		zap.String("name", name),
		zap.Uint8("decimals", decimals),
	)

	err = conn.Exec(ctx, shareddb.InsertToken,
		tokenAddrStr,
		symbol,
		name,
		decimals,
		"",
	)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to save token to ClickHouse", zap.String("address", tokenAddrStr), zap.Error(err))
	}

	return decimals
}

func (idx *Indexer) indexStakingEvents(ctx context.Context, client *ethclient.Client, fromBlock, toBlock uint64) error {
	if idx.cfg.ContractStaking == "" {
		return nil
	}

	stakingAddr := common.HexToAddress(idx.cfg.ContractStaking)

	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
		Addresses: []common.Address{stakingAddr},
		Topics:    [][]common.Hash{{topicDeposited, topicWithdrawn, topicRewardsClaimed}},
	}

	logs, err := client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	conn := idx.clickhouse.Conn()

	for _, log := range logs {
		if len(log.Topics) < 3 || len(log.Data) < 32 {
			continue
		}

		user := common.BytesToAddress(log.Topics[1].Bytes()).Hex()
		pid := new(big.Int).SetBytes(log.Topics[2].Bytes())
		amount := new(big.Int).SetBytes(log.Data[0:32])

		var txType string
		var rewardAmount string

		switch log.Topics[0] {
		case topicDeposited:
			txType = "stake"
			rewardAmount = "0"
		case topicWithdrawn:
			txType = "unstake"
			rewardAmount = "0"
		case topicRewardsClaimed:
			txType = "claim"
			rewardAmount = amount.String()
			amount = big.NewInt(0)
		default:
			continue
		}

		header, err := client.HeaderByHash(ctx, log.BlockHash)
		var timestamp uint64
		if err != nil {
			timestamp = uint64(time.Now().Unix())
		} else {
			timestamp = header.Time
		}

		logger.Ctx(ctx).Info("Indexed staking event",
			zap.String("tx_type", txType),
			zap.String("tx", log.TxHash.Hex()),
			zap.String("user", user),
			zap.String("pid", pid.String()),
			zap.String("amount", amount.String()),
		)

		err = conn.Exec(ctx, dbquery.InsertStakingEvent,
			log.TxHash.Hex(),
			log.BlockNumber,
			timestamp,
			strings.ToLower(user),
			pid,
			txType,
			amount.String(),
			rewardAmount,
			0.0,
		)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to insert staking event into ClickHouse", zap.Error(err))
		}

		idx.broadcastEventInternal(
			log.TxHash.Hex(),
			strings.ToLower(user),
			txType,
			pid.String(),
			amount.String(),
			rewardAmount,
			0.0,
			int64(timestamp),
		)
	}

	return nil
}

func (idx *Indexer) getLatestIndexedBlock(ctx context.Context) uint64 {
	conn := idx.clickhouse.Conn()
	query := `
		SELECT max(block_number) FROM (
			SELECT block_number FROM liquidity_events
			UNION ALL
			SELECT block_number FROM swaps
			UNION ALL
			SELECT block_number FROM staking_events
		)
	`
	rows, err := conn.Query(ctx, query)
	if err != nil {
		logger.Ctx(ctx).Warn("Failed to query latest indexed block from ClickHouse", zap.Error(err))
		return 0
	}
	defer rows.Close()

	var maxBlock uint64
	if rows.Next() {
		if err := rows.Scan(&maxBlock); err != nil {
			logger.Ctx(ctx).Warn("Failed to scan max block number", zap.Error(err))
			return 0
		}
	}
	return maxBlock
}

func (idx *Indexer) indexGovernorEvents(ctx context.Context, client *ethclient.Client, fromBlock, toBlock uint64) error {
	if idx.cfg.ContractGovernor == "" {
		return nil
	}

	govAddr := common.HexToAddress(idx.cfg.ContractGovernor)

	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
		Addresses: []common.Address{govAddr},
		Topics:    [][]common.Hash{{topicProposalCreated, topicVoteCast, topicProposalExecuted, topicProposalCanceled}},
	}

	logs, err := client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	conn := idx.clickhouse.Conn()

	for _, log := range logs {
		var txType string
		var userAddress string
		var poolId string
		var amount0 string
		var amount1 string

		switch log.Topics[0] {
		case topicProposalCreated:
			txType = "propose"
			if len(log.Topics) >= 3 {
				userAddress = common.BytesToAddress(log.Topics[2].Bytes()).Hex()
			} else {
				userAddress = strings.ToLower(log.Address.Hex())
			}
			poolId = new(big.Int).SetBytes(log.Topics[1].Bytes()).String()

		case topicVoteCast:
			txType = "vote"
			userAddress = common.BytesToAddress(log.Topics[2].Bytes()).Hex()
			poolId = new(big.Int).SetBytes(log.Topics[1].Bytes()).String()
			if len(log.Data) >= 64 {
				support := new(big.Int).SetBytes(log.Data[0:32]).String()
				weight := new(big.Int).SetBytes(log.Data[32:64]).String()
				amount0 = support
				amount1 = weight
			}

		case topicProposalExecuted:
			txType = "execute"
			poolId = new(big.Int).SetBytes(log.Topics[1].Bytes()).String()

		case topicProposalCanceled:
			txType = "cancel"
			poolId = new(big.Int).SetBytes(log.Topics[1].Bytes()).String()

		default:
			continue
		}

		txOrigin := ""
		tx, _, err := client.TransactionByHash(ctx, log.TxHash)
		if err == nil {
			signer := types.LatestSignerForChainID(tx.ChainId())
			sender, err := types.Sender(signer, tx)
			if err == nil {
				txOrigin = strings.ToLower(sender.Hex())
			}
		}

		if userAddress == "" {
			userAddress = txOrigin
		}

		userAddress = strings.ToLower(userAddress)

		header, err := client.HeaderByHash(ctx, log.BlockHash)
		var timestamp uint64
		if err != nil {
			timestamp = uint64(time.Now().Unix())
		} else {
			timestamp = header.Time
		}

		logger.Ctx(ctx).Info("Indexed governor event",
			zap.String("tx_type", txType),
			zap.String("tx", log.TxHash.Hex()),
			zap.String("user", userAddress),
			zap.String("proposal_id", poolId),
		)

		err = conn.Exec(ctx, dbquery.InsertGovernanceEvent,
			log.TxHash.Hex(),
			log.BlockNumber,
			timestamp,
			userAddress,
			poolId,
			txType,
			amount0,
			amount1,
			0.0,
		)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to insert governor event into ClickHouse", zap.Error(err))
		}

		idx.broadcastEventInternal(
			log.TxHash.Hex(),
			userAddress,
			txType,
			poolId,
			amount0,
			amount1,
			0.0,
			int64(timestamp),
		)
	}

	return nil
}

func (idx *Indexer) indexDelegateEvents(ctx context.Context, client *ethclient.Client, tokenAddr common.Address, fromBlock, toBlock uint64) error {
	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
		Addresses: []common.Address{tokenAddr},
		Topics:    [][]common.Hash{{topicDelegateChanged}},
	}

	logs, err := client.FilterLogs(ctx, query)
	if err != nil {
		return err
	}

	conn := idx.clickhouse.Conn()

	for _, log := range logs {
		if len(log.Topics) < 4 {
			continue
		}

		delegator := common.BytesToAddress(log.Topics[1].Bytes()).Hex()
		toDelegate := common.BytesToAddress(log.Topics[3].Bytes()).Hex()

		header, err := client.HeaderByHash(ctx, log.BlockHash)
		var timestamp uint64
		if err != nil {
			timestamp = uint64(time.Now().Unix())
		} else {
			timestamp = header.Time
		}

		userAddress := strings.ToLower(delegator)

		logger.Ctx(ctx).Info("Indexed delegate event",
			zap.String("tx", log.TxHash.Hex()),
			zap.String("delegator", userAddress),
			zap.String("toDelegate", toDelegate),
		)

		err = conn.Exec(ctx, dbquery.InsertGovernanceEvent,
			log.TxHash.Hex(),
			log.BlockNumber,
			timestamp,
			userAddress,
			strings.ToLower(toDelegate),
			"delegate",
			"",
			"",
			0.0,
		)
		if err != nil {
			logger.Ctx(ctx).Error("Failed to insert delegate event into ClickHouse", zap.Error(err))
		}

		idx.broadcastEventInternal(
			log.TxHash.Hex(),
			userAddress,
			"delegate",
			strings.ToLower(toDelegate),
			"",
			"",
			0.0,
			int64(timestamp),
		)
	}

	return nil
}
