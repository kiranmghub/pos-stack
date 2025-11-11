// pos-frontend/src/features/sales/api.ts
import { apiFetchJSON } from "@/lib/auth";
import { ensureAuthedFetch } from "@/components/AppShell";

export type SaleRow = {
  id: number;
  receipt_no: string;
  created_at: string;
  store_name?: string | null;
  cashier_name?: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  status: "pending" | "completed" | "void";
  lines_count: number;
};

export type SaleDetail = {
  id: number;
  receipt_no: string;
  created_at: string;
  updated_at: string;
  store_name?: string | null;
  cashier_name?: string | null;
  status: "pending" | "completed" | "void";
  subtotal: string;
  discount_total: string;
  tax_total: string;
  fee_total: string;
  total: string;
  receipt_data?: any;
  lines: Array<{
    id: number;
    product_name?: string | null;
    variant_name?: string | null;
    sku?: string | null;
    quantity: number;
    unit_price: string;
    discount?: string | null;
    tax?: string | null;
    fee?: string | null;
    line_total: string;
  }>;
  payments: Array<{
    id: number;
    tender_type: "CASH" | "CARD" | "OTHER";
    amount: string;
    received?: string | null;
    change?: string | null;
    txn_ref?: string | null;
    meta?: any;
    created_at: string;
  }>;
};

export async function listSales(params: {
  page?: number;
  page_size?: number;
  query?: string;
  store_id?: string | number;
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<{ count: number; results: SaleRow[] }> {
  const url = new URL("/api/v1/orders/", window.location.origin);
  const q = url.searchParams;
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.query) q.set("query", params.query);
  if (params?.store_id) q.set("store_id", String(params.store_id));
  if (params?.status) q.set("status", params.status);
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  return apiFetchJSON(url.pathname + "?" + q.toString());
}

export async function getSale(id: number): Promise<SaleDetail> {
  return apiFetchJSON(`/api/v1/orders/${id}`);
}


export async function listInventoryStores(): Promise<{
    id:number;
    name:string;
    code?:string;
    is_active?: boolean}[]> {
  const url = new URL("/api/v1/stores/stores-lite", window.location.origin);
  const res = await apiFetchJSON(url.toString());
  return Array.isArray(res) ? res : (res?.results ?? []);
}

// ---- Returns API ----
export async function listReturnsForSale(saleId: number) {
  return apiFetchJSON(`/api/v1/orders/${saleId}/returns`, { method: "GET" });
}

export async function startReturnForSale(saleId: number, reason_code?: string, notes?: string) {
  return apiFetchJSON(`/api/v1/orders/${saleId}/returns`, {
    method: "POST",
    body: JSON.stringify({ reason_code, notes }),
  });
}

export async function putReturnItems(returnId: number, items: Array<{ sale_line: number; qty_returned: number; restock?: boolean; condition?: string }>) {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/items`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function finalizeReturn(returnId: number, refunds: Array<{ method: string; amount: number; external_ref?: string }>) {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/finalize`, {
    method: "POST",
    body: JSON.stringify({ refunds }),
  });
}

export async function getReturnById(id: number) {
  return apiFetchJSON(`/api/v1/orders/returns/${id}`, { method: "GET" });
}

export async function deleteReturnItem(returnItemId: number) {
  return apiFetchJSON(`/api/v1/orders/return-items/${returnItemId}`, { method: "DELETE" });
}

export async function voidReturn(returnId: number) {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/void`, { method: "POST" });
}
