import { useMemo } from "react";
import type { TokenOption, ApiToken } from "@/types/dex";

export function mergeTokens(
  apiTokens: ApiToken[],
  customTokens: TokenOption[],
  wethToken?: TokenOption,
): TokenOption[] {
  const list: TokenOption[] = [];
  const seen = new Set<string>();

  const add = (t: TokenOption) => {
    const addr = t.address.toLowerCase();
    if (!seen.has(addr)) {
      seen.add(addr);
      list.push(t);
    }
  };

  if (wethToken) add(wethToken);

  for (const t of apiTokens) {
    add({
      address: t.address as `0x${string}`,
      symbol: t.symbol,
      decimals: t.decimals,
      name: t.name,
      logo: t.logo_url || undefined,
    });
  }

  for (const t of customTokens) {
    add(t);
  }

  return list;
}

export function filterTokens(tokens: TokenOption[], search: string): TokenOption[] {
  const q = search.toLowerCase().trim();
  if (!q) return tokens;
  return tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.address.toLowerCase() === q,
  );
}

export function useTokenList(
  apiTokens: ApiToken[] | undefined,
  customTokens: TokenOption[],
  wethToken: TokenOption | undefined,
  search: string,
) {
  return useMemo(() => {
    const merged = mergeTokens(apiTokens ?? [], customTokens, wethToken);
    return filterTokens(merged, search);
  }, [apiTokens, customTokens, wethToken, search]);
}
