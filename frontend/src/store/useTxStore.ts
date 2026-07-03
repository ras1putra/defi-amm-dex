import { create } from "zustand";
import type { LocalTx } from "@/types/history";

export type { LocalTx } from "@/types/history";

interface TxStoreState {
  txs: LocalTx[];
  addTx: (tx: LocalTx) => void;
  updateTx: (hash: string, status: LocalTx["status"]) => void;
}

export const useTxStore = create<TxStoreState>((set) => ({
  txs: [],
  addTx: (tx) =>
    set((state) => {
      const filtered = state.txs.filter((t) => t.tx_hash !== tx.tx_hash);
      return { txs: [tx, ...filtered].slice(0, 50) };
    }),
  updateTx: (hash, status) =>
    set((state) => ({
      txs: state.txs.map((t) => (t.tx_hash === hash ? { ...t, status } : t)),
    })),
}));
