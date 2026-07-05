"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAccount, useReadContracts, useBalance } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowDownUp, Wallet, ChevronDown, XCircle } from "lucide-react";
import Image from "next/image";
import { useConfigStore } from "@/store/useConfigStore";
import { useSwapQuote, QUOTE_ERROR } from "@/hooks/useSwapQuote";
import { useSwap } from "@/hooks/useSwap";
import { useSwapStore } from "@/store/useSwapStore";
import type { TokenOption } from "@/types/dex";
import { useConfig } from "@/hooks/useConfig";
import { useTokens } from "@/hooks/useTokens";
import { useCustomTokensStore } from "@/store/useCustomTokensStore";
import { ERC20_ABI } from "@/lib/abis";
import TransactionStatus, { TX_VISUAL } from "./TransactionStatus";
import TokenListModal from "./TokenListModal";
import TxConfirmedModal from "@/components/shared/TxConfirmedModal";
import SlippageSelector from "@/components/shared/SlippageSelector";
import { showErrorToast } from "@/lib/api";
import { formatUnits } from "viem";
import { formatBalance } from "@/lib/format";
import { NATIVE_TOKEN, BALANCE_REFETCH_INTERVAL, BALANCE_STALE_TIME } from "@/lib/constants";
import { parseAmount } from "@/lib/amm";
import { sanitizeDecimalInput } from "@/schema/token";

export default function SwapPanel() {
  const { address, isConnected } = useAccount();
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);
  const { openConnectModal } = useConnectModal();
  const { isLoading: configLoading, isError: configError, error: configErrorObj, refetch: refetchConfig } = useConfig();
  const { customTokens, importToken, removeToken } = useCustomTokensStore();

  const config = useConfigStore((s) => s.config);
  const wethAddress = config?.contract_weth?.toLowerCase();

  const {
    data: tokensList = [],
    isLoading: tokensLoading,
    isError: tokensError,
    error: tokensErrorObj,
    refetch: refetchTokens,
  } = useTokens();

  const isLoading = configLoading || tokensLoading;
  const isError = configError || tokensError;

  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: BALANCE_REFETCH_INTERVAL, staleTime: BALANCE_STALE_TIME },
  });

  const erc20Tokens = useMemo(() => {
    const list: TokenOption[] = [];
    const seen = new Set<string>();
    const add = (t: TokenOption) => {
      const addr = t.address.toLowerCase();
      if (addr !== NATIVE_TOKEN.toLowerCase() && !seen.has(addr)) {
        seen.add(addr);
        list.push(t);
      }
    };
    for (const t of tokensList) {
      add({ address: t.address as `0x${string}`, symbol: t.symbol, decimals: t.decimals, name: t.name, logo: t.logo_url || undefined });
    }
    for (const t of customTokens) add(t);
    return list;
  }, [tokensList, customTokens]);

  const { data: balancesData, refetch: refetchBalances } = useReadContracts({
    contracts: erc20Tokens.map((t) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    })),
    query: {
      enabled: !!address && erc20Tokens.length > 0,
      refetchInterval: BALANCE_REFETCH_INTERVAL,
      staleTime: BALANCE_STALE_TIME,
    },
  });

  const balances = useMemo(() => {
    const map = new Map<string, bigint>();
    if (!address) return map;
    if (ethBalance) map.set(NATIVE_TOKEN.toLowerCase(), ethBalance.value);
    if (balancesData) {
      erc20Tokens.forEach((t, i) => {
        const result = balancesData[i] as { status: string; result?: unknown };
        map.set(t.address.toLowerCase(), result?.status === "success" && typeof result.result === "bigint" ? result.result : 0n);
      });
    }
    return map;
  }, [address, ethBalance, balancesData, erc20Tokens]);

  useEffect(() => {
    if (configError && configErrorObj) showErrorToast(configErrorObj, "Failed to load configuration");
  }, [configError, configErrorObj]);

  useEffect(() => {
    if (tokensError && tokensErrorObj) showErrorToast(tokensErrorObj, "Failed to load tokens list");
  }, [tokensError, tokensErrorObj]);

  const {
    tokenIn, tokenOut, amountIn, slippageBps,
    setTokenIn, setTokenOut, setAmountIn, setSlippageBps,
  } = useSwapStore();

  const getTokenBalance = useCallback((token: TokenOption | null): bigint => {
    if (!token) return 0n;
    const addr = token.address.toLowerCase();
    if (addr === wethAddress) {
      return balances.get(NATIVE_TOKEN.toLowerCase()) ?? 0n;
    }
    return balances.get(addr) ?? 0n;
  }, [balances, wethAddress]);

  const balance = useMemo(() => getTokenBalance(tokenIn), [tokenIn, getTokenBalance]);
  const outBalance = useMemo(() => getTokenBalance(tokenOut), [tokenOut, getTokenBalance]);

  const parsedIn = tokenIn && amountIn ? parseAmount(amountIn, tokenIn.decimals) : 0n;

  const isInsufficientBalance = useMemo(() => {
    if (!tokenIn || parsedIn <= 0n) return false;
    return balance < parsedIn;
  }, [tokenIn, parsedIn, balance]);

  const [showTokenList, setShowTokenList] = useState<"in" | "out" | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  const openTokenList = (mode: "in" | "out") => {
    setShowTokenList(mode);
    refetchTokens();
    if (address) {
      refetchEthBalance();
      refetchBalances();
    }
  };

  const { routeExists, routeOptions, isLoading: quoting, quoteError } = useSwapQuote({
    tokenIn, tokenOut, amountIn,
  });

  const selectedOption = useMemo(() => {
    if (!routeOptions.length) return undefined;
    const idx = Math.min(selectedRouteIdx, routeOptions.length - 1);
    return routeOptions[idx];
  }, [routeOptions, selectedRouteIdx]);

  const amountOut = selectedOption?.amountOut ?? 0n;
  const amountOutFormatted = selectedOption?.amountOutFormatted ?? 0;
  const route = selectedOption?.route ?? null;
  const impact = selectedOption?.priceImpact ?? 0;
  const poolReserveIn = selectedOption?.poolReserveIn ?? 0n;
  const poolHasEnough = poolReserveIn > 0n && parsedIn > 0n && parsedIn <= poolReserveIn;

  // Reset to best route when tokens or amount change
  useEffect(() => {
    setTimeout(() => {
      setSelectedRouteIdx(0);
    }, 0);
  }, [tokenIn, tokenOut, amountIn]);

  const exceedsPoolReserve = useMemo(() => {
    if (!tokenIn || parsedIn <= 0n || poolReserveIn <= 0n) return false;
    return parsedIn > poolReserveIn;
  }, [tokenIn, parsedIn, poolReserveIn]);

  const handleMaxClick = () => {
    if (!tokenIn) return;
    const bal = getTokenBalance(tokenIn);
    const maxAmount = poolReserveIn > 0n && poolReserveIn < bal ? poolReserveIn : bal;
    setAmountIn(formatUnits(maxAmount, tokenIn.decimals));
  };

  const {
    needsApproval, isCheckingAllowance, isApproving, isSwapping, isConfirming, isConfirmed, isTxError, txHash,
    handleApprove, handleSwap, reset,
  } = useSwap({ tokenIn, tokenOut, amountIn, amountOut, slippageBps, route, exceedsReserve: exceedsPoolReserve });

  useEffect(() => {
    if (isConfirmed && address) {
      refetchEthBalance();
      refetchBalances();
    }
  }, [isConfirmed, address, refetchEthBalance, refetchBalances]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6 md:p-8 max-w-md w-full min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6EE7B7]" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-6 md:p-8 max-w-md w-full min-h-[400px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-bold text-white uppercase tracking-wider font-mono-dm">Swap</h2>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.02] focus-within:border-[#6EE7B7]/30 focus-within:bg-white/[0.03] focus-within:outline-none transition-all space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm">You pay</span>
          <div className="flex items-center gap-3">
            {tokenIn && balance > 0n && (
              <span className="text-xs text-white/40 font-mono-dm">
                {formatBalance(balance, tokenIn.decimals)}
              </span>
            )}
            {tokenIn && (
              <button
                onClick={handleMaxClick}
                className="text-xs font-bold text-[#6EE7B7] hover:text-[#34D399] transition-colors font-mono tracking-wider uppercase cursor-pointer"
              >
                Max
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <input
            type="text"
            inputMode="decimal"
            pattern="^[0-9]*[.,]?[0-9]*$"
            value={amountIn}
            onChange={(e) => {
              const val = sanitizeDecimalInput(e.target.value);
              if (val !== null) setAmountIn(val);
            }}
            placeholder="0.0"
            className="min-w-0 flex-1 bg-transparent text-xl sm:text-2xl font-bold text-white outline-none placeholder:text-white/20"
          />
          <TokenButton token={tokenIn} onClick={() => openTokenList("in")} />
        </div>
      </div>

      <div className="flex justify-center -my-3.5 relative z-10">
        <button
          onClick={() => { const t = tokenIn; setTokenIn(tokenOut); setTokenOut(t); }}
          className="h-9 w-9 rounded-full bg-zinc-950 border border-white/10 flex items-center justify-center hover:bg-zinc-900 hover:border-white/20 transition-all cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
        >
          <ArrowDownUp size={16} className="text-white/70" />
        </button>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-white/10 bg-white/[0.02] focus-within:border-[#6EE7B7]/30 focus-within:bg-white/[0.03] focus-within:outline-none transition-all space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm">You receive</span>
          {tokenOut && outBalance > 0n && (
            <span className="text-xs text-white/40 font-mono-dm">
              {formatBalance(outBalance, tokenOut.decimals)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="min-w-0 flex-1 text-xl sm:text-2xl font-bold text-white/95">
            {quoting ? <span className="text-white/30 italic text-lg sm:text-xl font-normal">Fetching...</span> : amountOut > 0n ? amountOutFormatted.toFixed(6) : "0.0"}
          </div>
          <TokenButton token={tokenOut} onClick={() => openTokenList("out")} />
        </div>
      </div>

      <div className="mt-4">
        <SlippageSelector value={slippageBps} onChange={setSlippageBps} showCustomInput />
      </div>

      {slippageBps < 10 && (
        <p className="mt-2 text-xs text-red-400/80 font-mono-dm text-center">
          {slippageBps === 0 ? "Slippage tolerance cannot be 0%" : "Very low slippage — transaction may fail"}
        </p>
      )}

      {routeOptions.length > 1 && (
        <div className="mt-4 space-y-2">
          <span className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono-dm">Select Route</span>
          {routeOptions.map((opt, idx) => {
            const isSelected = idx === selectedRouteIdx;
            return (
              <button
                key={`route-${idx}`}
                onClick={() => setSelectedRouteIdx(idx)}
                className={`w-full p-2.5 rounded-xl border transition-all cursor-pointer text-left ${isSelected
                  ? "border-[#6EE7B7]/30 bg-[#6EE7B7]/5"
                  : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-[#6EE7B7]" : "border-white/20"
                    }`}>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white/70">
                          {opt.route.map((addr, i, arr) => {
                            const sym = addr.toLowerCase() === NATIVE_TOKEN.toLowerCase()
                              ? "ETH"
                              : erc20Tokens.find((t) => t.address.toLowerCase() === addr.toLowerCase())?.symbol ?? "???";
                            return (
                              <span key={addr}>
                                {sym}{i < arr.length - 1 ? " > " : ""}
                              </span>
                            );
                          })}
                        </span>
                        {idx === 0 && (
                          <span className="text-xs font-bold text-[#6EE7B7] bg-[#6EE7B7]/10 px-1.5 py-0.5 rounded">Best</span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-white shrink-0 ml-2">
                        ~{opt.amountOutFormatted.toFixed(6)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-white/40">
                        {opt.hopCount} hop{opt.hopCount > 1 ? "s" : ""} &middot; {opt.totalFeePercent.toFixed(2)}% fee
                      </span>
                      <span className={`text-xs font-bold shrink-0 ml-2 ${opt.priceImpact > 5 ? "text-red-400" : opt.priceImpact > 1 ? "text-yellow-400" : "text-[#6EE7B7]/70"}`}>
                        {opt.priceImpact.toFixed(2)}% impact
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {amountOut > 0n && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all mt-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between p-3.5 text-xs font-mono-dm text-white/50 hover:text-white/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <span>Rate</span>
              <span className="text-white font-bold">
                {tokenIn && tokenOut && parsedIn > 0n ? `1 ${tokenIn.symbol} = ${(Number(amountOut) / 10 ** tokenOut.decimals / (Number(parsedIn) / 10 ** tokenIn.decimals)).toFixed(6)} ${tokenOut.symbol}` : "—"}
              </span>
            </div>
            <ChevronDown size={14} className={`transition-transform duration-200 ${showDetails ? "rotate-180 text-white" : "text-white/30"}`} />
          </button>

          {showDetails && (
            <div className="px-3.5 pb-3.5 space-y-2 font-mono-dm text-xs text-white/40 border-t border-white/[0.04] pt-2.5">
              <div className="flex justify-between">
                <span>Minimum Received</span>
                <span className="text-white/70 font-bold">
                  {slippageBps > 0
                    ? `${((Number(amountOut) / 10 ** (tokenOut?.decimals ?? 18)) * (1 - slippageBps / 10000)).toFixed(4)} ${tokenOut?.symbol ?? ""}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Price Impact</span>
                <span className={`font-bold ${impact > 5 ? "text-red-400" : impact > 1 ? "text-yellow-400" : "text-[#6EE7B7]"}`}>
                  {impact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Liquidity Provider Fee</span>
                <span className="text-white/70 font-bold">
                  {selectedOption ? `${selectedOption.totalFeePercent.toFixed(2)}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Route</span>
                <span className="text-white/70 font-bold flex items-center gap-1 font-mono text-xs">
                  {route && route.length > 0 ? (
                    route.map((addr, idx) => {
                      const isLast = idx === route.length - 1;
                      const sym = addr.toLowerCase() === NATIVE_TOKEN.toLowerCase()
                        ? "ETH"
                        : erc20Tokens.find((t) => t.address.toLowerCase() === addr.toLowerCase())?.symbol ?? "UNKNOWN";
                      return (
                        <span key={addr} className="flex items-center gap-1">
                          <span>{sym}</span>
                          {!isLast && <span className="text-white/30">&gt;</span>}
                        </span>
                      );
                    })
                  ) : (
                    <>
                      {tokenIn?.symbol} <span className="text-white/30">&gt;</span> {tokenOut?.symbol}
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <TransactionStatus
        needsApproval={needsApproval}
        approveStatus={isConfirmed && needsApproval ? TX_VISUAL.DONE : needsApproval && (isApproving || isConfirming) ? TX_VISUAL.ACTIVE : isConfirmed ? TX_VISUAL.DONE : TX_VISUAL.IDLE}
        isSigning={isSwapping}
        isPending={isConfirming}
        isConfirmed={isConfirmed}
        isError={isTxError}
      />

      <SwapButton
        isError={isError}
        isConnected={isConnected}
        tokenIn={tokenIn}
        tokenOut={tokenOut}
        amountIn={amountIn}
        amountOut={amountOut}
        isInsufficientBalance={isInsufficientBalance}
        exceedsPoolReserve={exceedsPoolReserve}
        routeExists={routeExists}
        quoting={quoting}
        quoteError={quoteError}
        poolReserveIn={poolReserveIn}
        poolHasEnough={poolHasEnough}
        needsApproval={needsApproval}
        isCheckingAllowance={isCheckingAllowance}
        isApproving={isApproving}
        isSwapping={isSwapping}
        isConfirming={isConfirming}
        handleApprove={handleApprove}
        handleSwap={handleSwap}
        connect={() => openConnectModal?.()}
        retry={() => { refetchConfig(); refetchTokens(); }}
      />

      {showTokenList && (
        <TokenListModal
          apiTokens={tokensList}
          customTokens={customTokens}
          onSelect={(t) => {
            if (showTokenList === "in") setTokenIn(t);
            if (showTokenList === "out") setTokenOut(t);
          }}
          onImport={importToken}
          onRemove={removeToken}
          onClose={() => setShowTokenList(null)}
          excludeAddress={showTokenList === "in" ? tokenOut?.address : tokenIn?.address}
        />
      )}

      {isConfirmed && (
        <TxConfirmedModal
          title="Swap Confirmed!"
          details={[
            { label: "Swapped", value: `${amountIn} ${tokenIn?.symbol ?? ""}` },
            { label: "Received", value: `${Number(formatUnits(amountOut, tokenOut?.decimals ?? 18)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut?.symbol ?? ""}`, highlight: true },
          ]}
          txHash={txHash}
          explorerUrl={explorerUrl}
          onClose={() => { reset(); setAmountIn(""); }}
        />
      )}
    </div>
  );
}

function TokenButton({ token, onClick }: { token: TokenOption | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12] transition-all cursor-pointer"
    >
      {token?.logo ? (
        <Image src={token.logo} alt={token.symbol} width={20} height={20} unoptimized className="rounded-full object-contain shrink-0" />
      ) : token ? (
        <div className="w-5 h-5 shrink-0 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-white/70">
          {token.symbol[0]}
        </div>
      ) : null}
      <span className="text-sm font-bold truncate max-w-[80px] sm:max-w-[120px]">{token?.symbol || "Select"}</span>
      <ChevronDown size={14} className="shrink-0 text-white/50" />
    </button>
  );
}

interface SwapButtonProps {
  isError: boolean;
  isConnected: boolean;
  tokenIn: TokenOption | null;
  tokenOut: TokenOption | null;
  amountIn: string;
  amountOut: bigint;
  isInsufficientBalance: boolean;
  exceedsPoolReserve: boolean;
  routeExists: boolean;
  quoting: boolean;
  quoteError: string;
  poolReserveIn: bigint;
  poolHasEnough: boolean;
  needsApproval: boolean;
  isCheckingAllowance: boolean;
  isApproving: boolean;
  isSwapping: boolean;
  isConfirming: boolean;
  handleApprove: () => void;
  handleSwap: () => void;
  connect: () => void;
  retry: () => void;
}

function SwapButton({
  isError, isConnected, tokenIn, tokenOut, amountIn, amountOut,
  isInsufficientBalance, exceedsPoolReserve, routeExists, quoting, quoteError,
  poolReserveIn, poolHasEnough, needsApproval, isCheckingAllowance, isApproving, isSwapping, isConfirming,
  handleApprove, handleSwap, connect, retry,
}: SwapButtonProps) {
  const disabledButtonClass = "w-full flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-bold tracking-wider uppercase text-white/30 cursor-not-allowed";

  return (
    <div className="mt-6 space-y-3">
      {isError ? (
        <button onClick={retry} className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-4 py-2.5 text-sm font-bold tracking-wider uppercase text-rose-400 transition-all cursor-pointer">
          <XCircle size={16} /> Connection Error (Retry)
        </button>
      ) : !isConnected ? (
        <button onClick={connect} className="btn-primary w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm tracking-wider uppercase cursor-pointer">
          <Wallet size={16} /> Connect Wallet
        </button>
      ) : (!tokenIn || !tokenOut) ? (
        <button disabled className={disabledButtonClass}>Select a token</button>
      ) : (!amountIn || Number(amountIn) <= 0) ? (
        <button disabled className={disabledButtonClass}>Enter an amount</button>
      ) : isInsufficientBalance ? (
        <button disabled className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-500 text-zinc-950 px-4 py-2.5 text-sm font-bold tracking-wider uppercase cursor-not-allowed">
          Insufficient {tokenIn?.symbol} balance
        </button>
      ) : exceedsPoolReserve ? (
        <div>
          <button disabled className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-400 text-zinc-950 px-4 py-2.5 text-sm font-bold tracking-wider uppercase cursor-not-allowed">
            Exceeds Pool Liquidity
          </button>
          {poolReserveIn > 0n && tokenIn && (
            <p className="mt-1.5 text-xs text-center text-amber-500/60 font-mono-dm">
              Pool has {formatUnits(poolReserveIn, tokenIn.decimals)} {tokenIn.symbol}
            </p>
          )}
        </div>
      ) : (!routeExists && !quoting) ? (
        <div>
          <button disabled className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-400 text-zinc-950 px-4 py-2.5 text-sm font-bold tracking-wider uppercase cursor-not-allowed">
            {quoteError === QUOTE_ERROR.EXCEEDS_LIQUIDITY ? "Exceeds Liquidity" : "No Route"}
          </button>
          {quoteError === QUOTE_ERROR.EXCEEDS_LIQUIDITY && poolReserveIn > 0n && tokenIn && (
            <p className="mt-1.5 text-xs text-center text-amber-500/60 font-mono-dm">
              Pool reserve: {formatUnits(poolReserveIn, tokenIn.decimals)} {tokenIn.symbol}
            </p>
          )}
          {quoteError === QUOTE_ERROR.POOL_UNINITIALIZED && (
            <p className="mt-1.5 text-xs text-center text-amber-500/60 font-mono-dm">
              Pool not initialized or has no liquidity
            </p>
          )}
        </div>
      ) : needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={isApproving || isCheckingAllowance || !amountIn || !tokenIn || !tokenOut}
          className="btn-primary w-full px-4 py-2.5 rounded-xl text-sm tracking-wider uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCheckingAllowance ? "Checking..." : isApproving ? "Approving..." : `Approve ${tokenIn?.symbol}`}
        </button>
      ) : (
        <button
          onClick={handleSwap}
          disabled={isSwapping || isConfirming || !amountIn || (amountOut <= 0n && !poolHasEnough)}
          className="btn-primary w-full px-4 py-2.5 rounded-xl text-sm tracking-wider uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSwapping ? "Confirm in wallet..." : isConfirming ? "Swapping..." : "Swap"}
        </button>
      )}
    </div>
  );
}
