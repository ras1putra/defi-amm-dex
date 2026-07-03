package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"go.uber.org/zap"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/config"
	"defi-amm-dex/internal/v2/indexer"
	customlogger "defi-amm-dex/pkg/logger"
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

	zap.L().Info("Indexer starting", zap.String("env", cfg.Env))

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

	idx := indexer.New(cfg, ch)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := idx.Start(ctx); err != nil {
		zap.L().Fatal("Indexer failed", zap.Error(err))
	}

	zap.L().Info("Indexer stopped")
}
