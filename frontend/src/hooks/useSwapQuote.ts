import { useMemo } from "react";
import { getRouteOptions, parseAmount } from "@/lib/amm";
import { usePairs } from "./usePairs";
import type { RouteOption } from "@/types/dex";
import type { TokenOption } from "@/types/dex";

interface UseSwapQuoteParams {
  tokenIn: TokenOption | null;
  tokenOut: TokenOption | null;
  amountIn: string;
}

export type QuoteErrorType = "none" | "pool_uninitialized" | "exceeds_liquidity";

export const QUOTE_ERROR = {
  NONE: "none",
  POOL_UNINITIALIZED: "pool_uninitialized",
  EXCEEDS_LIQUIDITY: "exceeds_liquidity",
} as const satisfies Record<string, QuoteErrorType>;

export function useSwapQuote({ tokenIn, tokenOut, amountIn }: UseSwapQuoteParams) {
  const { data: pairs = [], isLoading: pairsLoading } = usePairs();

  const parsedIn = amountIn && tokenIn && Number(amountIn) > 0
    ? parseAmount(amountIn, tokenIn.decimals)
    : 0n;

  const routeOptions = useMemo(() => {
    if (!tokenIn || !tokenOut || pairs.length === 0 || parsedIn <= 0n) return [];
    return getRouteOptions(tokenIn.address, tokenOut.address, parsedIn, pairs);
  }, [tokenIn, tokenOut, parsedIn, pairs]);

  const formattedOptions: (RouteOption & { amountOutFormatted: number })[] = useMemo(() => {
    if (!tokenOut) return routeOptions.map((o) => ({ ...o, amountOutFormatted: 0 }));
    return routeOptions.map((opt) => ({
      ...opt,
      amountOutFormatted: Number(opt.amountOut) / 10 ** tokenOut.decimals,
    }));
  }, [routeOptions, tokenOut]);

  const routeExists = formattedOptions.length > 0;

  let quoteError: QuoteErrorType = QUOTE_ERROR.NONE;
  if (parsedIn > 0n && !routeExists && !pairsLoading) {
    quoteError = QUOTE_ERROR.POOL_UNINITIALIZED;
  }

  return {
    routeExists,
    routeOptions: formattedOptions,
    isLoading: pairsLoading,
    quoteError,
  };
}
