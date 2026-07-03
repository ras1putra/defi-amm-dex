"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useConfigStore } from "@/store/useConfigStore";
import type { AppConfig } from "@/lib/config";
import type { ApiResponse } from "@/types/api";
import { API_CONFIG } from "@/lib/constants";

export function useConfig() {
  const setConfig = useConfigStore((s) => s.setConfig);

  return useQuery({
    queryKey: ["app-config"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<AppConfig>>(API_CONFIG);
      setConfig(res.data.data);
      return res.data.data;
    },
    initialData: useConfigStore.getState().config ?? undefined,
  });
}
