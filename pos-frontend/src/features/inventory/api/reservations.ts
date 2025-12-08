// pos-frontend/src/features/inventory/api/reservations.ts
import { apiFetchJSON } from "@/lib/auth";

export interface Reservation {
  id: number;
  store_id: number;
  store_name: string;
  store_code: string;
  variant_id: number;
  sku: string;
  product_name: string;
  quantity: number;
  status: "ACTIVE" | "COMMITTED" | "RELEASED" | "EXPIRED";
  ref_type: string;
  ref_id: number | null;
  channel: string;
  note: string;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ReservationListResponse {
  results: Reservation[];
  count: number;
}

export interface ReservationListParams {
  store_id?: number | null;
  variant_id?: number | null;
  status?: string;
  channel?: string;
  page?: number;
  page_size?: number;
}

export interface CreateReservationPayload {
  store_id: number;
  variant_id: number;
  quantity: number;
  ref_type: string;
  ref_id?: number | null;
  channel?: string;
  note?: string;
  expires_at?: string | null;
}

export interface CreateReservationResponse {
  id: number;
  status: string;
  quantity: number;
}

export interface CommitReservationResponse {
  id: number;
  status: string;
  on_hand_after: number;
  reserved_after: number;
}

export interface ReleaseReservationResponse {
  id: number;
  status: string;
}

/**
 * Fetch reservations list with filters
 * Security: Tenant-scoped via API
 */
export async function getReservationsList(
  params?: ReservationListParams
): Promise<ReservationListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.store_id !== undefined && params?.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.variant_id !== undefined && params?.variant_id !== null) {
    searchParams.append("variant_id", params.variant_id.toString());
  }
  if (params?.status) {
    searchParams.append("status", params.status);
  }
  if (params?.channel) {
    searchParams.append("channel", params.channel);
  }
  if (params?.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params?.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/inventory/reservations${queryString ? `?${queryString}` : ""}`
  );
}

/**
 * Create a new reservation
 * Security: Tenant-scoped via API
 */
export async function createReservation(
  payload: CreateReservationPayload
): Promise<CreateReservationResponse> {
  return apiFetchJSON("/api/v1/inventory/reservations/reserve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Commit a reservation (fulfill)
 * Security: Tenant-scoped via API
 */
export async function commitReservation(
  id: number
): Promise<CommitReservationResponse> {
  return apiFetchJSON(`/api/v1/inventory/reservations/${id}/commit`, {
    method: "POST",
  });
}

/**
 * Release a reservation (cancel)
 * Security: Tenant-scoped via API
 */
export async function releaseReservation(
  id: number
): Promise<ReleaseReservationResponse> {
  return apiFetchJSON(`/api/v1/inventory/reservations/${id}/release`, {
    method: "POST",
  });
}

