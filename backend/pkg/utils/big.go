package utils

import "math/big"

// ToSignedBig converts a big-endian byte slice to a signed big.Int (two's complement 256-bit).
func ToSignedBig(b []byte) *big.Int {
	res := new(big.Int).SetBytes(b)
	if len(b) > 0 && b[0]&0x80 != 0 {
		limit := new(big.Int).Lsh(big.NewInt(1), 256)
		res.Sub(res, limit)
	}
	return res
}
