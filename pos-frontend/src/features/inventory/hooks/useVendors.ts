// pos-frontend/src/features/inventory/hooks/useVendors.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getVendorsList,
  getVendorDetail,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorScorecard,
  type VendorListParams,
  type CreateVendorPayload,
  type Vendor,
} from "../api/vendors";
import { useNotify } from "@/lib/notify";

/**
 * React Query hook for vendors list
 * Security: Tenant-scoped via API
 */
export function useVendorsList(params?: VendorListParams) {
  return useQuery({
    queryKey: ["vendors", "list", params],
    queryFn: () => getVendorsList(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * React Query hook for vendor detail
 * Security: Tenant-scoped via API
 */
export function useVendorDetail(id: number | null) {
  return useQuery({
    queryKey: ["vendors", "detail", id],
    queryFn: () => getVendorDetail(id!),
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });
}

/**
 * React Query hook for vendor scorecard
 * Security: Tenant-scoped via API
 */
export function useVendorScorecard(vendorId: number | null, daysBack?: number) {
  return useQuery({
    queryKey: ["vendors", "scorecard", vendorId, daysBack],
    queryFn: () => getVendorScorecard(vendorId!, daysBack),
    enabled: !!vendorId,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * React Query mutation for creating vendor
 * Security: Tenant-scoped via API
 */
export function useCreateVendor() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (payload: CreateVendorPayload) => createVendor(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      notify.success("Vendor created successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to create vendor");
    },
  });
}

/**
 * React Query mutation for updating vendor
 * Security: Tenant-scoped via API
 */
export function useUpdateVendor() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateVendorPayload> }) =>
      updateVendor(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["vendors", "detail", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["vendors", "scorecard", variables.id] });
      notify.success("Vendor updated successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to update vendor");
    },
  });
}

/**
 * React Query mutation for deleting vendor
 * Security: Tenant-scoped via API
 */
export function useDeleteVendor() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (id: number) => deleteVendor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      notify.success("Vendor deleted successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to delete vendor");
    },
  });
}

