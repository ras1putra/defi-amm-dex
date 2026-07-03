"use client";

import { useState, useMemo, useEffect } from "react";
import { X, ChevronDown, Loader2, AlertCircle, Info } from "lucide-react";
import { useTokens } from "@/hooks/useTokens";
import { useAddLiquidity } from "@/hooks/useAddLiquidity";
import { useAddLiquidityStore } from "@/store/useAddLiquidityStore";
import { useCustomTokensStore } from "@/store/useCustomTokensStore";
import { V2_AMM_ABI, V2_LP_TOKEN_ABI, V2_FACTORY_ABI } from "@/lib/abis";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useReadContract, useAccount } from "wagmi";
import { useConfigStore } from "@/store/useConfigStore";
import type { TokenOption } from "@/types/dex";
import { ADD_LIQ_STEP as S } from "@/types/dex";
import TokenListModal from "./TokenListModal";
import TxConfirmedModal from "@/components/shared/TxConfirmedModal";
import SlippageSelector from "@/components/shared/SlippageSelector";
import { sanitizeDecimalInput } from "@/schema/token";
import { useTokenBalance } from "@/hooks/useTokenBalance";

function TokenTrigger({ token, label, balance, onSelectTrigger }: { token: TokenOption | null; label: string; balance?: string; onSelectTrigger: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs md:text-sm text-white/70">{label}</label>
        {balance !== undefined && (
          <span className="text-xs md:text-sm text-white/40">Balance: {balance}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onSelectTrigger}
        className="w-full flex items-center justify-between gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold hover:border-[#6EE7B7]/40 transition-colors cursor-pointer"
      >
        <span>{token ? `${token.symbol} (${token.name})` : "Select token"}</span>
        <ChevronDown size={14} className="text-white/40 shrink-0" />
      </button>
    </div>
  );
}

interface AddLiquidityModalProps {
  onClose: () => void;
  prefill?: { token0: TokenOption; token1: TokenOption } | null;
}

export default function AddLiquidityModal({ onClose, prefill }: AddLiquidityModalProps) {
  const { data: apiTokens } = useTokens();
  const { customTokens, importToken, removeToken } = useCustomTokensStore();
  const { address: userAddress } = useAccount();

  const {
    token0, token1, amount0, amount1,
    setToken0, setToken1, setAmount0, setAmount1, reset,
  } = useAddLiquidityStore();

  useEffect(() => {
    if (prefill) {
      setToken0(prefill.token0);
      setToken1(prefill.token1);
    }
  }, [prefill, setToken0, setToken1]);

  const [slippageBps, setSlippageBps] = useState(50);

  const {
    step,
    needsApprove0,
    needsApprove1,
    isConfirming,
    isConfirmed,
    isTxError,
    txHash,
    allowancesLoaded,
    handleApprove0,
    handleApprove1,
    handleAddLiquidity,
  } = useAddLiquidity({ token0, token1, amount0, amount1, slippageBps });

  const factoryAddress = useConfigStore((s) => s.config?.contract_v2_amm) as `0x${string}` | undefined;
  const { data: poolAddress } = useReadContract({
    address: factoryAddress,
    abi: V2_FACTORY_ABI,
    functionName: "getPair",
    args: token0 && token1 ? [token0.address, token1.address] : undefined,
    query: { enabled: !!factoryAddress && !!token0 && !!token1 },
  });

  const { data: reservesData } = useReadContract({
    address: poolAddress && poolAddress !== zeroAddress ? poolAddress : undefined,
    abi: V2_AMM_ABI,
    functionName: "getReserves",
    query: { enabled: !!poolAddress && poolAddress !== zeroAddress },
  });

  const reserve0 = reservesData ? (reservesData as readonly bigint[])[0] : 0n;
  const reserve1 = reservesData ? (reservesData as readonly bigint[])[1] : 0n;

  const { data: lpTokenAddress } = useReadContract({
    address: poolAddress && poolAddress !== zeroAddress ? poolAddress : undefined,
    abi: V2_AMM_ABI,
    functionName: "lpToken",
    query: { enabled: !!poolAddress && poolAddress !== zeroAddress },
  });

  const { data: totalLpSupply } = useReadContract({
    address: lpTokenAddress as `0x${string}` | undefined,
    abi: V2_LP_TOKEN_ABI,
    functionName: "totalSupply",
    query: { enabled: !!lpTokenAddress },
  });

  const balance0 = useTokenBalance(token0, userAddress);
  const balance1 = useTokenBalance(token1, userAddress);

  const isInsufficient0 = useMemo(() => {
    if (!amount0 || !balance0 || !token0) return false;
    try {
      return parseUnits(amount0 as `${number}`, token0.decimals) > parseUnits(balance0 as `${number}`, token0.decimals);
    } catch { return false; }
  }, [amount0, balance0, token0]);

  const isInsufficient1 = useMemo(() => {
    if (!amount1 || !balance1 || !token1) return false;
    try {
      return parseUnits(amount1 as `${number}`, token1.decimals) > parseUnits(balance1 as `${number}`, token1.decimals);
    } catch { return false; }
  }, [amount1, balance1, token1]);

  const exceedsDecimals0 = useMemo(() => {
    if (!amount0 || !token0) return false;
    const parts = amount0.split(".");
    return parts.length > 1 && parts[1].length > token0.decimals;
  }, [amount0, token0]);

  const exceedsDecimals1 = useMemo(() => {
    if (!amount1 || !token1) return false;
    const parts = amount1.split(".");
    return parts.length > 1 && parts[1].length > token1.decimals;
  }, [amount1, token1]);

  const validationError = useMemo(() => {
    if (token0 && token1 && token0.address.toLowerCase() === token1.address.toLowerCase()) return "Tokens must be different";
    if (isInsufficient0) return `Insufficient ${token0?.symbol} balance`;
    if (isInsufficient1) return `Insufficient ${token1?.symbol} balance`;
    if (exceedsDecimals0) return `${token0?.symbol} amount exceeds max decimals of ${token0?.decimals}`;
    if (exceedsDecimals1) return `${token1?.symbol} amount exceeds max decimals of ${token1?.decimals}`;
    return null;
  }, [token0, token1, isInsufficient0, isInsufficient1, exceedsDecimals0, exceedsDecimals1]);

  const [selectingFor, setSelectingFor] = useState<"token0" | "token1" | null>(null);

  const handleSelectToken = (t: TokenOption) => {
    if (selectingFor === "token0") setToken0(t);
    if (selectingFor === "token1") setToken1(t);
    setSelectingFor(null);
  };

  const handleAmount0Change = (val: string) => {
    setAmount0(val);
    if (val === "") {
      if (reserve0 > 0n && reserve1 > 0n) setAmount1("");
      return;
    }
    if (reserve0 > 0n && reserve1 > 0n && token0 && token1) {
      try {
        const parsed0 = parseUnits(val as `${number}`, token0.decimals);
        setAmount1(formatUnits((parsed0 * reserve1) / reserve0, token1.decimals));
      } catch { }
    }
  };

  const handleAmount1Change = (val: string) => {
    setAmount1(val);
    if (val === "") {
      if (reserve0 > 0n && reserve1 > 0n) setAmount0("");
      return;
    }
    if (reserve0 > 0n && reserve1 > 0n && token0 && token1) {
      try {
        const parsed1 = parseUnits(val as `${number}`, token1.decimals);
        setAmount0(formatUnits((parsed1 * reserve0) / reserve1, token0.decimals));
      } catch { }
    }
  };

  const handleClose = () => { reset(); onClose(); };

  const isBusy = (step === S.APPROVING_0 || step === S.APPROVING_1 || step === S.SIGNING || step === S.PENDING) || isConfirming || !allowancesLoaded;

  const canSubmit = !!token0 && !!token1 && !validationError &&
    (Number(amount0) > 0 && Number(amount1) > 0) && !isBusy;

  const actionLabel = () => {
    if (step === S.APPROVING_0 || step === S.APPROVING_1) return "Approving…";
    if (step === S.SIGNING) return "Confirm in wallet…";
    if (step === S.PENDING || isConfirming) return "Confirming…";
    if (isConfirmed) return "Done!";
    if (!allowancesLoaded) return "Checking allowances…";
    if (needsApprove0) return `Approve ${token0?.symbol}`;
    if (needsApprove1) return `Approve ${token1?.symbol}`;
    return "Add Liquidity";
  };

  const handleAction = () => {
    if (needsApprove0) return handleApprove0();
    if (needsApprove1) return handleApprove1();
    return handleAddLiquidity();
  };

  const poolShare = useMemo(() => {
    if (!poolAddress || totalLpSupply === undefined || totalLpSupply === null) return null;
    const supply = totalLpSupply as bigint;
    const parsed0 = amount0 && token0 ? parseUnits(amount0 as `${number}`, token0.decimals) : 0n;
    const parsed1 = amount1 && token1 ? parseUnits(amount1 as `${number}`, token1.decimals) : 0n;
    if (parsed0 === 0n && parsed1 === 0n) return null;

    let newLp: bigint;
    if (supply === 0n) {
      newLp = parsed0 > parsed1 ? parsed0 : parsed1;
    } else {
      if (reserve0 === 0n || reserve1 === 0n) return "100.00";
      newLp = (parsed0 * supply) / reserve0 < (parsed1 * supply) / reserve1
        ? (parsed0 * supply) / reserve0
        : (parsed1 * supply) / reserve1;
    }

    const totalAfter = supply + newLp;
    if (totalAfter === 0n) return null;
    return ((Number(newLp) / Number(totalAfter)) * 100).toFixed(2);
  }, [poolAddress, amount0, amount1, token0, token1, reserve0, reserve1, totalLpSupply]);

  const excludeAddress = selectingFor === "token0" ? token1?.address : token0?.address;
  const explorerUrl = useConfigStore((s) => s.config?.chain.explorer_url);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={handleClose}>
        <div className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-md font-black tracking-tight">Add Liquidity</h2>
            <button type="button" onClick={handleClose} className="text-white/40 hover:text-white transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {isConfirmed ? (
            <TxConfirmedModal
              title="Liquidity Added!"
              details={[
                ...(token0 ? [{ label: `Deposited ${token0.symbol}`, value: Number(amount0).toLocaleString(undefined, { maximumFractionDigits: 6 }) }] : []),
                ...(token1 ? [{ label: `Deposited ${token1.symbol}`, value: Number(amount1).toLocaleString(undefined, { maximumFractionDigits: 6 }) }] : []),
                ...(poolShare ? [{ label: "Pool Share", value: `${poolShare}%`, highlight: true }] : []),
              ]}
              txHash={txHash}
              explorerUrl={explorerUrl}
              onClose={handleClose}
            />
          ) : (
            <>
              <div className="space-y-4 mb-4">
                <div>
                  <TokenTrigger token={token0} label="Token A" balance={balance0} onSelectTrigger={() => setSelectingFor("token0")} />
                  {balance0 && token0 && (
                    <button type="button" onClick={() => handleAmount0Change(balance0)} className="text-xs md:text-sm text-[#6EE7B7] hover:underline mt-0.5 cursor-pointer">
                      Use max
                    </button>
                  )}
                </div>
                <input
                  type="text" inputMode="decimal" pattern="^[0-9]*[.,]?[0-9]*$" placeholder="Amount A" value={amount0}
                  onChange={(e) => { const val = sanitizeDecimalInput(e.target.value); if (val !== null) handleAmount0Change(val); }}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#6EE7B7]/50 transition-colors"
                />

                <div>
                  <TokenTrigger token={token1} label="Token B" balance={balance1} onSelectTrigger={() => setSelectingFor("token1")} />
                  {balance1 && token1 && (
                    <button type="button" onClick={() => handleAmount1Change(balance1)} className="text-xs md:text-sm text-[#6EE7B7] hover:underline mt-0.5 cursor-pointer">
                      Use max
                    </button>
                  )}
                </div>
                <input
                  type="text" inputMode="decimal" pattern="^[0-9]*[.,]?[0-9]*$" placeholder="Amount B" value={amount1}
                  onChange={(e) => { const val = sanitizeDecimalInput(e.target.value); if (val !== null) handleAmount1Change(val); }}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#6EE7B7]/50 transition-colors"
                />
              </div>

              {poolShare && (
                <div className="flex items-center gap-2 text-xs md:text-sm text-white/70 mb-4 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5">
                  <Info size={14} className="shrink-0 text-[#6EE7B7]/70" />
                  <span>Your pool share: <span className="text-white/80 font-bold">{poolShare}%</span></span>
                </div>
              )}

              <SlippageSelector value={slippageBps} onChange={setSlippageBps} showCustomInput={false} />

              {validationError && (
                <div className="flex items-center gap-2 text-red-400 text-xs md:text-sm mb-4 bg-red-400/10 rounded-xl px-4 py-2">
                  <AlertCircle size={15} /> {validationError}
                </div>
              )}

              {isTxError && (
                <div className="flex items-center gap-2 text-red-400 text-xs md:text-sm mb-4 bg-red-400/10 rounded-xl px-4 py-2">
                  <AlertCircle size={15} /> Transaction reverted.
                </div>
              )}

              <button type="button" disabled={!canSubmit} onClick={handleAction}
                className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer">
                {isBusy && <Loader2 size={16} className="animate-spin" />}
                {actionLabel()}
              </button>
            </>
          )}
        </div>
      </div>

      {selectingFor && (
        <TokenListModal
          apiTokens={apiTokens ?? []}
          customTokens={customTokens}
          onSelect={handleSelectToken}
          onImport={importToken}
          onRemove={removeToken}
          onClose={() => setSelectingFor(null)}
          excludeAddress={excludeAddress}
        />
      )}
    </>
  );
}
