// pos-frontend/src/features/inventory/hooks/useChannels.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAvailability,
  channelReserve,
  channelRelease,
  channelCommit,
  type ChannelReservePayload,
  type ChannelReleasePayload,
  type ChannelCommitPayload,
} from "../api/channels";
import { useNotify } from "@/lib/notify";

/**
 * React Query hook for availability
 * Security: Tenant-scoped via API, rate limited
 */
export function useAvailability(variantId: number | null, storeId: number | null) {
  return useQuery({
    queryKey: ["inventory", "availability", variantId, storeId],
    queryFn: () => getAvailability(variantId!, storeId!),
    enabled: !!variantId && !!storeId,
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });
}

/**
 * React Query mutation for channel reserve
 * Security: Tenant-scoped via API, channel validated, rate limited
 */
export function useChannelReserve() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (payload: ChannelReservePayload) => channelReserve(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "availability"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      notify.success("Stock reserved successfully");
    },
    onError: (error: any) => {
      if (error.status === 429) {
        notify.error("Rate limit exceeded. Please try again later.");
      } else {
        notify.error(error.message || "Failed to reserve stock");
      }
    },
  });
}

/**
 * React Query mutation for channel release
 * Security: Tenant-scoped via API, rate limited
 */
export function useChannelRelease() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (payload: ChannelReleasePayload) => channelRelease(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "availability"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      notify.success("Reservation released successfully");
    },
    onError: (error: any) => {
      if (error.status === 429) {
        notify.error("Rate limit exceeded. Please try again later.");
      } else {
        notify.error(error.message || "Failed to release reservation");
      }
    },
  });
}

/**
 * React Query mutation for channel commit
 * Security: Tenant-scoped via API, rate limited
 */
export function useChannelCommit() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (payload: ChannelCommitPayload) => channelCommit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "availability"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "ledger"] });
      notify.success("Reservation committed successfully");
    },
    onError: (error: any) => {
      if (error.status === 429) {
        notify.error("Rate limit exceeded. Please try again later.");
      } else {
        notify.error(error.message || "Failed to commit reservation");
      }
    },
  });
}

