// pos-frontend/src/features/inventory/api/adjustments.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

export interface AdjustmentReason {
  id: number;
  code: string;
  name: string;
}

export interface AdjustmentLineRequest {
  variant_id: number;
  delta: number;
}

export interface AdjustmentLine {
  variant_id: number;
  product_name: string;
  sku: string | null;
  delta: number;
}

export interface CreateAdjustmentRequest {
  store_id: number;
  reason_code: string;
  note?: string;
  lines: AdjustmentLineRequest[];
}

export interface AdjustmentLine {
  variant_id: number;
  product_name: string;
  sku: string | null;
  delta: number;
}

export interface Adjustment {
  id: number;
  created_at: string;
  store_id: number;
  reason: {
    code: string;
    name: string;
  };
  note: string;
  created_by: string | null;
  lines: AdjustmentLine[];
}

export interface AdjustmentResponse extends Adjustment {}

export interface AdjustmentListResponse {
  results: Adjustment[];
  count: number;
}

export interface AdjustmentListParams {
  store_id?: number | null;
  page?: number;
  page_size?: number;
}

/**
 * Fetch adjustment reasons
 * Security: Tenant-scoped, requires authentication
 */
export async function getAdjustmentReasons(): Promise<AdjustmentReason[]> {
  return apiFetchJSON<AdjustmentReason[]>("/api/v1/inventory/reasons");
}

/**
 * Create inventory adjustment
 * Security: Tenant-scoped, requires authentication, validates store ownership
 */
export async function createAdjustment(
  request: CreateAdjustmentRequest
): Promise<AdjustmentResponse> {
  // Validate input
  if (!request.store_id) {
    throw new Error("store_id is required");
  }
  if (!request.reason_code) {
    throw new Error("reason_code is required");
  }
  if (!request.lines || request.lines.length === 0) {
    throw new Error("At least one adjustment line is required");
  }

  // Validate each line
  for (const line of request.lines) {
    if (!line.variant_id) {
      throw new Error("variant_id is required for all lines");
    }
    if (line.delta === 0) {
      throw new Error("delta cannot be zero");
    }
  }

  const response = await apiFetch("/api/v1/inventory/adjustments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to create adjustment" }));
    throw new Error(error.error || "Failed to create adjustment");
  }

  return response.json();
}

/**
 * Fetch adjustments list with filters
 * Security: Tenant-scoped via API
 */
export async function getAdjustmentsList(params: AdjustmentListParams): Promise<AdjustmentListResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  return apiFetchJSON(`/api/v1/inventory/adjustments?${searchParams.toString()}`);
}

