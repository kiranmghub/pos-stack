// pos-frontend/src/features/inventory/hooks/useForecasting.ts
import { useQuery } from "@tanstack/react-query";
import {
  getReorderForecast,
  getAtRiskItems,
  type ReorderForecastParams,
  type AtRiskItemsParams,
} from "../api/forecasting";

/**
 * React Query hook for reorder forecast
 * Security: Tenant-scoped via API
 */
export function useReorderForecast(params: ReorderForecastParams) {
  return useQuery({
    queryKey: ["inventory", "reorder-forecast", params],
    queryFn: () => getReorderForecast(params),
    enabled: !!params.variant_id && !!params.store_id,
    staleTime: 300000, // 5 minutes (forecasts don't change frequently)
  });
}

/**
 * React Query hook for at-risk items
 * Security: Tenant-scoped via API
 */
export function useAtRiskItems(params?: AtRiskItemsParams) {
  return useQuery({
    queryKey: ["inventory", "at-risk-items", params],
    queryFn: () => getAtRiskItems(params),
    staleTime: 300000, // 5 minutes
  });
}

