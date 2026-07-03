package service

import (
	"context"
	"math"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"go.uber.org/zap"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/config"
	"defi-amm-dex/internal/v2/dto"
	"defi-amm-dex/pkg/logger"
	"defi-amm-dex/pkg/utils"
)

const masterChefV2ABIJSON = `[
	{"inputs":[],"name":"poolLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
	{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"poolInfo","outputs":[{"internalType":"contract IERC20","name":"lpToken","type":"address"},{"internalType":"contract IRewarder","name":"rewarder","type":"address"},{"internalType":"uint256","name":"totalStaked","type":"uint256"}],"stateMutability":"view","type":"function"},
	{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"address","name":"","type":"address"}],"name":"userInfo","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"},
	{"inputs":[{"internalType":"uint256","name":"_pid","type":"uint256"},{"internalType":"address","name":"_user","type":"address"}],"name":"pendingRewards","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
]`

const rewarderABIJSON = `[
	{"inputs":[],"name":"rewardToken","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
	{"inputs":[],"name":"rewardPerSecond","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
	{"inputs":[],"name":"totalRewardCap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
	{"inputs":[],"name":"rewardDistributed","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
]`

const erc20SymbolABIFragment = `[{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}]`

const erc20DecimalsABIFragment = `[{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"}]`

const lpTokenPoolABIFragment = `[{"inputs":[],"name":"pool","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]`

const erc20TotalSupplyABIFragment = `[{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]`

type PoolInfoV2Output struct {
	LpToken     common.Address `abi:"lpToken"`
	Rewarder    common.Address `abi:"rewarder"`
	TotalStaked *big.Int       `abi:"totalStaked"`
}

type StakingServicer interface {
	GetPools(ctx context.Context, userAddress string) ([]dto.StakingPoolResponse, error)
}

type StakingService struct {
	cfg         *config.Config
	eth         *ethclient.Client
	ch          *clickhouse.Client
	pricer      *Pricer
	contract    *common.Address
	contractABI *abi.ABI
	rewarderABI *abi.ABI
	tokenABI    *abi.ABI
	decimalsABI *abi.ABI
	poolABI     *abi.ABI
	supplyABI   *abi.ABI
}

func NewStakingService(cfg *config.Config, eth *ethclient.Client, ch *clickhouse.Client, pricer *Pricer) *StakingService {
	addr := common.HexToAddress(cfg.ContractStaking)

	parsed, err := abi.JSON(strings.NewReader(masterChefV2ABIJSON))
	if err != nil {
		zap.L().Fatal("Failed to parse MasterChefV2 ABI", zap.Error(err))
	}

	rewABI, err := abi.JSON(strings.NewReader(rewarderABIJSON))
	if err != nil {
		zap.L().Fatal("Failed to parse Rewarder ABI", zap.Error(err))
	}

	tokABI, err := abi.JSON(strings.NewReader(erc20SymbolABIFragment))
	if err != nil {
		zap.L().Fatal("Failed to parse ERC20 symbol ABI", zap.Error(err))
	}

	decABI, err := abi.JSON(strings.NewReader(erc20DecimalsABIFragment))
	if err != nil {
		zap.L().Fatal("Failed to parse ERC20 decimals ABI", zap.Error(err))
	}

	poolABI, err := abi.JSON(strings.NewReader(lpTokenPoolABIFragment))
	if err != nil {
		zap.L().Fatal("Failed to parse LP Token pool ABI", zap.Error(err))
	}

	supplyABI, err := abi.JSON(strings.NewReader(erc20TotalSupplyABIFragment))
	if err != nil {
		zap.L().Fatal("Failed to parse ERC20 totalSupply ABI", zap.Error(err))
	}

	return &StakingService{
		cfg:         cfg,
		eth:         eth,
		ch:          ch,
		pricer:      pricer,
		contract:    &addr,
		contractABI: &parsed,
		rewarderABI: &rewABI,
		tokenABI:    &tokABI,
		decimalsABI: &decABI,
		poolABI:     &poolABI,
		supplyABI:   &supplyABI,
	}
}

func (s *StakingService) callABI(ctx context.Context, abiDef *abi.ABI, to common.Address, method string, args ...interface{}) ([]byte, error) {
	data, err := abiDef.Pack(method, args...)
	if err != nil {
		return nil, err
	}
	return s.eth.CallContract(ctx, ethereum.CallMsg{To: &to, Data: data}, nil)
}

func (s *StakingService) callContract(ctx context.Context, method string, args ...interface{}) ([]byte, error) {
	return s.callABI(ctx, s.contractABI, *s.contract, method, args...)
}

func (s *StakingService) callRewarder(ctx context.Context, rewarder common.Address, method string, args ...interface{}) ([]byte, error) {
	return s.callABI(ctx, s.rewarderABI, rewarder, method, args...)
}

func (s *StakingService) callUint256FromBytes(result []byte) *big.Int {
	out := new(big.Int)
	out.SetBytes(result)
	return out
}

func (s *StakingService) callAddressFromBytes(result []byte) common.Address {
	return common.BytesToAddress(result)
}

func (s *StakingService) erc20Symbol(ctx context.Context, token common.Address) string {
	result, err := s.callABI(ctx, s.tokenABI, token, "symbol")
	if err != nil {
		return utils.ShortAddr(token)
	}
	var out string
	if err := s.tokenABI.UnpackIntoInterface(&out, "symbol", result); err != nil || out == "" {
		return utils.ShortAddr(token)
	}
	return out
}

func (s *StakingService) erc20Decimals(ctx context.Context, token common.Address) uint8 {
	result, err := s.callABI(ctx, s.decimalsABI, token, "decimals")
	if err != nil {
		return 18
	}
	var out uint8
	if err := s.decimalsABI.UnpackIntoInterface(&out, "decimals", result); err != nil {
		return 18
	}
	return out
}

func (s *StakingService) getPricesAndReserves(ctx context.Context) (map[string]float64, map[string]ReserveInfo, string) {
	conn := s.ch.Conn()
	rows, err := conn.Query(ctx, "SELECT pool_id, token0, token1, reserve0, reserve1 FROM pairs FINAL")
	if err != nil {
		return nil, nil, ""
	}
	defer rows.Close()

	reserves := make(map[string]ReserveInfo)
	type rawPool struct {
		poolID, t0, t1, r0, r1 string
	}
	var rawPools []rawPool
	for rows.Next() {
		var p rawPool
		if err := rows.Scan(&p.poolID, &p.t0, &p.t1, &p.r0, &p.r1); err != nil {
			continue
		}
		rawPools = append(rawPools, p)
	}

	for _, p := range rawPools {
		r0, _ := new(big.Int).SetString(p.r0, 10)
		r1, _ := new(big.Int).SetString(p.r1, 10)
		dec0 := s.pricer.getTokenDecimals(ctx, p.t0)
		dec1 := s.pricer.getTokenDecimals(ctx, p.t1)
		reserves[strings.ToLower(p.poolID)] = ReserveInfo{
			Reserve0:  r0,
			Reserve1:  r1,
			Decimals0: dec0,
			Decimals1: dec1,
		}
	}

	prices, mode, _ := s.pricer.ResolveTokenPrices(ctx, reserves)
	return prices, reserves, mode
}

func (s *StakingService) GetPools(ctx context.Context, userAddress string) ([]dto.StakingPoolResponse, error) {
	if s.cfg.ContractStaking == "" || *s.contract == (common.Address{}) {
		return []dto.StakingPoolResponse{}, nil
	}

	result, err := s.callContract(ctx, "poolLength")
	if err != nil {
		logger.Ctx(ctx).Error("Failed to call poolLength", zap.Error(err))
		return nil, nil
	}
	poolLen := s.callUint256FromBytes(result)

	if poolLen.Sign() == 0 {
		return []dto.StakingPoolResponse{}, nil
	}

	n := int(poolLen.Int64())
	pools := make([]dto.StakingPoolResponse, 0, n)
	hasUser := common.IsHexAddress(userAddress)
	var userAddr common.Address
	if hasUser {
		userAddr = common.HexToAddress(userAddress)
	}

	prices, reserves, mode := s.getPricesAndReserves(ctx)

	for pid := 0; pid < n; pid++ {
		pool := s.fetchPool(ctx, pid, hasUser, userAddr, prices, reserves, mode)
		if pool != nil {
			pools = append(pools, *pool)
		}
	}

	return pools, nil
}

func (s *StakingService) fetchPool(
	ctx context.Context,
	pid int,
	hasUser bool,
	userAddr common.Address,
	prices map[string]float64,
	reserves map[string]ReserveInfo,
	mode string,
) *dto.StakingPoolResponse {
	poolResult, err := s.callContract(ctx, "poolInfo", big.NewInt(int64(pid)))
	if err != nil {
		return nil
	}
	var poolOut PoolInfoV2Output
	if err := s.contractABI.UnpackIntoInterface(&poolOut, "poolInfo", poolResult); err != nil {
		return nil
	}

	lpTokenAddr := poolOut.LpToken
	rewarderAddr := poolOut.Rewarder
	totalStaked := poolOut.TotalStaked

	lpSymbol := s.erc20Symbol(ctx, lpTokenAddr)
	lpDecimals := s.erc20Decimals(ctx, lpTokenAddr)

	rtResult, err := s.callRewarder(ctx, rewarderAddr, "rewardToken")
	if err != nil {
		return nil
	}
	rewardTokenAddr := s.callAddressFromBytes(rtResult)
	rewardSymbol := s.erc20Symbol(ctx, rewardTokenAddr)
	rewardDecimals := s.erc20Decimals(ctx, rewardTokenAddr)

	rpsResult, err := s.callRewarder(ctx, rewarderAddr, "rewardPerSecond")
	if err != nil {
		return nil
	}
	rewardPerSec := s.callUint256FromBytes(rpsResult)

	capResult, err := s.callRewarder(ctx, rewarderAddr, "totalRewardCap")
	if err != nil {
		return nil
	}
	totalCap := s.callUint256FromBytes(capResult)

	distResult, err := s.callRewarder(ctx, rewarderAddr, "rewardDistributed")
	if err != nil {
		return nil
	}
	distributed := s.callUint256FromBytes(distResult)

	totalStakedF := utils.WeiToFloat64(totalStaked)
	rewardPerSecF := utils.WeiToFloat64(rewardPerSec)

	apr := 0.0
	if rewardPerSecF > 0 {
		effectiveStakedF := totalStakedF
		if effectiveStakedF <= 0 {
			effectiveStakedF = 1.0 // Assume 1 LP token is staked to calculate potential initial APR
		}

		rewardsPerYear := rewardPerSecF * 365.25 * 86400
		
		// Quantity-based fallback
		apr = (rewardsPerYear / effectiveStakedF) * 100

		if mode != "" && len(prices) > 0 {
			rewardTokenPrice := prices[strings.ToLower(rewardTokenAddr.Hex())]
			stakingTokenPrice := 0.0

			var isLP bool
			var ammPoolAddr common.Address

			poolResult, err := s.callABI(ctx, s.poolABI, lpTokenAddr, "pool")
			if err == nil {
				var unpackedAddr common.Address
				if err := s.poolABI.UnpackIntoInterface(&unpackedAddr, "pool", poolResult); err == nil {
					if unpackedAddr != (common.Address{}) {
						ammPoolAddr = unpackedAddr
						isLP = true
					}
				}
			}

			if isLP {
				poolID := strings.ToLower(ammPoolAddr.Hex())
				var token0, token1 string
				err := s.ch.Conn().QueryRow(ctx, "SELECT token0, token1 FROM pairs FINAL WHERE pool_id = ?", poolID).Scan(&token0, &token1)
				if err == nil {
					if info, ok := reserves[poolID]; ok {
						r0F, _ := new(big.Float).SetInt(info.Reserve0).Float64()
						r1F, _ := new(big.Float).SetInt(info.Reserve1).Float64()
						t0Price := prices[strings.ToLower(token0)]
						t1Price := prices[strings.ToLower(token1)]

						u0 := r0F / math.Pow(10, float64(info.Decimals0))
						u1 := r1F / math.Pow(10, float64(info.Decimals1))
						poolTVL := u0*t0Price + u1*t1Price

						supplyResult, err := s.callABI(ctx, s.supplyABI, lpTokenAddr, "totalSupply")
						if err == nil {
							var lpSupply *big.Int
							if err := s.supplyABI.UnpackIntoInterface(&lpSupply, "totalSupply", supplyResult); err == nil && lpSupply.Sign() > 0 {
								lpSupplyF := utils.WeiToFloat64(lpSupply)
								stakingTokenPrice = poolTVL / lpSupplyF
							}
						}
					}
				}
			} else {
				stakingTokenPrice = prices[strings.ToLower(lpTokenAddr.Hex())]
			}

			if rewardTokenPrice > 0 && stakingTokenPrice > 0 {
				apr = (rewardsPerYear * rewardTokenPrice) / (effectiveStakedF * stakingTokenPrice) * 100
			} else {
				apr = 0.0
			}
		}
	}

	remaining := new(big.Int).Sub(totalCap, distributed)
	isClosed := totalCap.Sign() > 0 && remaining.Sign() <= 0

	poolResp := dto.StakingPoolResponse{
		PoolID:             pid,
		Address:            s.contract.Hex(),
		StakingToken:       lpTokenAddr.Hex(),
		StakingTokenSymbol: lpSymbol,
		RewardToken:        rewardTokenAddr.Hex(),
		RewardTokenSymbol:  rewardSymbol,
		TotalStaked:        utils.TokenToDecimal(totalStaked, lpDecimals),
		RewardRate:         rewardPerSec.String(),
		APR:                math.Round(apr*100) / 100,
		UserStaked:         "0",
		UserPendingRewards: "0",
		IsClosed:           isClosed,
	}

	if hasUser {
		userData, err := s.callContract(ctx, "userInfo", big.NewInt(int64(pid)), userAddr)
		if err == nil {
			type userOut struct {
				Amount *big.Int `abi:"amount"`
			}
			var u userOut
			if err := s.contractABI.UnpackIntoInterface(&u, "userInfo", userData); err == nil {
				poolResp.UserStaked = utils.TokenToDecimal(u.Amount, lpDecimals)
			}
		}

		pendingData, err := s.callContract(ctx, "pendingRewards", big.NewInt(int64(pid)), userAddr)
		if err == nil {
			var pendingOut *big.Int
			if err := s.contractABI.UnpackIntoInterface(&pendingOut, "pendingRewards", pendingData); err == nil {
				poolResp.UserPendingRewards = utils.TokenToDecimal(pendingOut, rewardDecimals)
			}
		}
	}

	return &poolResp
}
