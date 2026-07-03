package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.uber.org/zap"

	"defi-amm-dex/internal/config"
)

func NewS3Client(cfg *config.Config) (*s3.Client, error) {
	region := cfg.S3Region
	if region == "" {
		region = "us-east-1"
	}

	awsCfg := aws.Config{
		Credentials: credentials.NewStaticCredentialsProvider(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		Region:      region,
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.S3Endpoint)
		o.UsePathStyle = true
	})

	return client, nil
}

func ensureBucketViaAdminAPI(ctx context.Context, cfg *config.Config) error {
	adminEndpoint := cfg.S3AdminEndpoint
	adminToken := cfg.S3AdminToken

	client := &http.Client{Timeout: 5 * time.Second}
	var bucketID string

	type bucketInfo struct {
		ID string `json:"id"`
	}

	// Check if bucket exists
	infoURL := fmt.Sprintf("%s/v2/GetBucketInfo?globalAlias=%s", adminEndpoint, cfg.S3Bucket)
	req, err := http.NewRequestWithContext(ctx, "GET", infoURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create get bucket info request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)

	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			var info bucketInfo
			if err := json.NewDecoder(resp.Body).Decode(&info); err == nil && info.ID != "" {
				bucketID = info.ID
				zap.L().Info("Found existing bucket ID via Admin API", zap.String("bucket", cfg.S3Bucket), zap.String("id", bucketID))
			}
		}
	} else {
		zap.L().Warn("Failed to check bucket existence via Admin API", zap.Error(err))
	}

	// If bucket was not found, create it
	if bucketID == "" {
		createURL := fmt.Sprintf("%s/v2/CreateBucket", adminEndpoint)
		createBody, err := json.Marshal(map[string]string{
			"globalAlias": cfg.S3Bucket,
		})
		if err != nil {
			return fmt.Errorf("failed to marshal create bucket request: %w", err)
		}

		req, err = http.NewRequestWithContext(ctx, "POST", createURL, bytes.NewReader(createBody))
		if err != nil {
			return fmt.Errorf("failed to create http request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err = client.Do(req)
		if err != nil {
			return fmt.Errorf("failed to send create bucket request to admin API: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
			return fmt.Errorf("admin API returned status %d while creating bucket", resp.StatusCode)
		}

		var info bucketInfo
		if err := json.NewDecoder(resp.Body).Decode(&info); err != nil || info.ID == "" {
			return fmt.Errorf("failed to parse bucket ID from create response: %w", err)
		}
		bucketID = info.ID
		zap.L().Info("Created new bucket via Admin API", zap.String("bucket", cfg.S3Bucket), zap.String("id", bucketID))
	}

	// Allow Bucket Key
	allowURL := fmt.Sprintf("%s/v2/AllowBucketKey", adminEndpoint)
	type Perms struct {
		Read  bool `json:"read"`
		Write bool `json:"write"`
		Owner bool `json:"owner"`
	}
	type AllowKeyReq struct {
		BucketID    string `json:"bucketId"`
		AccessKeyID string `json:"accessKeyId"`
		Permissions Perms  `json:"permissions"`
	}

	allowReqBody := AllowKeyReq{
		BucketID:    bucketID,
		AccessKeyID: cfg.S3AccessKey,
		Permissions: Perms{
			Read:  true,
			Write: true,
			Owner: true,
		},
	}
	allowBody, err := json.Marshal(allowReqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal allow key request: %w", err)
	}

	req, err = http.NewRequestWithContext(ctx, "POST", allowURL, bytes.NewReader(allowBody))
	if err != nil {
		return fmt.Errorf("failed to create allow key http request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err = client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send allow key request to admin API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("admin API returned status %d while granting permissions", resp.StatusCode)
	}

	zap.L().Info("S3 bucket created/verified and permissions granted via Admin API", zap.String("bucket", cfg.S3Bucket))
	return nil
}

func EnsureBucket(ctx context.Context, client *s3.Client, cfg *config.Config) error {
	if cfg.IsDev() && cfg.S3AdminEndpoint != "" && cfg.S3AdminToken != "" {
		zap.L().Info("Development mode detected, provisioning bucket via Garage Admin API", zap.String("bucket", cfg.S3Bucket), zap.String("endpoint", cfg.S3AdminEndpoint))
		if err := ensureBucketViaAdminAPI(ctx, cfg); err != nil {
			zap.L().Warn("Failed to provision bucket via Admin API, falling back to standard S3 client", zap.Error(err))
		}
	}

	_, err := client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(cfg.S3Bucket),
	})
	if err != nil {
		zap.L().Error("Failed to check bucket existence/permissions", zap.String("bucket", cfg.S3Bucket), zap.Error(err))
		return fmt.Errorf("failed to check bucket existence: %w", err)
	}

	zap.L().Info("S3 bucket already exists and is accessible", zap.String("bucket", cfg.S3Bucket))
	return nil
}
