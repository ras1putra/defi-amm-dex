package dto

import (
	"errors"
	"strings"

	"github.com/ethereum/go-ethereum/common"
)

type RegisterTokenRequest struct {
	Address string `json:"address"`
}

func (r *RegisterTokenRequest) Validate() error {
	if r.Address == "" {
		return errors.New("address is required")
	}
	r.Address = strings.TrimSpace(r.Address)
	if !common.IsHexAddress(r.Address) {
		return errors.New("invalid ethereum address")
	}
	return nil
}

type TokenResponse struct {
	Address  string `json:"address"`
	Symbol   string `json:"symbol"`
	Name     string `json:"name"`
	Decimals uint8  `json:"decimals"`
	LogoURL  string `json:"logo_url"`
}
