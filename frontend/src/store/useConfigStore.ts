import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppConfig } from "@/lib/config";

interface ConfigState {
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: null,
      setConfig: (config) => set({ config }),
    }),
    { name: "dex-config-storage", storage: createJSONStorage(() => localStorage) }
  )
);
