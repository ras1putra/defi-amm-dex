import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";
import { API_TX_HISTORY } from "@/lib/constants";
import { useTxStore } from "@/store/useTxStore";
import type { ApiResponse } from "@/types/api";
import type { TxHistoryItem, TxHistoryResponse } from "@/types/history";

export function useTxHistory(page: number, pageSize: number, txType: string = "all") {
  const { address } = useAccount();
  const localTxs = useTxStore((s) => s.txs);

  const query = useQuery({
    queryKey: ["tx-history", address, txType, page, pageSize],
    queryFn: async () => {
      const res = await api.get<ApiResponse<TxHistoryResponse>>(API_TX_HISTORY, {
        params: { address, type: txType, page, limit: pageSize },
      });
      return res.data.data;
    },
    enabled: !!address,
    staleTime: 10000,
    placeholderData: (prev) => prev,
  });

  const data = useMemo(() => {
    const apiItems = query.data?.items ?? [];

    const apiHashes = new Set(apiItems.map((i) => i.tx_hash));
    const pendingLocals = page === 1
      ? localTxs
          .filter((l) => l.sender === address && !apiHashes.has(l.tx_hash))
          .slice(0, pageSize)
          .map((l): TxHistoryItem => ({
        tx_hash: l.tx_hash,
        tx_type: l.tx_type,
        timestamp: l.timestamp,
        pool_id: "",
        sender: address ?? "",
        amount0: "",
        amount1: "",
        usd_value: 0,
        status: l.status,
      }))
      : [];

    const combined = [...pendingLocals, ...apiItems];
    const totalItems = (query.data?.total ?? 0) + pendingLocals.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    return {
      items: combined.slice(0, pageSize),
      total: totalItems,
      page: query.data?.page ?? page,
      page_size: pageSize,
      total_pages: totalPages,
    };
  }, [query.data, localTxs, address, page, pageSize]);

  return { ...query, data };
}
