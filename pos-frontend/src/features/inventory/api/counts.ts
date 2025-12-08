// pos-frontend/src/features/inventory/api/counts.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

export interface CountLine {
  id: number;
  variant_id: number;
  sku: string | null;
  product_name: string;
  expected_qty: number | null;
  counted_qty: number;
  method: string; // "SCAN" | "KEYED"
  location: string;
}

export interface StoreInfo {
  id: number;
  code: string;
  name: string;
}

export interface CountSession {
  id: number;
  code: string;
  status: "DRAFT" | "IN_PROGRESS" | "FINALIZED";
  scope: "FULL_STORE" | "ZONE";
  zone_name: string | null;
  note: string;
  store: StoreInfo;
  created_at: string; // ISO datetime string
  started_at: string | null;
  finalized_at: string | null;
  lines: CountLine[];
}

export interface CountSessionListResponse {
  results: CountSession[];
  count: number;
}

export interface CountSessionListParams {
  store_id?: number | null;
  status?: string;
  q?: string; // search query
  page?: number;
  page_size?: number;
}

export interface CreateCountSessionPayload {
  store_id: number;
  code?: string;
  note?: string;
  scope: "FULL_STORE" | "ZONE";
  zone_name?: string; // required if scope is ZONE
}

export interface ScanPayload {
  barcode?: string;
  sku?: string;
  variant_id?: number;
  qty?: number; // defaults to 1
  location?: string;
}

export interface SetQtyPayload {
  variant_id: number;
  counted_qty: number;
  location?: string;
}

export interface VarianceLine {
  variant_id: number;
  sku: string | null;
  product_name: string;
  expected_qty: number;
  counted_qty: number;
  variance: number;
  location: string;
}

export interface VarianceResponse {
  session_id: number;
  session_code: string;
  status: string;
  scope: "FULL_STORE" | "ZONE";
  zone_name: string | null;
  store: StoreInfo;
  lines: VarianceLine[];
  summary: {
    total_lines: number;
    lines_with_variance: number;
    total_expected: number;
    total_counted: number;
    total_variance: number;
  };
}

/**
 * Fetch count sessions list with filters
 * Security: Tenant-scoped via API
 */
export async function getCountSessionsList(params: CountSessionListParams): Promise<CountSessionListResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params.status) {
    searchParams.append("status", params.status);
  }
  if (params.q) {
    searchParams.append("q", params.q);
  }
  if (params.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  return apiFetchJSON(`/api/v1/inventory/counts?${searchParams.toString()}`);
}

/**
 * Fetch count session detail
 * Security: Tenant-scoped via API
 */
export async function getCountSessionDetail(id: number): Promise<CountSession> {
  return apiFetchJSON(`/api/v1/inventory/counts/${id}`);
}

/**
 * Create a new count session
 * Security: Tenant-scoped via API, validates store ownership and scope rules
 */
export async function createCountSession(payload: CreateCountSessionPayload): Promise<{ id: number }> {
  return apiFetchJSON("/api/v1/inventory/counts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Delete a count session
 * Security: Tenant-scoped via API, only non-finalized sessions can be deleted
 */
export async function deleteCountSession(id: number): Promise<void> {
  await apiFetch(`/api/v1/inventory/counts/${id}`, {
    method: "DELETE",
  });
}

/**
 * Scan a barcode/SKU/variant in a count session
 * Security: Tenant-scoped via API
 */
export async function scanCountItem(id: number, payload: ScanPayload): Promise<{ ok: boolean; line_id: number; counted_qty: number }> {
  return apiFetchJSON(`/api/v1/inventory/counts/${id}/scan`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Set quantity for a variant in a count session
 * Security: Tenant-scoped via API
 */
export async function setCountQty(id: number, payload: SetQtyPayload): Promise<{ ok: boolean }> {
  return apiFetchJSON(`/api/v1/inventory/counts/${id}/set_qty`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Get variance preview for a count session
 * Security: Tenant-scoped via API
 */
export async function getCountVariance(id: number): Promise<VarianceResponse> {
  return apiFetchJSON(`/api/v1/inventory/counts/${id}/variance`);
}

/**
 * Finalize a count session
 * Security: Tenant-scoped via API, creates adjustments and ledger entries
 */
export async function finalizeCountSession(id: number): Promise<{ ok: boolean; summary: { created: number; zero: number; adjusted: number } }> {
  return apiFetchJSON(`/api/v1/inventory/counts/${id}/finalize`, {
    method: "POST",
  });
}

