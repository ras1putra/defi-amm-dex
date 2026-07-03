package api

import (
	"defi-amm-dex/internal/config"
	"defi-amm-dex/internal/v2/dto"
	"defi-amm-dex/pkg/response"

	"github.com/gofiber/fiber/v2"
)

type ConfigHandler struct {
	cfg *config.Config
}

func NewConfigHandler(cfg *config.Config) *ConfigHandler {
	return &ConfigHandler{cfg: cfg}
}

func (h *ConfigHandler) GetConfig(c *fiber.Ctx) error {
	resp := dto.ConfigResponse{
		ContractV2AMM:     h.cfg.ContractV2AMM,
		ContractV2Router:  h.cfg.ContractV2Router,
		ContractWETH:      h.cfg.ContractWETH,
		ContractStaking:   h.cfg.ContractStaking,
		ContractGovernor:  h.cfg.ContractGovernor,
		StablecoinAddress: h.cfg.StablecoinAddress,
		Chain: dto.ChainConfigResponse{
			ChainID:     h.cfg.ChainID,
			ChainName:   h.cfg.ChainName,
			RPCURL:      h.cfg.ChainRPCURL,
			ExplorerURL: h.cfg.ExplorerURL,
			Currency: dto.CurrencyResponse{
				Name:     "Ether",
				Symbol:   "ETH",
				Decimals: 18,
			},
		},
	}

	return response.OK(c, resp, "Config fetched")
}
