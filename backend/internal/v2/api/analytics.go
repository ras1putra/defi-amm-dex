package api

import (
	"strconv"

	"github.com/gofiber/fiber/v2"

	"defi-amm-dex/internal/v2/service"
	"defi-amm-dex/pkg/response"
)

type AnalyticsHandler struct {
	svc service.AnalyticsServicer
}

func NewAnalyticsHandler(svc service.AnalyticsServicer) *AnalyticsHandler {
	return &AnalyticsHandler{svc: svc}
}

func (h *AnalyticsHandler) RegisterRoutes(app *fiber.App) {
	g := app.Group("/api/v2/analytics")

	g.Get("/overview", h.getOverview)
	g.Get("/tvl-history", h.getTVLHistory)
	g.Get("/volume-history", h.getVolumeHistory)
	g.Get("/pairs/:poolId", h.getPairDetail)
	g.Get("/pairs/:poolId/price-history", h.getPriceHistory)
	g.Get("/pairs/:poolId/ohlcv", h.getOHLCV)
	g.Get("/tokens", h.getTokenPrices)
	g.Get("/staking/apr", h.getStakingAPR)
}

func (h *AnalyticsHandler) getOverview(c *fiber.Ctx) error {
	tf := c.Query("timeframe", "24h")
	interval := parseTimeframeSeconds(tf)
	data, err := h.svc.GetOverview(c.UserContext(), interval)
	if err != nil {
		return response.HandleError(c, err, "Analytics overview")
	}
	return response.OK(c, data, "Overview retrieved")
}

func (h *AnalyticsHandler) getTVLHistory(c *fiber.Ctx) error {
	data, err := h.svc.GetTVLHistory(c.UserContext())
	if err != nil {
		return response.HandleError(c, err, "TVL history")
	}
	return response.OK(c, data, "TVL history retrieved")
}

func (h *AnalyticsHandler) getVolumeHistory(c *fiber.Ctx) error {
	data, err := h.svc.GetVolumeHistory(c.UserContext())
	if err != nil {
		return response.HandleError(c, err, "Volume history")
	}
	return response.OK(c, data, "Volume history retrieved")
}

func (h *AnalyticsHandler) getPriceHistory(c *fiber.Ctx) error {
	poolID := c.Params("poolId")
	data, err := h.svc.GetPriceHistory(c.UserContext(), poolID)
	if err != nil {
		return response.HandleError(c, err, "Price history")
	}
	return response.OK(c, data, "Price history retrieved")
}

func (h *AnalyticsHandler) getPairDetail(c *fiber.Ctx) error {
	poolID := c.Params("poolId")
	data, err := h.svc.GetPairDetail(c.UserContext(), poolID)
	if err != nil {
		return response.HandleError(c, err, "Pair detail")
	}
	return response.OK(c, data, "Pair detail retrieved")
}

func (h *AnalyticsHandler) getOHLCV(c *fiber.Ctx) error {
	poolID := c.Params("poolId")
	intervalStr := c.Query("interval", "3600")
	lookbackStr := c.Query("lookback", "604800")

	interval, err := strconv.Atoi(intervalStr)
	if err != nil || interval <= 0 {
		interval = 3600
	}
	lookback, err := strconv.Atoi(lookbackStr)
	if err != nil || lookback <= 0 {
		lookback = 604800
	}

	tokenAddress := c.Query("token")

	data, err := h.svc.GetOHLCV(c.UserContext(), poolID, tokenAddress, interval, lookback)
	if err != nil {
		return response.HandleError(c, err, "OHLCV data")
	}
	return response.OK(c, data, "OHLCV retrieved")
}

func (h *AnalyticsHandler) getTokenPrices(c *fiber.Ctx) error {
	tf := c.Query("timeframe", "24h")
	interval := parseTimeframeSeconds(tf)
	data, err := h.svc.GetTokenPrices(c.UserContext(), interval)
	if err != nil {
		return response.HandleError(c, err, "Token prices")
	}
	return response.OK(c, data, "Token prices retrieved")
}

func (h *AnalyticsHandler) getStakingAPR(c *fiber.Ctx) error {
	data, err := h.svc.GetStakingAPR(c.UserContext())
	if err != nil {
		return response.HandleError(c, err, "Staking APR")
	}
	return response.OK(c, data, "APR retrieved")
}

func parseTimeframeSeconds(tf string) int {
	switch tf {
	case "1m":
		return 60
	case "5m":
		return 300
	case "1h":
		return 3600
	case "4h":
		return 14400
	case "24h":
		return 86400
	default:
		if sec, err := strconv.Atoi(tf); err == nil && sec > 0 {
			return sec
		}
		return 86400
	}
}
