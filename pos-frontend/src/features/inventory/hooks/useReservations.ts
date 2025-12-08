// pos-frontend/src/features/inventory/hooks/useReservations.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getReservationsList,
  createReservation,
  commitReservation,
  releaseReservation,
  type ReservationListParams,
  type CreateReservationPayload,
} from "../api/reservations";
import { useNotify } from "@/lib/notify";

/**
 * React Query hook for reservations list
 * Security: Tenant-scoped via API
 */
export function useReservationsList(params?: ReservationListParams) {
  return useQuery({
    queryKey: ["inventory", "reservations", "list", params],
    queryFn: () => getReservationsList(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query mutation for creating reservation
 * Security: Tenant-scoped via API
 */
export function useCreateReservation() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (payload: CreateReservationPayload) => createReservation(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      notify.success("Reservation created successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to create reservation");
    },
  });
}

/**
 * React Query mutation for committing reservation
 * Security: Tenant-scoped via API
 */
export function useCommitReservation() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (id: number) => commitReservation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      notify.success("Reservation committed successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to commit reservation");
    },
  });
}

/**
 * React Query mutation for releasing reservation
 * Security: Tenant-scoped via API
 */
export function useReleaseReservation() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (id: number) => releaseReservation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      notify.success("Reservation released successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to release reservation");
    },
  });
}

