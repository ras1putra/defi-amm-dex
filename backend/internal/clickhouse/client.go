package clickhouse

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"go.uber.org/zap"

	"defi-amm-dex/internal/config"
)

type Client struct {
	conn clickhouse.Conn
	db   string
}

func New(cfg *config.Config) (*Client, error) {
	addr := fmt.Sprintf("%s:%s", cfg.ClickHouseHost, cfg.ClickHousePort)
	
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDB,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
		DialContext: func(ctx context.Context, addr string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "tcp", addr)
		},
		ConnMaxLifetime: time.Hour,
		MaxOpenConns:    10,
		MaxIdleConns:    5,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to clickhouse: %w", err)
	}

	zap.L().Info("ClickHouse client configured",
		zap.String("addr", addr),
		zap.String("db", cfg.ClickHouseDB),
	)

	return &Client{
		conn: conn,
		db:   cfg.ClickHouseDB,
	}, nil
}

func (c *Client) Conn() clickhouse.Conn {
	return c.conn
}

func (c *Client) DB() string {
	return c.db
}

func (c *Client) Ping(ctx context.Context) error {
	if err := c.conn.Ping(ctx); err != nil {
		return fmt.Errorf("clickhouse ping failed: %w", err)
	}
	return nil
}

func (c *Client) Close() error {
	if err := c.conn.Close(); err != nil {
		return fmt.Errorf("failed to close clickhouse connection: %w", err)
	}
	zap.L().Info("ClickHouse client closed")
	return nil
}

func (c *Client) SeedWETH(ctx context.Context, wethAddress string) error {
	rows, err := c.conn.Query(ctx, "SELECT count() FROM tokens FINAL WHERE address = ?", wethAddress)
	if err != nil {
		return err
	}
	defer rows.Close()

	var count uint64
	if rows.Next() {
		if err := rows.Scan(&count); err != nil {
			return err
		}
	}

	if count == 0 {
		zap.L().Info("Seeding WETH token metadata into ClickHouse", zap.String("address", wethAddress))
		err := c.conn.Exec(ctx, "INSERT INTO tokens (address, symbol, name, decimals, logo_url) VALUES (?, ?, ?, ?, ?)",
			wethAddress,
			"WETH",
			"Wrapped Ether",
			uint8(18),
			"",
		)
		if err != nil {
			return err
		}
	}
	return nil
}
