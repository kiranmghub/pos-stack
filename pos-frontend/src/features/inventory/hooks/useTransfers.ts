// pos-frontend/src/features/inventory/hooks/useTransfers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransfersList,
  getTransferDetail,
  createTransfer,
  sendTransfer,
  receiveTransfer,
  cancelTransfer,
  type TransferListParams,
  type CreateTransferPayload,
  type ReceiveTransferPayload,
} from "../api/transfers";

/**
 * React Query hook for transfers list
 * Security: Tenant-scoped via API
 */
export function useTransfersList(params: TransferListParams) {
  return useQuery({
    queryKey: ["inventory", "transfers", params],
    queryFn: () => getTransfersList(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for transfer detail
 * Security: Tenant-scoped via API
 */
export function useTransferDetail(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "transfers", id],
    queryFn: () => getTransferDetail(id!),
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query mutation for creating transfers
 * Security: Tenant-scoped via API, validates input
 */
export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTransferPayload) => createTransfer(payload),
    onSuccess: () => {
      // Invalidate transfers list to refresh data
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
    },
  });
}

/**
 * React Query mutation for sending transfers
 * Security: Tenant-scoped via API, validates stock availability
 */
export function useSendTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => sendTransfer(id),
    onSuccess: (_, id) => {
      // Invalidate transfers list and detail
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
    },
  });
}

/**
 * React Query mutation for receiving transfers
 * Security: Tenant-scoped via API, supports partial receiving
 */
export function useReceiveTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload?: ReceiveTransferPayload }) =>
      receiveTransfer(id, payload),
    onSuccess: (_, { id }) => {
      // Invalidate transfers list and detail
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
    },
  });
}

/**
 * React Query mutation for cancelling transfers
 * Security: Tenant-scoped via API, only DRAFT transfers can be cancelled
 */
export function useCancelTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => cancelTransfer(id),
    onSuccess: (_, id) => {
      // Invalidate transfers list and detail
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "transfers", id] });
    },
  });
}

