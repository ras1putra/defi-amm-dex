package api

import (
	"github.com/gofiber/fiber/v2"

	"defi-amm-dex/internal/config"
	"defi-amm-dex/internal/v2/service"
	"defi-amm-dex/pkg/logger"
	"defi-amm-dex/pkg/response"
)

type DEXHandler struct {
	cfg *config.Config
	svc service.DEXServicer
}

func NewDEXHandler(cfg *config.Config, svc service.DEXServicer) *DEXHandler {
	return &DEXHandler{cfg: cfg, svc: svc}
}

func (h *DEXHandler) RegisterRoutes(app *fiber.App) {
	api := app.Group("/api")

	api.Get("/health", h.health)

	dex := api.Group("/v2/dex")
	dex.Get("/pairs", h.listPairs)
	dex.Get("/tokens", h.listTokens)
}

func (h *DEXHandler) health(c *fiber.Ctx) error {
	logger.Ctx(c.UserContext()).Debug("Health check requested")
	return response.OK(c, fiber.Map{"status": "ok"}, "Service is healthy")
}

func (h *DEXHandler) listPairs(c *fiber.Ctx) error {
	pairs, err := h.svc.ListPairs(c.UserContext())
	if err != nil {
		return response.HandleError(c, err, "Pairs list")
	}

	logger.Ctx(c.UserContext()).Info("DEX pairs listed")
	return response.OK(c, pairs, "Pairs retrieved")
}

func (h *DEXHandler) listTokens(c *fiber.Ctx) error {
	search := c.Query("search")
	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)

	tokens, err := h.svc.ListTokensPaginated(c.UserContext(), search, limit, offset)
	if err != nil {
		return response.HandleError(c, err, "Tokens list")
	}

	logger.Ctx(c.UserContext()).Info("DEX tokens listed")
	return response.OK(c, tokens, "Tokens retrieved")
}


