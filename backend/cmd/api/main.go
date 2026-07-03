package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"go.uber.org/zap"

	sharedapi "defi-amm-dex/internal/api"
	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/config"
	"defi-amm-dex/internal/middleware"
	sharedservice "defi-amm-dex/internal/service"
	"defi-amm-dex/internal/storage"
	"defi-amm-dex/internal/v2/api"
	"defi-amm-dex/internal/v2/service"
	"defi-amm-dex/internal/v2/ws"
	customlogger "defi-amm-dex/pkg/logger"
	"defi-amm-dex/pkg/response"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := customlogger.Init(cfg.Env); err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer zap.L().Sync()

	zap.L().Info("Configuration loaded", zap.String("env", cfg.Env), zap.String("port", cfg.APIPort))

	ch, err := clickhouse.New(cfg)
	if err != nil {
		zap.L().Fatal("Failed to create ClickHouse client", zap.Error(err))
	}
	defer ch.Close()

	if cfg.ContractWETH != "" {
		if err := ch.SeedWETH(context.Background(), cfg.ContractWETH); err != nil {
			zap.L().Warn("Failed to seed WETH token metadata", zap.Error(err))
		}
	}

	s3Client, err := storage.NewS3Client(cfg)
	if err != nil {
		zap.L().Fatal("Failed to create S3 client", zap.Error(err))
	}

	if err := storage.EnsureBucket(context.Background(), s3Client, cfg); err != nil {
		zap.L().Fatal("Failed to ensure S3 bucket", zap.Error(err))
	}

	ethClient, err := ethclient.Dial(cfg.NodeRPCURL)
	if err != nil {
		zap.L().Fatal("Failed to connect to EVM RPC node", zap.Error(err))
	}
	defer ethClient.Close()

	app := fiber.New(fiber.Config{
		ErrorHandler: response.ErrorHandler,
		AppName:      cfg.APIID,
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.AllowedOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
	}))

	app.Use(middleware.RequestID())
	app.Use(middleware.RequestLogger())

	pricer := service.NewPricer(cfg, ch)

	dexSvc := service.NewDEXService(ch, cfg, pricer)
	dexHandler := api.NewDEXHandler(cfg, dexSvc)
	dexHandler.RegisterRoutes(app)

	tokenSvc := sharedservice.NewTokenService(cfg, ch, s3Client, ethClient)
	tokenHandler := sharedapi.NewTokenHandler(tokenSvc)
	tokenHandler.RegisterRoutes(app)

	configHandler := api.NewConfigHandler(cfg)
	app.Get("/api/config", configHandler.GetConfig)

	analyticsSvc := service.NewAnalyticsService(ch, pricer)
	analyticsHandler := api.NewAnalyticsHandler(analyticsSvc)
	analyticsHandler.RegisterRoutes(app)

	stakingSvc := service.NewStakingService(cfg, ethClient, ch, pricer)
	stakingHandler := api.NewStakingHandler(stakingSvc)
	stakingHandler.RegisterRoutes(app)

	historySvc := service.NewHistoryService(ch)
	historyHandler := api.NewHistoryHandler(historySvc)
	historyHandler.RegisterRoutes(app)

	wsHandler := api.NewWSHandler()
	wsHandler.RegisterRoutes(app)

	hub := ws.GetHub()
	go hub.Run()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		zap.L().Info("API server starting", zap.String("port", cfg.APIPort))
		if err := app.Listen(":" + cfg.APIPort); err != nil {
			zap.L().Fatal("Server failed", zap.Error(err))
		}
	}()

	<-ctx.Done()
	zap.L().Info("Shutting down API server...")

	if err := app.Shutdown(); err != nil {
		zap.L().Error("Server forced to shutdown", zap.Error(err))
	}

	zap.L().Info("API server stopped")
}
