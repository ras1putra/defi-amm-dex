package utils

import (
	"context"
	"fmt"
	"math"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// CallContract makes a read-only call to an EVM contract using an ethclient.Client
func CallContract(ctx context.Context, client *ethclient.Client, to common.Address, dataHex string) ([]byte, error) {
	if strings.HasPrefix(dataHex, "0x") {
		dataHex = dataHex[2:]
	}
	data := common.Hex2Bytes(dataHex)

	msg := ethereum.CallMsg{
		To:   &to,
		Data: data,
	}

	return client.CallContract(ctx, msg, nil)
}

// ParseABIString parses a standard ABI-encoded string response from an EVM contract call
func ParseABIString(data []byte) (string, error) {
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

// WeiToFloat64 converts a wei value (big.Int) to a float64
func WeiToFloat64(v *big.Int) float64 {
	if v == nil {
		return 0
	}
	f := new(big.Float).SetInt(v)
	denom := new(big.Float).SetFloat64(1e18)
	f.Quo(f, denom)
	result, _ := f.Float64()
	return result
}

// WeiToDecimal converts a wei value (big.Int) to a decimal string representation with 6 decimal places
func WeiToDecimal(v *big.Int) string {
	if v == nil || v.Sign() == 0 {
		return "0"
	}
	f := new(big.Float).SetInt(v)
	denom := new(big.Float).SetFloat64(1e18)
	f.Quo(f, denom)
	return f.Text('f', 6)
}

// TokenToDecimal converts a token amount (big.Int) to a decimal string representation with dynamic decimals and 6 decimal places.
func TokenToDecimal(v *big.Int, decimals uint8) string {
	if v == nil || v.Sign() == 0 {
		return "0"
	}
	f := new(big.Float).SetInt(v)
	denom := new(big.Float).SetFloat64(math.Pow(10, float64(decimals)))
	f.Quo(f, denom)
	return f.Text('f', 6)
}

// WeiStringToDecimal converts a string representation of a Wei value to a decimal string representation with 6 decimal places.
func WeiStringToDecimal(weiStr string) string {
	bi, ok := new(big.Int).SetString(weiStr, 10)
	if !ok {
		return "0"
	}
	return WeiToDecimal(bi)
}

// FormatWei returns the string representation of a wei value
func FormatWei(v *big.Int) string {
	if v == nil {
		return "0"
	}
	return v.String()
}

// ShortAddr returns an abbreviated string representation of an Ethereum address (e.g. "..abcd")
func ShortAddr(addr common.Address) string {
	h := addr.Hex()
	return ".." + h[len(h)-4:]
}

// VerifySignature recovers the signer's address from an EIP-191 personal sign signature and verifies it matches the expected address.
func VerifySignature(addressStr string, message string, signatureHex string) (bool, error) {
	address := common.HexToAddress(addressStr)

	sig, err := hexutil.Decode(signatureHex)
	if err != nil {
		return false, fmt.Errorf("invalid signature hex: %w", err)
	}

	if len(sig) != 65 {
		return false, fmt.Errorf("signature length must be 65 bytes")
	}

	if sig[64] >= 27 {
		sig[64] -= 27
	}

	prefix := fmt.Sprintf("\x19Ethereum Signed Message:\n%d", len(message))
	hash := crypto.Keccak256Hash([]byte(prefix + message))

	pubKey, err := crypto.SigToPub(hash.Bytes(), sig)
	if err != nil {
		return false, fmt.Errorf("failed to recover public key: %w", err)
	}

	recoveredAddr := crypto.PubkeyToAddress(*pubKey)
	return strings.ToLower(recoveredAddr.Hex()) == strings.ToLower(address.Hex()), nil
}
