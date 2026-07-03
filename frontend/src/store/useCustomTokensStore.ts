import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TokenOption } from "@/types/dex";

interface CustomTokensState {
  customTokens: TokenOption[];
  importToken: (token: TokenOption) => void;
  removeToken: (address: string) => void;
}

export const useCustomTokensStore = create<CustomTokensState>()(
  persist(
    (set) => ({
      customTokens: [],
      importToken: (token) =>
        set((state) => {
          const exists = state.customTokens.some(
            (t) => t.address.toLowerCase() === token.address.toLowerCase()
          );
          if (exists) return state;
          return { customTokens: [...state.customTokens, token] };
        }),
      removeToken: (address) =>
        set((state) => ({
          customTokens: state.customTokens.filter(
            (t) => t.address.toLowerCase() !== address.toLowerCase()
          ),
        })),
    }),
    {
      name: "dex-custom-tokens-storage",
    }
  )
);
