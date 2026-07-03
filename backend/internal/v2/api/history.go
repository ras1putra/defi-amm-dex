package api

import (
	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"

	"defi-amm-dex/internal/v2/service"
	"defi-amm-dex/pkg/logger"
	"defi-amm-dex/pkg/response"
)

type HistoryHandler struct {
	svc service.HistoryServicer
}

func NewHistoryHandler(svc service.HistoryServicer) *HistoryHandler {
	return &HistoryHandler{svc: svc}
}

func (h *HistoryHandler) RegisterRoutes(app *fiber.App) {
	api := app.Group("/api")
	history := api.Group("/v2/history")
	history.Get("", h.getHistory)
}

func (h *HistoryHandler) getHistory(c *fiber.Ctx) error {
	address := c.Query("address")
	if address == "" {
		return response.NewAppError(fiber.StatusBadRequest, "address is required")
	}

	txType := c.Query("type", "all")
	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("limit", 20)

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	result, err := h.svc.GetTxHistory(c.UserContext(), address, txType, page, pageSize)
	if err != nil {
		return response.HandleError(c, err, "Transaction history")
	}

	logger.Ctx(c.UserContext()).Info("Transaction history retrieved",
		zap.String("address", address),
		zap.String("type", txType),
		zap.Int("page", page),
		zap.Int("total", result.Total),
	)

	return response.OK(c, result, "Transaction history retrieved")
}
