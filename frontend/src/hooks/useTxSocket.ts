import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { WsTxEvent } from "@/types/history";

export function useTxSocket() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [lastEvent, setLastEvent] = useState<WsTxEvent | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const isGuest = !isConnected || !address;
    const socketAddress = isGuest ? `guest-${Math.floor(Math.random() * 1000000)}` : address;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/api/v2/ws?address=${socketAddress}`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onmessage = (event) => {
        try {
          const data: WsTxEvent = JSON.parse(event.data);
          if (data.type === "tx") {
            setLastEvent(data);
            queryClient.invalidateQueries({ queryKey: ["tx-history"] });
            queryClient.invalidateQueries({ queryKey: ["pairs"] });
            queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
            queryClient.invalidateQueries({ queryKey: ["tvl-history"] });
            queryClient.invalidateQueries({ queryKey: ["volume-history"] });
            queryClient.invalidateQueries({ queryKey: ["token-prices"] });
            queryClient.invalidateQueries({ queryKey: ["price-history"] });
            queryClient.invalidateQueries({ queryKey: ["ohlcv"] });
          }
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [address, isConnected, queryClient]);

  const connected = isConnected && address && wsConnected;
  return { lastEvent, isConnected: connected };
}
