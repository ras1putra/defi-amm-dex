package middleware

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"defi-amm-dex/pkg/logger"
	"defi-amm-dex/pkg/response"
)

func RequestID() fiber.Handler {
	return func(c *fiber.Ctx) error {
		id := c.Get("X-Request-ID")
		if id == "" {
			id = uuid.New().String()
		}
		c.Set("X-Request-ID", id)
		c.Locals("request_id", id)

		reqLogger := zap.L().With(zap.String("request_id", id))

		ctx := logger.WithCtx(c.UserContext(), reqLogger)
		c.SetUserContext(ctx)

		return c.Next()
	}
}

func RequestLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		latency := time.Since(start)
		status := c.Response().StatusCode()
		method := c.Method()
		path := c.Path()
		requestID, _ := c.Locals("request_id").(string)

		fields := []zap.Field{
			zap.String("method", method),
			zap.String("path", path),
			zap.Int("status", status),
			zap.Duration("latency", latency),
			zap.String("request_id", requestID),
		}

		if err != nil {
			var appErr *response.AppError
			var fiberErr *fiber.Error
			if errors.As(err, &appErr) {
				status = appErr.Code
			} else if errors.As(err, &fiberErr) {
				status = fiberErr.Code
			}

			fields[2] = zap.Int("status", status)
			fields = append(fields, zap.Error(err))
			if status >= 500 {
				logger.Ctx(c.UserContext()).Error("Request failed", fields...)
			} else {
				logger.Ctx(c.UserContext()).Warn("Request failed", fields...)
			}
			return err
		}

		logger.Ctx(c.UserContext()).Info("Request handled", fields...)
		return nil
	}
}
