import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types/api";
import type { Pair } from "@/types/dex";
import { API_DEX_PAIRS } from "@/lib/constants";

export function usePairs() {
  return useQuery({
    queryKey: ["pairs"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Pair[]>>(API_DEX_PAIRS);
      return res.data.data;
    },
    staleTime: 30000,
  });
}
