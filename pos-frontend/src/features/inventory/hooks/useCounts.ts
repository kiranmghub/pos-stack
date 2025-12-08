// pos-frontend/src/features/inventory/hooks/useCounts.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCountSessionsList,
  getCountSessionDetail,
  createCountSession,
  deleteCountSession,
  scanCountItem,
  setCountQty,
  getCountVariance,
  finalizeCountSession,
  type CountSessionListParams,
  type CreateCountSessionPayload,
  type ScanPayload,
  type SetQtyPayload,
} from "../api/counts";

/**
 * React Query hook for count sessions list
 * Security: Tenant-scoped via API
 */
export function useCountSessionsList(params: CountSessionListParams) {
  return useQuery({
    queryKey: ["inventory", "counts", params],
    queryFn: () => getCountSessionsList(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for count session detail
 * Security: Tenant-scoped via API
 */
export function useCountSessionDetail(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "counts", id],
    queryFn: () => getCountSessionDetail(id!),
    enabled: !!id,
    staleTime: 10000, // 10 seconds (more frequent updates for active sessions)
  });
}

/**
 * React Query hook for count variance
 * Security: Tenant-scoped via API
 */
export function useCountVariance(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "counts", id, "variance"],
    queryFn: () => getCountVariance(id!),
    enabled: !!id,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * React Query mutation for creating count sessions
 * Security: Tenant-scoped via API, validates input
 */
export function useCreateCountSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCountSessionPayload) => createCountSession(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
    },
  });
}

/**
 * React Query mutation for deleting count sessions
 * Security: Tenant-scoped via API, only non-finalized sessions
 */
export function useDeleteCountSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteCountSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts"] });
    },
  });
}

/**
 * React Query mutation for scanning items
 * Security: Tenant-scoped via API
 */
export function useScanCountItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ScanPayload }) =>
      scanCountItem(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts", id, "variance"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts"] });
    },
  });
}

/**
 * React Query mutation for setting quantity
 * Security: Tenant-scoped via API
 */
export function useSetCountQty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SetQtyPayload }) =>
      setCountQty(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts", id, "variance"] });
    },
  });
}

/**
 * React Query mutation for finalizing count sessions
 * Security: Tenant-scoped via API, creates adjustments and ledger entries
 */
export function useFinalizeCountSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => finalizeCountSession(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "counts", id, "variance"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
    },
  });
}

