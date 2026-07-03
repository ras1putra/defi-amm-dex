import { create } from "zustand";
import { ADD_LIQ_STEP, type AddLiquidityStep, type TokenOption } from "@/types/dex";

interface AddLiquidityState {
  token0: TokenOption | null;
  token1: TokenOption | null;
  amount0: string;
  amount1: string;
  step: AddLiquidityStep;
  txHash: `0x${string}` | null;
  error: string | null;

  setToken0: (t: TokenOption | null) => void;
  setToken1: (t: TokenOption | null) => void;
  setAmount0: (v: string) => void;
  setAmount1: (v: string) => void;
  setStep: (s: AddLiquidityStep) => void;
  setTxHash: (h: `0x${string}` | null) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

const initialState = {
  token0: null,
  token1: null,
  amount0: "",
  amount1: "",
  step: ADD_LIQ_STEP.IDLE as AddLiquidityStep,
  txHash: null as `0x${string}` | null,
  error: null as string | null,
};

export const useAddLiquidityStore = create<AddLiquidityState>()((set) => ({
  ...initialState,
  setToken0: (token0) => set({ token0 }),
  setToken1: (token1) => set({ token1 }),
  setAmount0: (amount0) => set({ amount0 }),
  setAmount1: (amount1) => set({ amount1 }),
  setStep: (step) => set({ step }),
  setTxHash: (txHash) => set({ txHash }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
