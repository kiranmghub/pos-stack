// pos-frontend/src/features/inventory/hooks/useAdjustments.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAdjustmentsList,
  getAdjustmentReasons,
  createAdjustment,
  type AdjustmentListParams,
  type CreateAdjustmentRequest,
} from "../api/adjustments";

/**
 * React Query hook for adjustments list
 * Security: Tenant-scoped via API
 */
export function useAdjustmentsList(params: AdjustmentListParams) {
  return useQuery({
    queryKey: ["inventory", "adjustments", params],
    queryFn: () => getAdjustmentsList(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for adjustment reasons
 * Security: Tenant-scoped via API
 */
export function useAdjustmentReasons() {
  return useQuery({
    queryKey: ["inventory", "adjustment-reasons"],
    queryFn: getAdjustmentReasons,
    staleTime: 5 * 60 * 1000, // 5 minutes (reasons don't change often)
  });
}

/**
 * React Query mutation for creating adjustments
 * Security: Tenant-scoped via API, validates input
 */
export function useCreateAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateAdjustmentRequest) => createAdjustment(request),
    onSuccess: () => {
      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["inventory", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
    },
  });
}

