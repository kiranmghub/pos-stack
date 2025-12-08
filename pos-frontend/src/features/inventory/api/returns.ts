// pos-frontend/src/features/inventory/api/returns.ts
import { apiFetchJSON } from "@/lib/auth";

export type ReturnStatus =
  | "draft"
  | "awaiting_inspection"
  | "accepted"
  | "rejected"
  | "finalized"
  | "void";

export type ReturnItemDisposition = "PENDING" | "RESTOCK" | "WASTE";
export type ReturnItemCondition = "RESALEABLE" | "DAMAGED" | "OPEN_BOX";

export interface ReturnItem {
  id: number;
  sale_line: number;
  qty_returned: number;
  restock: boolean;
  condition: ReturnItemCondition;
  disposition: ReturnItemDisposition;
  inspected_by: number | null;
  inspected_at: string | null;
  refund_subtotal: string;
  refund_tax: string;
  refund_total: string;
  created_at: string;
  reason_code: string | null;
  notes: string | null;
  product_name: string;
  variant_name: string;
  sku: string;
  original_quantity: number;
  original_unit_price: string;
  original_subtotal: string;
  original_discount: string;
  original_tax: string;
  original_fee: string;
  original_total: string;
}

export interface Return {
  id: number;
  tenant?: number;
  store: number;
  store_name?: string;
  sale: number;
  sale_receipt_no?: string;
  processed_by?: number;
  processed_by_username?: string;
  status: ReturnStatus;
  return_no: string | null;
  reason_code: string | null;
  notes: string | null;
  refund_total: string;
  refund_subtotal_total?: string;
  refund_tax_total?: string;
  created_at: string;
  updated_at?: string;
  items: ReturnItem[];
}

export interface ReturnListResponse {
  results: Return[];
  count: number;
}

export interface ReturnListParams {
  status?: string;
  store_id?: number;
  date_from?: string;
  date_to?: string;
  query?: string;
  page?: number;
  page_size?: number;
}

export interface InspectionItemRequest {
  return_item_id: number;
  disposition: "RESTOCK" | "WASTE";
  condition?: ReturnItemCondition;
  notes?: string;
}

export interface InspectReturnRequest {
  items: InspectionItemRequest[];
}

/**
 * Get returns inspection queue
 * Security: Tenant-scoped via API
 */
export async function getInspectionQueue(
  params?: { store_id?: number }
): Promise<ReturnListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.store_id) {
    searchParams.append("store_id", params.store_id.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/orders/returns/inspection_queue${queryString ? `?${queryString}` : ""}`
  );
}

/**
 * Get return detail
 * Security: Tenant-scoped via API
 */
export async function getReturnDetail(id: number): Promise<Return> {
  return apiFetchJSON(`/api/v1/orders/returns/${id}`);
}

/**
 * Inspect return items (set dispositions)
 * Security: Tenant-scoped via API
 */
export async function inspectReturn(
  returnId: number,
  payload: InspectReturnRequest
): Promise<{ message: string; return: Return }> {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/inspect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Accept return after inspection
 * Security: Tenant-scoped via API
 */
export async function acceptReturn(returnId: number): Promise<Return> {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/accept`, {
    method: "POST",
  });
}

/**
 * Reject return after inspection
 * Security: Tenant-scoped via API
 */
export async function rejectReturn(returnId: number): Promise<Return> {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/reject`, {
    method: "POST",
  });
}

/**
 * Finalize return (process inventory updates)
 * Security: Tenant-scoped via API
 */
export async function finalizeReturn(returnId: number): Promise<Return> {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/finalize`, {
    method: "POST",
  });
}

