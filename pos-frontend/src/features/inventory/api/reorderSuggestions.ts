// pos-frontend/src/features/inventory/api/reorderSuggestions.ts
import { apiFetchJSON } from "@/lib/auth";

export interface ReorderSuggestion {
  variant_id: number;
  product_name: string;
  sku: string | null;
  barcode?: string | null;
  store_id: number;
  store_name: string;
  store_code: string;
  on_hand: number; // Current stock
  reorder_point: number | null; // Variant's reorder point (may be null)
  threshold: number; // Effective threshold (variant or tenant default)
  suggested_qty: number;
  current_vs_threshold?: string; // e.g., "5/10"
}

// Helper to convert backend response to frontend type
export function mapBackendSuggestion(backend: any): ReorderSuggestion {
  return {
    variant_id: backend.variant_id,
    product_name: backend.product_name,
    sku: backend.sku || null,
    barcode: backend.barcode || null,
    store_id: backend.store_id,
    store_name: backend.store_name,
    store_code: backend.store_code,
    on_hand: backend.on_hand,
    reorder_point: backend.reorder_point,
    threshold: backend.threshold,
    suggested_qty: backend.suggested_qty,
    current_vs_threshold: backend.current_vs_threshold,
  };
}

export interface ReorderSuggestionListResponse {
  results: ReorderSuggestion[];
  count: number;
}

export interface ReorderSuggestionListParams {
  store_id?: number | null;
  category_id?: number | null;
  page?: number;
  page_size?: number;
}

/**
 * Fetch reorder suggestions list with filters
 * Security: Tenant-scoped via API
 */
export async function getReorderSuggestionsList(
  params: ReorderSuggestionListParams
): Promise<ReorderSuggestionListResponse> {
  const searchParams = new URLSearchParams();

  if (params.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params.category_id !== undefined && params.category_id !== null) {
    searchParams.append("category_id", params.category_id.toString());
  }
  if (params.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  return apiFetchJSON(`/api/v1/inventory/reorder_suggestions?${searchParams.toString()}`);
}

