package service

import (
	"context"
	"fmt"
	"strings"

	"go.uber.org/zap"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/v2/dto"
	"defi-amm-dex/pkg/logger"
)

type HistoryServicer interface {
	GetTxHistory(ctx context.Context, address string, txType string, page, pageSize int) (*dto.TxHistoryResponse, error)
}

type HistoryService struct {
	ch *clickhouse.Client
}

func NewHistoryService(ch *clickhouse.Client) *HistoryService {
	return &HistoryService{ch: ch}
}

func (s *HistoryService) GetTxHistory(ctx context.Context, address string, txType string, page, pageSize int) (*dto.TxHistoryResponse, error) {
	address = strings.ToLower(address)

	offset := (page - 1) * pageSize

	var countQuery string
	var dataQuery string
	var countArgs []interface{}
	var dataArgs []interface{}

	switch txType {
	case "swap":
		countQuery = "SELECT count() FROM swaps WHERE user_address = ? AND tx_type = 'swap'"
		dataQuery = `
			SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, pool_id, sender, amount0, amount1, usd_value
			FROM swaps
			WHERE user_address = ? AND tx_type = 'swap'
			ORDER BY ts DESC LIMIT ? OFFSET ?
		`
		countArgs = []interface{}{address}
		dataArgs = []interface{}{address, pageSize, offset}
	case "liquidity":
		countQuery = "SELECT count() FROM liquidity_events WHERE user_address = ?"
		dataQuery = `
			SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, pool_id, sender, amount0, amount1, usd_value
			FROM liquidity_events
			WHERE user_address = ?
			ORDER BY ts DESC LIMIT ? OFFSET ?
		`
		countArgs = []interface{}{address}
		dataArgs = []interface{}{address, pageSize, offset}
	case "staking":
		countQuery = "SELECT count() FROM staking_events WHERE user_address = ?"
		dataQuery = `
			SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, toString(pool_id) AS pool_id, user_address AS sender, amount AS amount0, reward_amount AS amount1, usd_value
			FROM staking_events
			WHERE user_address = ?
			ORDER BY ts DESC LIMIT ? OFFSET ?
		`
		countArgs = []interface{}{address}
		dataArgs = []interface{}{address, pageSize, offset}
	case "governance":
		countQuery = "SELECT count() FROM governance_events WHERE user_address = ?"
		dataQuery = `
			SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, proposal_id AS pool_id, user_address AS sender, support AS amount0, weight AS amount1, usd_value
			FROM governance_events
			WHERE user_address = ?
			ORDER BY ts DESC LIMIT ? OFFSET ?
		`
		countArgs = []interface{}{address}
		dataArgs = []interface{}{address, pageSize, offset}
	default:
		countQuery = `
			SELECT count() FROM (
				SELECT tx_hash FROM swaps WHERE user_address = ?
				UNION ALL
				SELECT tx_hash FROM liquidity_events WHERE user_address = ?
				UNION ALL
				SELECT tx_hash FROM staking_events WHERE user_address = ?
				UNION ALL
				SELECT tx_hash FROM governance_events WHERE user_address = ?
			)
		`
		dataQuery = `
			SELECT tx_hash, ts, tx_type, pool_id, sender, amount0, amount1, usd_value FROM (
				SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, pool_id, sender, amount0, amount1, usd_value FROM swaps WHERE user_address = ?
				UNION ALL
				SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, pool_id, sender, amount0, amount1, usd_value FROM liquidity_events WHERE user_address = ?
				UNION ALL
				SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, toString(pool_id) AS pool_id, user_address AS sender, amount AS amount0, reward_amount AS amount1, usd_value FROM staking_events WHERE user_address = ?
				UNION ALL
				SELECT tx_hash, toUnixTimestamp(timestamp) AS ts, tx_type, proposal_id AS pool_id, user_address AS sender, support AS amount0, weight AS amount1, usd_value FROM governance_events WHERE user_address = ?
			) AS combined
			ORDER BY ts DESC LIMIT ? OFFSET ?
		`
		countArgs = []interface{}{address, address, address, address}
		dataArgs = []interface{}{address, address, address, address, pageSize, offset}
	}

	// Count total
	var total uint64
	if err := s.ch.Conn().QueryRow(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		logger.Ctx(ctx).Error("Failed to count tx history", zap.Error(err))
		return nil, fmt.Errorf("failed to count tx history: %w", err)
	}

	rows, err := s.ch.Conn().Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to query tx history", zap.Error(err))
		return nil, fmt.Errorf("failed to query tx history: %w", err)
	}
	defer rows.Close()

	items := make([]dto.TxHistoryItem, 0)
	for rows.Next() {
		var item dto.TxHistoryItem
		if err := rows.Scan(&item.TxHash, &item.Timestamp, &item.TxType, &item.PoolID, &item.Sender, &item.Amount0, &item.Amount1, &item.USDValue); err != nil {
			logger.Ctx(ctx).Error("Failed to scan tx history row", zap.Error(err))
			continue
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		logger.Ctx(ctx).Error("Error iterating tx history rows", zap.Error(err))
		return nil, fmt.Errorf("error iterating tx history: %w", err)
	}

	totalInt := int(total)
	totalPages := totalInt / pageSize
	if totalInt%pageSize > 0 {
		totalPages++
	}

	return &dto.TxHistoryResponse{
		Items:      items,
		Total:      totalInt,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}
