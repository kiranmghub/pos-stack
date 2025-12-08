// pos-frontend/src/features/inventory/hooks/useInventory.ts
import { useQuery } from "@tanstack/react-query";
import { getInventoryOverview, getAtRiskItems, type InventoryOverviewParams } from "../api/inventory";

/**
 * React Query hook for inventory overview
 */
export function useInventoryOverview(params?: InventoryOverviewParams) {
  return useQuery({
    queryKey: ["inventory", "overview", params],
    queryFn: () => getInventoryOverview(params),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * React Query hook for at-risk items
 */
export function useAtRiskItems(params?: {
  limit?: number;
  store_id?: number;
  min_confidence?: number;
}) {
  return useQuery({
    queryKey: ["inventory", "at-risk-items", params],
    queryFn: () => getAtRiskItems(params),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

