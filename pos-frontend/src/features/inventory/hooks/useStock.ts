// pos-frontend/src/features/inventory/hooks/useStock.ts
import { useQuery } from "@tanstack/react-query";
import { getStockList, getStockAcrossStores, type StockListParams } from "../api/stock";
// Re-export adjustment hooks from useAdjustments for backward compatibility
export { useAdjustmentReasons, useCreateAdjustment } from "./useAdjustments";

/**
 * React Query hook for stock list
 * Security: Tenant-scoped via API
 */
export function useStockList(
  params: StockListParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["inventory", "stock", params],
    queryFn: () => getStockList(params),
    enabled: options?.enabled !== undefined ? options.enabled : !!params.store_id, // Only fetch if store_id is provided
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for stock across stores
 * Security: Tenant-scoped via API
 */
export function useStockAcrossStores(variantId: number | null) {
  return useQuery({
    queryKey: ["inventory", "stock-across-stores", variantId],
    queryFn: () => getStockAcrossStores(variantId!),
    enabled: !!variantId, // Only fetch if variantId is provided
    staleTime: 30000, // 30 seconds
  });
}


