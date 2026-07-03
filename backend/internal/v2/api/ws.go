package api

import (
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	"defi-amm-dex/internal/v2/ws"
)

type WSHandler struct {
	hub *ws.Hub
}

func NewWSHandler() *WSHandler {
	return &WSHandler{hub: ws.GetHub()}
}

func (h *WSHandler) RegisterRoutes(app *fiber.App) {
	app.Get("/api/v2/ws", websocket.New(func(c *websocket.Conn) {
		h.hub.HandleWebSocket(c)
	}))

	app.Post("/api/v2/internal/broadcast", h.handleInternalBroadcast)
}

func (h *WSHandler) handleInternalBroadcast(c *fiber.Ctx) error {
	var event ws.TxEvent
	if err := c.BodyParser(&event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid body"})
	}

	h.hub.BroadcastEvent(
		event.TxHash,
		event.Sender,
		event.TxType,
		event.PoolID,
		event.Amount0,
		event.Amount1,
		event.USDValue,
		event.Timestamp,
	)

	return c.SendStatus(fiber.StatusOK)
}
