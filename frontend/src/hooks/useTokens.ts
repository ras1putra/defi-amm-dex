import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types/api";
import type { ApiToken } from "@/types/dex";
import { API_DEX_TOKENS } from "@/lib/constants";

export function useTokens() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<ApiToken[]>>(API_DEX_TOKENS, {
        params: {
          limit: 1000,
        },
      });
      return res.data.data;
    },
    staleTime: 5000,
  });
}

