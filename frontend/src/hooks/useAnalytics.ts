import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, showErrorToast } from "@/lib/api";
import { API_ANALYTICS_APR } from "@/lib/constants";
import type { ApiResponse } from "@/types/api";
import type { AnalyticsOverview, TVLPoint, VolumePoint, PricePoint, StakingAPR, OHLCVBar, TokenPrice } from "@/types/analytics";
import { sortPairs, PER_PAGE } from "@/lib/analytics-utils";
import type { SortKey } from "@/lib/analytics-utils";

export function useOverview(timeframe?: string) {
  return useQuery({
    queryKey: ["analytics-overview", timeframe],
    queryFn: async () => {
      const res = await api.get<ApiResponse<AnalyticsOverview>>(
        `/api/v2/analytics/overview?timeframe=${timeframe || "24h"}`
      );
      return res.data.data;
    },
    staleTime: 10000,
    refetchInterval: 15000,
  });
}

export function useTVLHistory() {
  return useQuery({
    queryKey: ["tvl-history"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<TVLPoint[]>>("/api/v2/analytics/tvl-history");
      return res.data.data;
    },
    staleTime: 60000,
  });
}

export function useVolumeHistory() {
  return useQuery({
    queryKey: ["volume-history"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<VolumePoint[]>>("/api/v2/analytics/volume-history");
      return res.data.data;
    },
    staleTime: 60000,
  });
}

export function usePriceHistory(poolId: string | null) {
  return useQuery({
    queryKey: ["price-history", poolId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<PricePoint[]>>(`/api/v2/analytics/pairs/${poolId}/price-history`);
      return res.data.data;
    },
    enabled: !!poolId,
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function usePairDetail(poolId: string | null) {
  return useQuery({
    queryKey: ["pair-detail", poolId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<unknown>>(`/api/v2/analytics/pairs/${poolId}`);
      return res.data.data;
    },
    enabled: !!poolId,
    staleTime: 30000,
  });
}

export function useAPR() {
  return useQuery({
    queryKey: ["apr"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<StakingAPR>>(API_ANALYTICS_APR);
      return res.data.data;
    },
    staleTime: 60000,
  });
}

export function useOHLCV(
  poolId: string | null,
  tokenAddress?: string | null,
  interval: number = 3600,
  lookback: number = 604800,
) {
  return useQuery({
    queryKey: ["ohlcv", poolId, tokenAddress, interval, lookback],
    queryFn: async () => {
      const tokenParam = tokenAddress ? `&token=${tokenAddress}` : "";
      const res = await api.get<ApiResponse<OHLCVBar[]>>(
        `/api/v2/analytics/pairs/${poolId}/ohlcv?interval=${interval}&lookback=${lookback}${tokenParam}`,
      );
      return res.data.data;
    },
    enabled: !!poolId,
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useTokenPrices(timeframe?: string) {
  return useQuery({
    queryKey: ["token-prices", timeframe],
    queryFn: async () => {
      const res = await api.get<ApiResponse<TokenPrice[]>>(
        `/api/v2/analytics/tokens?timeframe=${timeframe || "24h"}`
      );
      return res.data.data;
    },
    staleTime: 10000,
    refetchInterval: 15000,
  });
}

export { sortPairs, findPoolForToken, SORT_OPTIONS, PER_PAGE } from "@/lib/analytics-utils";
export type { SortKey } from "@/lib/analytics-utils";

export function useAnalyticsPageState(timeframe?: string) {
  const { data: overview, isLoading: ovLoading, isError: ovError, error: ovErr } = useOverview(timeframe);
  const { data: tvlHist, isLoading: tvlLoading } = useTVLHistory();
  const { data: volHist, isLoading: volLoading } = useVolumeHistory();

  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const { data: priceHist } = usePriceHistory(selectedPool);

  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (ovError && ovErr) showErrorToast(ovErr, "Failed to load analytics");
  }, [ovError, ovErr]);

  const handleSortKeyChange = (key: SortKey) => {
    setSortKey(key);
    setPage(1);
  };

  const selected = useMemo(() => {
    return overview?.pairs?.find((p) => p.pool_id === selectedPool) ?? null;
  }, [overview, selectedPool]);

  const sortedPairs = useMemo(
    () => (overview?.pairs ? sortPairs(overview.pairs, sortKey) : []),
    [overview, sortKey],
  );

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(sortedPairs.length / PER_PAGE));
  }, [sortedPairs]);

  const activePage = useMemo(() => {
    return Math.max(1, Math.min(page, totalPages));
  }, [page, totalPages]);

  const paginatedPairs = useMemo(() => {
    return sortedPairs.slice((activePage - 1) * PER_PAGE, activePage * PER_PAGE);
  }, [sortedPairs, activePage]);

  const handlePageChange = (newPage: number | ((p: number) => number)) => {
    setPage((prev) => {
      const resolved = typeof newPage === "function" ? newPage(prev) : newPage;
      return Math.max(1, Math.min(resolved, totalPages));
    });
  };

  return {
    overview,
    ovLoading,
    tvlHist,
    tvlLoading,
    volHist,
    volLoading,
    selectedPool,
    setSelectedPool,
    priceHist,
    sortKey,
    setSortKey: handleSortKeyChange,
    page: activePage,
    setPage: handlePageChange,
    selected,
    sortedPairs,
    totalPages,
    paginatedPairs,
  };
}

