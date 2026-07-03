export interface TxHistoryItem {
  tx_hash: string;
  timestamp: number;
  tx_type: string;
  pool_id: string;
  sender: string;
  amount0: string;
  amount1: string;
  usd_value: number;
  status?: "pending" | "confirmed" | "failed";
}

export interface TxHistoryResponse {
  items: TxHistoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface WsTxEvent {
  type: "tx";
  tx_hash: string;
  timestamp: number;
  tx_type: string;
  pool_id: string;
  sender: string;
  amount0: string;
  amount1: string;
  usd_value: number;
}

export interface LocalTx {
  tx_hash: string;
  tx_type: string;
  sender: string;
  timestamp: number;
  status: "pending" | "confirmed" | "failed";
}
