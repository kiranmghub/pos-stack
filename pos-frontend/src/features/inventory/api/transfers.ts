// pos-frontend/src/features/inventory/api/transfers.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

export interface TransferLine {
  variant_id: number;
  sku: string;
  product: string;
  qty: number;
  qty_sent: number;
  qty_received: number;
  qty_remaining: number;
}

export interface StoreInfo {
  id: number;
  code: string;
  name: string;
}

export interface Transfer {
  id: number;
  created_at: string; // ISO datetime string
  status: "DRAFT" | "SENT" | "IN_TRANSIT" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";
  from_store: StoreInfo;
  to_store: StoreInfo;
  notes: string;
  lines: TransferLine[];
}

export interface TransferListResponse {
  results: Transfer[];
  count: number;
}

export interface TransferListParams {
  status?: string;
  store_id?: number;
  page?: number;
  page_size?: number;
}

export interface CreateTransferPayload {
  from_store_id: number;
  to_store_id: number;
  notes?: string;
  lines: Array<{
    variant_id: number;
    qty: number;
  }>;
}

export interface ReceiveTransferPayload {
  lines?: Array<{
    variant_id: number;
    qty_receive: number;
  }>;
}

/**
 * Fetch transfers list with filters
 * Security: Tenant-scoped via API
 */
export async function getTransfersList(params: TransferListParams): Promise<TransferListResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.status) {
    searchParams.append("status", params.status);
  }
  if (params.store_id !== undefined) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  return apiFetchJSON(`/api/v1/inventory/transfers?${searchParams.toString()}`);
}

/**
 * Fetch transfer detail
 * Security: Tenant-scoped via API
 */
export async function getTransferDetail(id: number): Promise<Transfer> {
  return apiFetchJSON(`/api/v1/inventory/transfers/${id}`);
}

/**
 * Create a new transfer
 * Security: Tenant-scoped via API, validates store ownership
 */
export async function createTransfer(payload: CreateTransferPayload): Promise<{ id: number; status: string }> {
  return apiFetchJSON("/api/v1/inventory/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Send a transfer (decrements source inventory)
 * Security: Tenant-scoped via API, validates stock availability
 */
export async function sendTransfer(id: number): Promise<{ ok: boolean; status: string }> {
  return apiFetchJSON(`/api/v1/inventory/transfers/${id}?action=send`, {
    method: "POST",
  });
}

/**
 * Receive a transfer (increments destination inventory)
 * Security: Tenant-scoped via API, supports partial receiving
 */
export async function receiveTransfer(
  id: number,
  payload?: ReceiveTransferPayload
): Promise<{ ok: boolean; status: string }> {
  return apiFetchJSON(`/api/v1/inventory/transfers/${id}?action=receive`, {
    method: "POST",
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

/**
 * Cancel a transfer
 * Security: Tenant-scoped via API, only DRAFT transfers can be cancelled
 */
export async function cancelTransfer(id: number): Promise<{ ok: boolean; status: string }> {
  return apiFetchJSON(`/api/v1/inventory/transfers/${id}?action=cancel`, {
    method: "POST",
  });
}

