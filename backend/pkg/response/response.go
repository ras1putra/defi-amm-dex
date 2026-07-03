package response

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"go.uber.org/zap"

	"defi-amm-dex/pkg/logger"
)

type AppError struct {
	Code    int    `json:"-"`
	Message string `json:"-"`
}

func (e *AppError) Error() string {
	return e.Message
}

func NewAppError(code int, message string) *AppError {
	return &AppError{Code: code, Message: message}
}

func HandleError(c *fiber.Ctx, err error, op string) error {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return c.Status(appErr.Code).JSON(fiber.Map{"message": appErr.Message, "data": nil})
	}

	logger.Ctx(c.UserContext()).Error(op+" failed",
		zap.String("method", c.Method()),
		zap.String("path", c.Path()),
		zap.Error(err),
	)

	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "Internal server error, please try again later. Contact administrators if the issue persists.", "data": nil})
}

func ErrorHandler(c *fiber.Ctx, err error) error {
	var appErr *AppError
	var fiberErr *fiber.Error

	if errors.As(err, &appErr) {
		return c.Status(appErr.Code).JSON(fiber.Map{"message": appErr.Message, "data": nil})
	}

	if errors.As(err, &fiberErr) {
		return c.Status(fiberErr.Code).JSON(fiber.Map{"message": fiberErr.Message, "data": nil})
	}

	logger.Ctx(c.UserContext()).Error("Internal server error", zap.String("path", c.Path()), zap.Error(err))
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": "Internal server error, please try again later. Contact administrators if the issue persists.", "data": nil})
}

func OK(c *fiber.Ctx, data interface{}, message string) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{"message": message, "data": data})
}

func Created(c *fiber.Ctx, data interface{}, message string) error {
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"message": message, "data": data})
}

func NotFound(c *fiber.Ctx, message string) error {
	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"message": message, "data": nil})
}

func InternalError(c *fiber.Ctx, message string) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"message": message, "data": nil})
}
