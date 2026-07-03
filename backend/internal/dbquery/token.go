package dbquery

const (
	// InsertToken inserts or updates a token metadata record
	InsertToken = `
		INSERT INTO tokens (address, symbol, name, decimals, logo_url)
		VALUES (?, ?, ?, ?, ?)
	`

	// SelectTokens fetches all tokens from database
	SelectTokens = `
		SELECT address, symbol, name, decimals, logo_url FROM tokens FINAL
	`

	// SelectTokensPaginated fetches tokens matching search with limit and offset
	SelectTokensPaginated = `
		SELECT address, symbol, name, decimals, logo_url
		FROM tokens FINAL
		WHERE (? = '' OR lower(symbol) LIKE ? OR lower(name) LIKE ? OR lower(address) = ?)
		ORDER BY address ASC
		LIMIT ? OFFSET ?
	`
)
