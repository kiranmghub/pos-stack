// pos-frontend/src/features/inventory/api/channels.ts
import { apiFetchJSON } from "@/lib/auth";

export interface AvailabilityResponse {
  variant_id: number;
  store_id: number;
  sku: string;
  product_name: string;
  on_hand: number;
  reserved: number;
  available: number;
  in_transit: number;
}

export interface ChannelReservePayload {
  store_id: number;
  variant_id: number;
  quantity: number;
  ref_type: string;
  ref_id?: number | null;
  channel: string;
  note?: string;
  expires_at?: string | null;
}

export interface ChannelReserveResponse {
  id: number;
  status: string;
  quantity: number;
  channel: string;
}

export interface ChannelReleasePayload {
  reservation_id: number;
}

export interface ChannelReleaseResponse {
  id: number;
  status: string;
  channel: string;
}

export interface ChannelCommitPayload {
  reservation_id: number;
}

export interface ChannelCommitResponse {
  id: number;
  status: string;
  channel: string;
  on_hand_after: number;
  reserved_after: number;
}

/**
 * Check availability for a variant at a store
 * Security: Tenant-scoped via API, rate limited
 */
export async function getAvailability(
  variantId: number,
  storeId: number
): Promise<AvailabilityResponse> {
  return apiFetchJSON(
    `/api/v1/inventory/availability?variant_id=${variantId}&store_id=${storeId}`
  );
}

/**
 * Reserve stock for a channel
 * Security: Tenant-scoped via API, channel validated, rate limited
 */
export async function channelReserve(
  payload: ChannelReservePayload
): Promise<ChannelReserveResponse> {
  return apiFetchJSON("/api/v1/inventory/reserve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Release a reservation
 * Security: Tenant-scoped via API, rate limited
 */
export async function channelRelease(
  payload: ChannelReleasePayload
): Promise<ChannelReleaseResponse> {
  return apiFetchJSON("/api/v1/inventory/release", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Commit a reservation
 * Security: Tenant-scoped via API, rate limited
 */
export async function channelCommit(
  payload: ChannelCommitPayload
): Promise<ChannelCommitResponse> {
  return apiFetchJSON("/api/v1/inventory/commit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

