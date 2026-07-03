package config

import (
	"fmt"
	"reflect"

	"github.com/spf13/viper"
	"go.uber.org/zap"

	"defi-amm-dex/pkg/constants"
)

type Config struct {
	APIID   string `mapstructure:"API_ID"`
	APIPort string `mapstructure:"API_PORT"`
	Env     string `mapstructure:"API_ENV"`

	ClickHouseHost     string `mapstructure:"CLICKHOUSE_HOST"`
	ClickHousePort     string `mapstructure:"CLICKHOUSE_PORT"`
	ClickHouseDB       string `mapstructure:"CLICKHOUSE_DB"`
	ClickHouseUser     string `mapstructure:"CLICKHOUSE_USER"`
	ClickHousePassword string `mapstructure:"CLICKHOUSE_PASSWORD"`

	NodeRPCURL  string `mapstructure:"NODE_RPC_URL"`
	ChainRPCURL string `mapstructure:"CHAIN_RPC_URL"`
	ChainID     int    `mapstructure:"CHAIN_ID"`
	ChainName   string `mapstructure:"CHAIN_NAME"`
	ExplorerURL string `mapstructure:"EXPLORER_URL"`

	ContractV2AMM    string `mapstructure:"CONTRACT_V2_AMM"`
	ContractV2Router string `mapstructure:"CONTRACT_V2_ROUTER"`
	ContractWETH       string `mapstructure:"CONTRACT_WETH"`
	ContractStaking  string `mapstructure:"CONTRACT_STAKING"`
	ContractGovernor string `mapstructure:"CONTRACT_GOVERNOR"`

	StablecoinAddress   string `mapstructure:"STABLECOIN_ADDRESS"`

	IndexerSyncInterval int    `mapstructure:"INDEXER_SYNC_INTERVAL"`
	IndexerBatchSize    int    `mapstructure:"INDEXER_BATCH_SIZE"`
	AllowedOrigins      string `mapstructure:"ALLOWED_ORIGINS"`

	S3Endpoint      string `mapstructure:"S3_ENDPOINT"`
	S3Region        string `mapstructure:"S3_REGION"`
	S3AccessKey     string `mapstructure:"S3_ACCESS_KEY"`
	S3SecretKey     string `mapstructure:"S3_SECRET_KEY"`
	S3Bucket        string `mapstructure:"S3_BUCKET"`
	S3PublicURL     string `mapstructure:"S3_PUBLIC_URL"`
	S3AdminEndpoint string `mapstructure:"S3_ADMIN_ENDPOINT"`
	S3AdminToken    string `mapstructure:"S3_ADMIN_TOKEN"`
}

func (c *Config) IsDev() bool {
	return c.Env == constants.EnvDevelopment
}

func Load() (*Config, error) {
	viper.SetConfigFile(".env")
	viper.AutomaticEnv()

	bindEnvs(Config{})

	if err := viper.ReadInConfig(); err != nil {
		zap.L().Warn("No .env file found or error reading it, using environment variables only", zap.Error(err))
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		zap.L().Error("Failed to unmarshal config", zap.Error(err))
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	if cfg.IsDev() {
		cfg.ChainID = 31337
		cfg.NodeRPCURL = "http://anvil-node:8545"
		cfg.ChainRPCURL = "http://127.0.0.1:8545"
		cfg.ChainName = "Hardhat"
		cfg.ExplorerURL = "http://localhost:5100"
		cfg.ContractGovernor = "0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F"
		cfg.S3Endpoint = "http://garage:3900"
		cfg.S3Region = "garage"
		cfg.S3Bucket = "defi-dex-tokens"
		cfg.S3PublicURL = "http://defi-dex-tokens.web.localhost:3902"
		cfg.S3AdminEndpoint = "http://garage:3903"
		cfg.S3AdminToken = "supersecretadmintoken"
	}

	return &cfg, nil
}

func bindEnvs(iface interface{}) {
	t := reflect.TypeOf(iface)

	for i := 0; i < t.NumField(); i++ {
		tag := t.Field(i).Tag.Get("mapstructure")
		if tag != "" {
			viper.BindEnv(tag)
		}
	}
}
