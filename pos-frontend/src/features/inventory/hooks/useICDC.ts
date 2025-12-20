// pos-frontend/src/features/inventory/hooks/useICDC.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  parseICDCPDF,
  saveICDCDraft,
  submitICDCInvoice,
  getICDCInvoicesList,
  getICDCInvoiceDetail,
  updateICDCInvoice,
  deleteICDCInvoice,
  reverseICDCInvoice,
  type ICDCListParams,
  type ICDCSaveDraftPayload,
} from "../api/icdc";

/**
 * React Query mutation for parsing ICDC PDF
 */
export function useParseICDCPDF() {
  return useMutation({
    mutationFn: (file: File) => parseICDCPDF(file),
  });
}

/**
 * React Query mutation for saving ICDC draft
 */
export function useSaveICDCDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ICDCSaveDraftPayload) => saveICDCDraft(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "icdc"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
    },
  });
}

/**
 * React Query mutation for submitting ICDC invoice
 */
export function useSubmitICDCInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, update_variant_cost }: { id: number; update_variant_cost?: boolean }) =>
      submitICDCInvoice(id, { update_variant_cost }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "icdc"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
    },
  });
}

/**
 * React Query hook for ICDC invoices list
 */
export function useICDCInvoicesList(params?: ICDCListParams) {
  return useQuery({
    queryKey: ["inventory", "icdc", params],
    queryFn: () => getICDCInvoicesList(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for ICDC invoice detail
 */
export function useICDCInvoiceDetail(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "icdc", id],
    queryFn: () => getICDCInvoiceDetail(id!),
    enabled: !!id,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * React Query mutation for updating ICDC invoice
 */
export function useUpdateICDCInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: {
        store_id?: number;
        vendor_id?: number;
        invoice_date?: string;
        canonical_data?: Record<string, any>;
      };
    }) => updateICDCInvoice(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "icdc"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "icdc", id] });
    },
  });
}

/**
 * React Query mutation for deleting ICDC invoice
 */
export function useDeleteICDCInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteICDCInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "icdc"] });
    },
  });
}

/**
 * React Query mutation for reversing ICDC invoice
 */
export function useReverseICDCInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => reverseICDCInvoice(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "icdc"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "icdc", id] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] });
    },
  });
}

