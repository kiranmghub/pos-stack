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

export type ReturnListRow = {
  id: number;
  return_no?: string | null;
  status: "draft" | "finalized" | "void";
  sale: number;
  sale_receipt_no?: string | null;
  store?: number;
  store_name?: string | null;
  store_code?: string | null;
  cashier_name?: string | null;
  processed_by_name?: string | null;
  reason_code?: string | null;
  reason_summary?: string | null;
  refund_total: string;
  refund_subtotal_total?: string;
  refund_tax_total?: string;
  items_count?: number;
  created_at: string;
};

export type PaymentListRow = {
  id: number;
  sale_id: number;
  sale_receipt_no?: string | null;
  store_name?: string | null;
  store_code?: string | null;
  cashier_name?: string | null;
  type: "CASH" | "CARD" | "STORE_CREDIT" | "OTHER";
  amount: string;
  received?: string;
  change?: string;
  txn_ref?: string | null;
  created_at: string;
};

export type RefundListRow = {
  id: number;
  return_ref_id: number;
  return_no?: string | null;
  sale_id: number;
  sale_receipt_no?: string | null;
  store_name?: string | null;
  store_code?: string | null;
  method: "CASH" | "CARD" | "STORE_CREDIT" | "OTHER";
  amount: string;
  external_ref?: string | null;
  created_at: string;
};

export type DiscountRuleSummary = {
  code: string;
  name: string;
  total_discount_amount: string;
  sales_count: number;
};

// ---- Returns API ----
export async function listReturns(params: {
  page?: number;
  page_size?: number;
  query?: string;
  store_id?: string | number;
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<{ count: number; results: ReturnListRow[] }> {
  const url = new URL("/api/v1/orders/returns/", window.location.origin);
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

export async function listPayments(params: {
  page?: number;
  page_size?: number;
  store_id?: string | number;
  method?: string;
  date_from?: string;
  date_to?: string;
}): Promise<{ count: number; results: PaymentListRow[] }> {
  const url = new URL("/api/v1/orders/payments/", window.location.origin);
  const q = url.searchParams;
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.store_id) q.set("store_id", String(params.store_id));
  if (params?.method) q.set("method", params.method);
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  return apiFetchJSON(url.pathname + "?" + q.toString());
}

export async function listRefunds(params: {
  page?: number;
  page_size?: number;
  store_id?: string | number;
  method?: string;
  date_from?: string;
  date_to?: string;
}): Promise<{ count: number; results: RefundListRow[] }> {
  const url = new URL("/api/v1/orders/refunds/", window.location.origin);
  const q = url.searchParams;
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.store_id) q.set("store_id", String(params.store_id));
  if (params?.method) q.set("method", params.method);
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  return apiFetchJSON(url.pathname + "?" + q.toString());
}

export async function getPaymentSummary(params: {
  store_id?: string | number;
  method?: string;
  date_from?: string;
  date_to?: string;
}): Promise<{
  payments_by_method: Record<string, string>;
  refunds_by_method: Record<string, string>;
  total_collected: string;
  total_refunded: string;
  net_total: string;
}> {
  const url = new URL("/api/v1/orders/payments/summary", window.location.origin);
  const q = url.searchParams;
  if (params?.store_id) q.set("store_id", String(params.store_id));
  if (params?.method) q.set("method", params.method);
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  return apiFetchJSON(url.pathname + "?" + q.toString());
}

export async function getDiscountSummary(params: {
  store_id?: string | number;
  date_from?: string;
  date_to?: string;
}): Promise<{ total_discount: string; rules: DiscountRuleSummary[] }> {
  const url = new URL("/api/v1/orders/discounts/summary", window.location.origin);
  const q = url.searchParams;
  if (params?.store_id) q.set("store_id", String(params.store_id));
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  return apiFetchJSON(url.pathname + "?" + q.toString());
}

export async function listDiscountSales(params: {
  rule_code: string;
  store_id?: string | number;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<{ count: number; results: SaleRow[] }> {
  const url = new URL("/api/v1/orders/discounts/sales", window.location.origin);
  const q = url.searchParams;
  q.set("rule_code", params.rule_code);
  if (params?.store_id) q.set("store_id", String(params.store_id));
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  return apiFetchJSON(url.pathname + "?" + q.toString());
}

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
  const res = await ensureAuthedFetch(`/api/v1/orders/return-items/${returnItemId}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 204) {
    // try to surface a nice error
    try {
      const data = await res.json();
      throw new Error(data?.detail || "Failed to delete return item.");
    } catch {
      throw new Error("Failed to delete return item.");
    }
  }

  // no JSON body on success
  return null;
}


export async function voidReturn(returnId: number) {
  return apiFetchJSON(`/api/v1/orders/returns/${returnId}/void`, { method: "POST" });
}


export async function deleteReturn(returnId: number) {
  const res = await ensureAuthedFetch(`/api/v1/orders/returns/${returnId}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 204) {
    try {
      const data = await res.json();
      throw new Error(data?.detail || "Failed to delete return.");
    } catch {
      throw new Error("Failed to delete return.");
    }
  }

  return null; // nothing to parse
}
