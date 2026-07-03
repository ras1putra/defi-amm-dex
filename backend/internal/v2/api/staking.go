package api

import (
	"github.com/gofiber/fiber/v2"

	"defi-amm-dex/internal/v2/service"
	"defi-amm-dex/pkg/response"
)

type StakingHandler struct {
	svc service.StakingServicer
}

func NewStakingHandler(svc service.StakingServicer) *StakingHandler {
	return &StakingHandler{svc: svc}
}

func (h *StakingHandler) RegisterRoutes(app *fiber.App) {
	g := app.Group("/api/v2/staking")

	g.Get("/pools", h.getPools)
}

func (h *StakingHandler) getPools(c *fiber.Ctx) error {
	userAddress := c.Query("user")

	pools, err := h.svc.GetPools(c.UserContext(), userAddress)
	if err != nil {
		return response.HandleError(c, err, "Staking pools")
	}

	return response.OK(c, pools, "Staking pools retrieved")
}
