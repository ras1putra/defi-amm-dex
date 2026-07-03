package api

import (
	"github.com/gofiber/fiber/v2"

	"defi-amm-dex/internal/dto"
	"defi-amm-dex/internal/service"
	"defi-amm-dex/pkg/response"
)

type TokenHandler struct {
	svc service.TokenServicer
}

func NewTokenHandler(svc service.TokenServicer) *TokenHandler {
	return &TokenHandler{svc: svc}
}

func (h *TokenHandler) RegisterRoutes(app *fiber.App) {
	app.Post("/api/tokens", h.RegisterToken)
}

func (h *TokenHandler) RegisterToken(c *fiber.Ctx) error {
	req := dto.RegisterTokenRequest{
		Address: c.FormValue("address"),
	}

	if err := req.Validate(); err != nil {
		return response.HandleError(c, response.NewAppError(fiber.StatusBadRequest, err.Error()), "Token validation")
	}

	// Get file
	fileHeader, err := c.FormFile("logo")
	if err != nil {
		return response.HandleError(c, response.NewAppError(fiber.StatusBadRequest, "logo file is required"), "Fetch logo file")
	}

	file, err := fileHeader.Open()
	if err != nil {
		return response.HandleError(c, response.NewAppError(fiber.StatusInternalServerError, "failed to open logo file"), "Open logo file")
	}
	defer file.Close()

	contentType := fileHeader.Header.Get("Content-Type")

	tokenInfo, err := h.svc.RegisterToken(c.UserContext(), req.Address, file, fileHeader.Filename, contentType)
	if err != nil {
		return response.HandleError(c, response.NewAppError(fiber.StatusBadRequest, err.Error()), "Register token")
	}

	return response.Created(c, tokenInfo, "Token registered successfully")
}
