import { create } from "zustand";
import { SWAP_STEP, type SwapStep, type TokenOption } from "@/types/dex";

interface SwapState {
  tokenIn: TokenOption | null;
  tokenOut: TokenOption | null;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  slippageBps: number;
  step: SwapStep;
  txHash: `0x${string}` | null;
  error: string | null;

  setTokenIn: (t: TokenOption | null) => void;
  setTokenOut: (t: TokenOption | null) => void;
  setAmountIn: (v: string) => void;
  setAmountOut: (v: string) => void;
  setPriceImpact: (v: number) => void;
  setSlippageBps: (v: number) => void;
  setStep: (s: SwapStep) => void;
  setTxHash: (h: `0x${string}` | null) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

const initialState = {
  tokenIn: null,
  tokenOut: null,
  amountIn: "",
  amountOut: "",
  priceImpact: 0,
  slippageBps: 50,
  step: SWAP_STEP.IDLE as SwapStep,
  txHash: null as `0x${string}` | null,
  error: null as string | null,
};

export const useSwapStore = create<SwapState>()((set) => ({
  ...initialState,
  setTokenIn: (tokenIn) =>
    set((state) => {
      if (
        tokenIn &&
        state.tokenOut &&
        tokenIn.address.toLowerCase() === state.tokenOut.address.toLowerCase()
      ) {
        return { tokenIn, tokenOut: state.tokenIn };
      }
      return { tokenIn };
    }),
  setTokenOut: (tokenOut) =>
    set((state) => {
      if (
        tokenOut &&
        state.tokenIn &&
        tokenOut.address.toLowerCase() === state.tokenIn.address.toLowerCase()
      ) {
        return { tokenOut, tokenIn: state.tokenOut };
      }
      return { tokenOut };
    }),
  setAmountIn: (amountIn) => set({ amountIn }),
  setAmountOut: (amountOut) => set({ amountOut }),
  setPriceImpact: (priceImpact) => set({ priceImpact }),
  setSlippageBps: (slippageBps) => set({ slippageBps }),
  setStep: (step) => set({ step }),
  setTxHash: (txHash) => set({ txHash }),
  setError: (error) => set({ error }),
  reset: () =>
    set((state) => ({
      ...initialState,
      tokenIn: state.tokenIn,
      tokenOut: state.tokenOut,
      slippageBps: state.slippageBps,
    })),
}));

