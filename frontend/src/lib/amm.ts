import { parseUnits } from "viem";
import { SWAP_DEADLINE_MINUTES, SWAP_FEE, SWAP_FEE_DENOM, MAX_ROUTE_DEPTH, BASE_QUOTE_ASSETS } from "./constants";
import type { RouteOption } from "@/types/dex";

export function isBaseAsset(symbol: string): boolean {
  const sym = symbol.toUpperCase();
  return (BASE_QUOTE_ASSETS as readonly string[]).includes(sym);
}

interface PairLike {
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  decimals0: number;
  decimals1: number;
}

export function minAmountOut(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n;
}

export function parseAmount(amount: string, decimals: number): bigint {
  try {
    return parseUnits(amount as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

export function swapDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 60 * SWAP_DEADLINE_MINUTES);
}

export function findAllSwapRoutes(
  tokenIn: string,
  tokenOut: string,
  pairs: { token0: string; token1: string }[],
  maxDepth: number = MAX_ROUTE_DEPTH,
): string[][] {
  const inAddr = tokenIn.toLowerCase();
  const outAddr = tokenOut.toLowerCase();

  if (inAddr === outAddr) return [[inAddr]];

  const adj: Record<string, string[]> = {};
  for (const p of pairs) {
    const t0 = p.token0.toLowerCase();
    const t1 = p.token1.toLowerCase();
    if (!adj[t0]) adj[t0] = [];
    if (!adj[t1]) adj[t1] = [];
    if (!adj[t0].includes(t1)) adj[t0].push(t1);
    if (!adj[t1].includes(t0)) adj[t1].push(t0);
  }

  const results: string[][] = [];
  const queue: [string, string[]][] = [[inAddr, [inAddr]]];

  while (queue.length > 0) {
    const [node, path] = queue.shift()!;

    if (path.length - 1 >= maxDepth) continue;

    for (const neighbor of adj[node] || []) {
      if (path.includes(neighbor)) continue;

      if (neighbor === outAddr) {
        results.push([...path, neighbor]);
        continue;
      }

      queue.push([neighbor, [...path, neighbor]]);
    }
  }

  return results;
}

export function simulateRoute(
  route: string[],
  amountIn: bigint,
  pairs: { token0: string; token1: string; reserve0: string; reserve1: string }[],
): bigint | null {
  if (route.length < 2 || amountIn <= 0n) return null;

  let currentAmount = amountIn;

  for (let i = 0; i < route.length - 1; i++) {
    const inAddr = route[i].toLowerCase();
    const outAddr = route[i + 1].toLowerCase();

    const pair = pairs.find(
      (p) =>
        (p.token0.toLowerCase() === inAddr && p.token1.toLowerCase() === outAddr) ||
        (p.token0.toLowerCase() === outAddr && p.token1.toLowerCase() === inAddr),
    );
    if (!pair) return null;

    const isToken0In = pair.token0.toLowerCase() === inAddr;
    const reserveIn = BigInt(isToken0In ? pair.reserve0 : pair.reserve1);
    const reserveOut = BigInt(isToken0In ? pair.reserve1 : pair.reserve0);

    if (reserveIn === 0n || reserveOut === 0n) return null;

    const amountInWithFee = currentAmount * SWAP_FEE;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * SWAP_FEE_DENOM + amountInWithFee;
    currentAmount = numerator / denominator;
  }

  return currentAmount;
}

export function getRouteOptions(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  pairs: PairLike[],
  maxDepth: number = MAX_ROUTE_DEPTH,
): RouteOption[] {
  if (amountIn <= 0n) return [];

  const routes = findAllSwapRoutes(tokenIn, tokenOut, pairs, maxDepth);
  const SWAP_FEE_PCT = Number((SWAP_FEE_DENOM - SWAP_FEE) * 100n) / Number(SWAP_FEE_DENOM);
  const options: RouteOption[] = [];

  for (const route of routes) {
    const amountOut = simulateRoute(route, amountIn, pairs);
    if (amountOut === null || amountOut === 0n) continue;

    const hopCount = route.length - 1;
    const totalFeePercent = hopCount * SWAP_FEE_PCT;

    let spotPrice = 1.0;
    let validRoute = true;
    let inDecimals = 18;
    let outDecimals = 18;
    let poolReserveIn = 0n;

    for (let i = 0; i < route.length - 1; i++) {
      const inAddr = route[i].toLowerCase();
      const outAddr = route[i + 1].toLowerCase();
      const pair = pairs.find(
        (p) =>
          (p.token0.toLowerCase() === inAddr && p.token1.toLowerCase() === outAddr) ||
          (p.token0.toLowerCase() === outAddr && p.token1.toLowerCase() === inAddr),
      );
      if (!pair) { validRoute = false; break; }
      const dec0 = pair.decimals0 ?? 18;
      const dec1 = pair.decimals1 ?? 18;
      if (i === 0) {
        inDecimals = pair.token0.toLowerCase() === inAddr ? dec0 : dec1;
        const isToken0In = pair.token0.toLowerCase() === inAddr;
        poolReserveIn = BigInt(isToken0In ? pair.reserve0 : pair.reserve1);
      }
      if (i === route.length - 2) {
        outDecimals = pair.token0.toLowerCase() === outAddr ? dec0 : dec1;
      }
      const r0 = Number(pair.reserve0) / 10 ** dec0;
      const r1 = Number(pair.reserve1) / 10 ** dec1;
      if (r0 === 0 || r1 === 0) { validRoute = false; break; }
      const isToken0In = pair.token0.toLowerCase() === inAddr;
      spotPrice *= isToken0In ? (r1 / r0) : (r0 / r1);
    }
    if (!validRoute || spotPrice === 0) continue;

    const execPrice = (Number(amountOut) / 10 ** outDecimals) / (Number(amountIn) / 10 ** inDecimals);
    const priceImpact = spotPrice > 0 && execPrice > 0
      ? Math.abs(((execPrice - spotPrice) / spotPrice) * 100)
      : 0;

    options.push({
      route,
      amountOut,
      amountOutFormatted: 0,
      priceImpact,
      totalFeePercent,
      hopCount,
      poolReserveIn,
    });
  }

  options.sort((a, b) => (a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : 0));
  return options.slice(0, 2);
}

export function parseErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message;
  if (
    msg.includes("User rejected the request") ||
    msg.includes("User denied transaction signature") ||
    msg.includes("user rejected")
  ) {
    return "Transaction rejected by user.";
  }
  const firstLine = msg.split("\n")[0];
  if (firstLine.length > 80) {
    return firstLine.slice(0, 80) + "...";
  }
  return firstLine;
}

export function getQuotePriority(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "USDC" || s === "USDT" || s === "DAI") return 3;
  if (s === "WETH" || s === "ETH") return 2;
  if (s === "WBTC") return 1;
  return 0;
}
