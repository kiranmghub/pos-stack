// pos-frontend/src/features/inventory/hooks/usePurchaseOrders.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPurchaseOrdersList,
  getPurchaseOrderDetail,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  submitPurchaseOrder,
  receivePurchaseOrder,
  getVendorsList,
  createVendor,
  receiveExternalPO,
  type PurchaseOrderListParams,
  type CreatePOPayload,
  type UpdatePOPayload,
  type ReceivePOPayload,
  type CreateVendorPayload,
  type ExternalPOReceivePayload,
} from "../api/purchaseOrders";

/**
 * React Query hook for purchase orders list
 * Security: Tenant-scoped via API
 */
export function usePurchaseOrdersList(params: PurchaseOrderListParams) {
  return useQuery({
    queryKey: ["inventory", "purchase-orders", params],
    queryFn: () => getPurchaseOrdersList(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for purchase order detail
 * Security: Tenant-scoped via API
 */
export function usePurchaseOrderDetail(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "purchase-orders", id],
    queryFn: () => getPurchaseOrderDetail(id!),
    enabled: !!id,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * React Query hook for vendors list
 * Security: Tenant-scoped via API
 */
export function useVendorsList(params?: { q?: string; page?: number; page_size?: number }) {
  return useQuery({
    queryKey: ["inventory", "vendors", params],
    queryFn: () => getVendorsList(params),
    staleTime: 60000, // 60 seconds (vendors change less frequently)
  });
}

/**
 * React Query mutation for creating purchase orders
 * Security: Tenant-scoped via API, validates input
 */
export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreatePOPayload) => createPurchaseOrder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
    },
  });
}

/**
 * React Query mutation for updating purchase orders
 * Security: Tenant-scoped via API, only DRAFT status
 */
export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePOPayload }) =>
      updatePurchaseOrder(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders", id] });
    },
  });
}

/**
 * React Query mutation for deleting purchase orders
 * Security: Tenant-scoped via API, only DRAFT status
 */
export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deletePurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
    },
  });
}

/**
 * React Query mutation for submitting purchase orders
 * Security: Tenant-scoped via API
 */
export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => submitPurchaseOrder(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders", id] });
    },
  });
}

/**
 * React Query mutation for receiving purchase orders
 * Security: Tenant-scoped via API, updates inventory and creates ledger entries
 */
export function useReceivePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReceivePOPayload }) =>
      receivePurchaseOrder(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
    },
  });
}

/**
 * React Query mutation for creating vendors
 * Security: Tenant-scoped via API
 */
export function useCreateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateVendorPayload) => createVendor(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "vendors"] });
    },
  });
}

/**
 * React Query mutation for receiving external purchase orders
 * Security: Tenant-scoped via API, validates inputs, updates inventory, creates ledger entries
 */
export function useReceiveExternalPO() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ExternalPOReceivePayload) => receiveExternalPO(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
    },
  });
}

