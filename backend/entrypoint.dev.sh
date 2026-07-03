#!/bin/sh
# Dev entrypoint: load contract addresses and S3 credentials from shared volumes if available

DEX_ENV_FILE="/shared/.dex.addresses"
S3_ENV_FILE="/shared_s3/.s3.credentials"

if [ -f "$DEX_ENV_FILE" ]; then
  echo "Loading DEX addresses from $DEX_ENV_FILE"
  while IFS='=' read -r key value || [ -n "$key" ]; do
    if [ -n "$key" ] && [ -n "$value" ]; then
      export "$key=$value"
      echo "  $key=$value"
    fi
  done < "$DEX_ENV_FILE"

  # Map deploy script vars to backend config vars
  export CONTRACT_V2_AMM="$CONTRACT_V2_FACTORY"
  export CONTRACT_V2_ROUTER="${CONTRACT_V2_ROUTER:-}"
  export STABLECOIN_ADDRESS="$CONTRACT_DEX_USDC"
fi

if [ -f "$S3_ENV_FILE" ]; then
  echo "Loading S3 credentials from $S3_ENV_FILE"
  while IFS='=' read -r key value || [ -n "$key" ]; do
    if [ -n "$key" ] && [ -n "$value" ]; then
      export "$key=$value"
      echo "  $key=******"
    fi
  done < "$S3_ENV_FILE"
fi

# Run the app with hot-reload (Air)
if [ "$APP_MODE" = "indexer" ]; then
  exec air -c .air.indexer.toml
else
  exec air -c .air.toml
fi
