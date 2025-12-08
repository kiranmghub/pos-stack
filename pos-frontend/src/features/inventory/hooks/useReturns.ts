// pos-frontend/src/features/inventory/hooks/useReturns.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInspectionQueue,
  getReturnDetail,
  inspectReturn,
  acceptReturn,
  rejectReturn,
  finalizeReturn,
  type InspectReturnRequest,
} from "../api/returns";
import { useNotify } from "@/lib/notify";

/**
 * React Query hook for inspection queue
 * Security: Tenant-scoped via API
 */
export function useInspectionQueue(params?: { store_id?: number }) {
  return useQuery({
    queryKey: ["inventory", "returns", "inspection_queue", params],
    queryFn: () => getInspectionQueue(params),
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

/**
 * React Query hook for return detail
 * Security: Tenant-scoped via API
 */
export function useReturnDetail(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "returns", id],
    queryFn: () => getReturnDetail(id!),
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query mutation for inspecting return items
 * Security: Tenant-scoped via API
 */
export function useInspectReturn() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: ({
      returnId,
      payload,
    }: {
      returnId: number;
      payload: InspectReturnRequest;
    }) => inspectReturn(returnId, payload),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "returns"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "returns", variables.returnId],
      });
      notify.success(data.message || "Return items inspected successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to inspect return items");
    },
  });
}

/**
 * React Query mutation for accepting return
 * Security: Tenant-scoped via API
 */
export function useAcceptReturn() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (returnId: number) => acceptReturn(returnId),
    onSuccess: (_, returnId) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "returns"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "returns", returnId],
      });
      notify.success("Return accepted successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to accept return");
    },
  });
}

/**
 * React Query mutation for rejecting return
 * Security: Tenant-scoped via API
 */
export function useRejectReturn() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (returnId: number) => rejectReturn(returnId),
    onSuccess: (_, returnId) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "returns"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "returns", returnId],
      });
      notify.success("Return rejected successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to reject return");
    },
  });
}

/**
 * React Query mutation for finalizing return
 * Security: Tenant-scoped via API
 */
export function useFinalizeReturn() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (returnId: number) => finalizeReturn(returnId),
    onSuccess: (_, returnId) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "returns"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "returns", returnId],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      notify.success("Return finalized successfully. Inventory updated.");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to finalize return");
    },
  });
}

