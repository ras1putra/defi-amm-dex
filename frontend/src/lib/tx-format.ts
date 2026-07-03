import { formatUnits } from "viem";
import type { Pair } from "@/types/dex";
import type { StakingPool } from "@/types/staking";
import type { TxHistoryItem } from "@/types/history";

export function formatDisplayAmount(amount: string): string {
  const num = parseFloat(amount);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  if (num < 1_000_000) return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return num.toExponential(2);
}

export function txAmountLabel(
  item: { tx_type: string; amount0: string; amount1: string; pool_id: string },
  poolMap: Map<string, Pair>,
  stakingPoolMap: Map<string, StakingPool>,
): string | null {
  const raw0 = BigInt(item.amount0 || "0");
  const raw1 = BigInt(item.amount1 || "0");

  if (item.tx_type === "stake" || item.tx_type === "unstake" || item.tx_type === "claim") {
    const sp = item.pool_id ? stakingPoolMap.get(item.pool_id) : undefined;
    const lpSym = sp?.staking_token_symbol ?? "LP";
    const rewardSym = sp?.reward_token_symbol ?? "reward";
    const rewardDec = sp?.reward_token_decimals ?? 18;

    switch (item.tx_type) {
      case "stake":
      case "unstake":
        return `${formatDisplayAmount(formatUnits(raw0, 18))} ${lpSym}`;
      case "claim":
        return `${formatDisplayAmount(formatUnits(raw1, rewardDec))} ${rewardSym}`;
    }
  }

  if (!item.pool_id || !poolMap.has(item.pool_id)) return null;
  const pool = poolMap.get(item.pool_id)!;

  if (item.tx_type === "swap") {
    const input = raw0 > 0n && raw1 < 0n
      ? { sym: pool.symbol0, amt: formatUnits(raw0, pool.decimals0) }
      : { sym: pool.symbol1, amt: formatUnits(raw1, pool.decimals1) };
    const output = raw0 > 0n && raw1 < 0n
      ? { sym: pool.symbol1, amt: formatUnits(-raw1, pool.decimals1) }
      : { sym: pool.symbol0, amt: formatUnits(-raw0, pool.decimals0) };
    return `${formatDisplayAmount(input.amt)} ${input.sym} → ${formatDisplayAmount(output.amt)} ${output.sym}`;
  }

  const fmt0 = formatDisplayAmount(formatUnits(raw0, pool.decimals0));
  const fmt1 = formatDisplayAmount(formatUnits(raw1, pool.decimals1));

  switch (item.tx_type) {
    case "add_liquidity":
    case "remove_liquidity":
      return `${fmt0} ${pool.symbol0} + ${fmt1} ${pool.symbol1}`;
    default:
      return null;
  }
}

export type DisplayEntry = {
  item: TxHistoryItem;
  combinedLabel?: string;
  hopCount: number;
  _sortTs: number;
  _sortIdx: number;
};

export function groupSwapHops(items: TxHistoryItem[], poolMap: Map<string, Pair>): DisplayEntry[] {
  const swapHops = new Map<string, TxHistoryItem[]>();
  const result: DisplayEntry[] = [];

  for (const item of items) {
    if (item.tx_type === "swap") {
      const hops = swapHops.get(item.tx_hash) ?? [];
      hops.push(item);
      swapHops.set(item.tx_hash, hops);
    } else {
      result.push({ item, hopCount: 1, _sortTs: item.timestamp, _sortIdx: result.length });
    }
  }

  for (const hops of swapHops.values()) {
    hops.sort((a, b) => a.pool_id.localeCompare(b.pool_id));
    const first = hops[0];
    const last = hops[hops.length - 1];

    let combinedLabel: string | undefined;

    if (hops.length > 1) {
      const poolFirst = poolMap.get(first.pool_id.toLowerCase());
      const poolLast = poolMap.get(last.pool_id.toLowerCase());
      const fRaw0 = BigInt(first.amount0 || "0");
      const fRaw1 = BigInt(first.amount1 || "0");
      const lRaw0 = BigInt(last.amount0 || "0");
      const lRaw1 = BigInt(last.amount1 || "0");

      if (poolFirst && poolLast) {
        const firstInIs0 = fRaw0 > 0n && fRaw1 < 0n;
        const inputSym = firstInIs0 ? poolFirst.symbol0 : poolFirst.symbol1;
        const inputDec = firstInIs0 ? poolFirst.decimals0 : poolFirst.decimals1;

        const lastOutIs1 = lRaw0 > 0n && lRaw1 < 0n;
        const outputSym = lastOutIs1 ? poolLast.symbol1 : poolLast.symbol0;
        const outputDec = lastOutIs1 ? poolLast.decimals1 : poolLast.decimals0;

        const inputAmt = formatUnits(firstInIs0 ? fRaw0 : fRaw1, inputDec);
        const outputAmt = formatUnits(lastOutIs1 ? -lRaw1 : -lRaw0, outputDec);
        combinedLabel = `${formatDisplayAmount(inputAmt)} ${inputSym} → ${formatDisplayAmount(outputAmt)} ${outputSym}`;
      }
    }

    result.push({
      item: first,
      hopCount: hops.length,
      combinedLabel,
      _sortTs: first.timestamp,
      _sortIdx: result.length,
    });
  }

  result.sort((a, b) => b._sortTs - a._sortTs || a._sortIdx - b._sortIdx);
  return result;
}

export function relativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
