package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math/big"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/ethclient"
	"go.uber.org/zap"

	"defi-amm-dex/internal/clickhouse"
	"defi-amm-dex/internal/config"
	"defi-amm-dex/internal/dbquery"
	"defi-amm-dex/internal/dto"
	"defi-amm-dex/pkg/logger"
)

type TokenServicer interface {
	RegisterToken(ctx context.Context, tokenAddrStr string, logoFile io.Reader, filename string, contentType string) (*dto.TokenResponse, error)
}

type TokenService struct {
	cfg       *config.Config
	chClient  *clickhouse.Client
	s3Client  *s3.Client
	ethClient *ethclient.Client
}

func NewTokenService(cfg *config.Config, chClient *clickhouse.Client, s3Client *s3.Client, ethClient *ethclient.Client) *TokenService {
	return &TokenService{
		cfg:       cfg,
		chClient:  chClient,
		s3Client:  s3Client,
		ethClient: ethClient,
	}
}

func (s *TokenService) RegisterToken(ctx context.Context, tokenAddrStr string, logoFile io.Reader, filename string, contentType string) (*dto.TokenResponse, error) {
	tokenAddr := common.HexToAddress(tokenAddrStr)

	// Fetch token metadata from blockchain
	name, symbol, decimals, err := s.fetchTokenMetadata(ctx, tokenAddr)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to fetch token metadata from EVM chain", zap.String("address", tokenAddr.Hex()), zap.Error(err))
		return nil, fmt.Errorf("failed to fetch token metadata: %w", err)
	}

	// Read file bytes with size limit (10MB)
	const maxLogoSize = 10 << 20
	limitedReader := io.LimitReader(logoFile, maxLogoSize+1)
	fileBytes, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read logo file: %w", err)
	}
	if len(fileBytes) > maxLogoSize {
		return nil, fmt.Errorf("logo file too large, maximum 10MB")
	}

	ext := filepath.Ext(filename)
	if ext == "" {
		if strings.Contains(contentType, "svg") {
			ext = ".svg"
		} else if strings.Contains(contentType, "png") {
			ext = ".png"
		} else {
			ext = ".png"
		}
	}

	objectKey := fmt.Sprintf("tokens/%s%s", strings.ToLower(tokenAddr.Hex()), ext)

	_, err = s.s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.cfg.S3Bucket),
		Key:           aws.String(objectKey),
		Body:          bytes.NewReader(fileBytes),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(int64(len(fileBytes))),
		ACL:           types.ObjectCannedACLPublicRead,
	})
	if err != nil {
		logger.Ctx(ctx).Error("Failed to upload token logo to S3", zap.Error(err))
		return nil, fmt.Errorf("failed to upload logo to storage: %w", err)
	}

	base := strings.TrimSuffix(s.cfg.S3PublicURL, "/")
	var logoURL string
	if strings.Contains(base, s.cfg.S3Bucket) {
		logoURL = fmt.Sprintf("%s/%s", base, objectKey)
	} else {
		logoURL = fmt.Sprintf("%s/%s/%s", base, s.cfg.S3Bucket, objectKey)
	}

	// Insert into ClickHouse tokens table
	conn := s.chClient.Conn()
	err = conn.Exec(ctx, dbquery.InsertToken,
		strings.ToLower(tokenAddr.Hex()),
		symbol,
		name,
		decimals,
		logoURL,
	)
	if err != nil {
		logger.Ctx(ctx).Error("Failed to save token to database", zap.Error(err))
		return nil, fmt.Errorf("failed to save token to database: %w", err)
	}

	logger.Ctx(ctx).Info("Successfully registered token logo",
		zap.String("address", tokenAddr.Hex()),
		zap.String("symbol", symbol),
		zap.String("logo_url", logoURL),
	)

	return &dto.TokenResponse{
		Address:  tokenAddr.Hex(),
		Symbol:   symbol,
		Name:     name,
		Decimals: decimals,
		LogoURL:  logoURL,
	}, nil
}

func (s *TokenService) fetchTokenMetadata(ctx context.Context, tokenAddr common.Address) (string, string, uint8, error) {
	// Call symbol() - Keccak256 hash "symbol()" -> 0x95d89b41
	symbolData, err := s.callContract(ctx, tokenAddr, "0x95d89b41")
	if err != nil {
		return "", "", 0, fmt.Errorf("symbol call failed: %w", err)
	}
	symbol, err := parseABIString(symbolData)
	if err != nil {
		return "", "", 0, fmt.Errorf("failed to parse symbol: %w", err)
	}

	// Call name() - Keccak256 hash "name()" -> 0x06fdde03
	nameData, err := s.callContract(ctx, tokenAddr, "0x06fdde03")
	if err != nil {
		return "", "", 0, fmt.Errorf("name call failed: %w", err)
	}
	name, err := parseABIString(nameData)
	if err != nil {
		return "", "", 0, fmt.Errorf("failed to parse name: %w", err)
	}

	// Call decimals() - Keccak256 hash "decimals()" -> 0x313ce567
	decimalsData, err := s.callContract(ctx, tokenAddr, "0x313ce567")
	if err != nil {
		return "", "", 0, fmt.Errorf("decimals call failed: %w", err)
	}
	if len(decimalsData) < 32 {
		return "", "", 0, fmt.Errorf("decimals returns invalid length data")
	}
	decimals := decimalsData[31]

	return name, symbol, decimals, nil
}

func (s *TokenService) callContract(ctx context.Context, to common.Address, dataHex string) ([]byte, error) {
	data, err := hexutil.Decode(dataHex)
	if err != nil {
		return nil, err
	}

	msg := ethereum.CallMsg{
		To:   &to,
		Data: data,
	}

	return s.ethClient.CallContract(ctx, msg, nil)
}

func parseABIString(data []byte) (string, error) {
	if len(data) < 64 {
		return "", fmt.Errorf("data too short: %d bytes", len(data))
	}
	offset := big.NewInt(0).SetBytes(data[0:32]).Uint64()
	if offset+32 > uint64(len(data)) {
		return "", fmt.Errorf("offset out of bounds: %d", offset)
	}
	length := big.NewInt(0).SetBytes(data[offset : offset+32]).Uint64()
	if offset+32+length > uint64(len(data)) {
		return "", fmt.Errorf("length out of bounds: %d", length)
	}
	return string(data[offset+32 : offset+32+length]), nil
}
