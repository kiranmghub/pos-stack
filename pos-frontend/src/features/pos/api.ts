// pos-frontend/src/features/pos/api.ts
import { authHeaders, refreshAccessIfNeeded, logout } from "@/lib/auth";


export type TaxBasis = "PCT" | "FLAT";
export type TaxScope = "GLOBAL" | "STORE";
export type ApplyScope = "LINE" | "RECEIPT";

export type DiscountBasis = "PCT" | "FLAT";
// export type ApplyScope = "LINE" | "RECEIPT";
export type DiscountTarget = "ALL" | "CATEGORY" | "PRODUCT" | "VARIANT";

export type RuleCategory = { id: number; code: string; name?: string };

export type DiscountRule = {
  id: number;
  name: string;
  code: string;
  basis: DiscountBasis;
  rate?: string | null;
  amount?: string | null;
  apply_scope: ApplyScope;
  target: DiscountTarget;
  categories?: RuleCategory[];
  product_ids?: number[];
  variant_ids?: number[];
  priority: number;
};

export type CouponWithRule = {
  code: string;
  name?: string;
  min_subtotal?: string | null;
  max_uses?: number | null;
  used_count?: number;
  start_at?: string | null;
  end_at?: string | null;
  rule: DiscountRule;  // ← important for tile badges
};

export type TaxRule = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  scope: TaxScope;
  store_id?: number | null;
  basis: TaxBasis;
  rate?: string;   // decimal as string from API
  amount?: string; // decimal as string from API
  apply_scope: ApplyScope;
  categories: { id: number; name: string; code: string }[];
  priority: number;
  start_at?: string | null;
  end_at?: string | null;
};


// types
export type PosCustomer = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
};


// NEW: search customers by query (name/email/phone)
export async function searchCustomers(params: { query: string }) {
  const q = params.query.trim();
  if (!q) return [];
  const res = await fetchWithAuth(`/api/v1/customers?query=${encodeURIComponent(q)}`);
  // assuming your customers list returns [{ id, name, email, phone, ... }]
  return Array.isArray(res) ? res : (res.results || []);
}


export async function getActiveDiscountRules(store_id: number): Promise<DiscountRule[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/v1/discounts/active?store_id=${store_id}`);
  const data = await jsonOrThrow<{ ok: boolean; rules: DiscountRule[] }>(res);
  return data.rules ?? [];
}

export async function getActiveTaxRules(store_id: number): Promise<TaxRule[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/v1/taxes/active?store_id=${store_id}`);
  const data = await jsonOrThrow<{ ok: boolean; rules: TaxRule[] }>(res);
  return data.rules;
}


export async function validateCoupon(code: string, subtotal?: number): Promise<CouponWithRule> {
  const params = new URLSearchParams({ code: code.trim() });
  if (typeof subtotal === "number") params.set("subtotal", String(subtotal.toFixed(2)));

  // trailing slash works with/without APPEND_SLASH; either is fine
  const res = await fetchWithAuth(`${API_BASE}/api/v1/discounts/coupon?${params.toString()}`);
  const data = await jsonOrThrow<{ ok: boolean; coupon: CouponWithRule }>(res);
  return data.coupon;
}




const API_BASE = import.meta.env.VITE_API_BASE || ""; // "" means use Vite proxy

async function readJson(res: Response) {
  let data: any = null;
  try {
    data = await res.clone().json();
  } catch {
    // ignore
  }
  return data;
}

/**
 * Central fetch that:
 *  - sends auth + tenant headers
 *  - if it gets a 400 "Invalid token" or 401, tries a refresh and retries once
 */
async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit, alreadyRetried = false): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...authHeaders(typeof init?.headers === "object" ? (init!.headers as Record<string, string>) : {}),
    },
  });

  if (res.ok) return res;

  const status = res.status;
  const data = await readJson(res);
  const detail = (data?.detail || data?.message || "").toString().toLowerCase();

  const looksLikeExpired =
    status === 401 ||
    (status === 400 && detail.includes("invalid") && detail.includes("token"));

  if (!alreadyRetried && looksLikeExpired) {
    try {
      await refreshAccessIfNeeded();
    } catch {
      logout();
      throw new Error("Your session expired. Please log in again.");
    }
    return fetchWithAuth(input, init, true);
  }

  // propagate error
  let msg = `Request failed (${status})`;
  if (detail) msg = detail;
  throw new Error(msg);
}

async function jsonOrThrow<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await readJson(res);
    const msg = (body?.detail || body?.message || `Request failed (${res.status})`) as string;
    throw new Error(msg);
  }
  try {
    return (await res.json()) as T;
  } catch {
    // no body or invalid JSON
    // @ts-ignore
    return null as T;
  }
}

/** === Types returned by the backend === */
export type StoreLite = {
  id: number;
  code: string;
  name: string;
};

export type VariantLite = {
  id: number;
  product_id: number;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price: string;        // money as string
  tax_rate?: string;    // decimal string
  on_hand?: number | string | null; // accept number or string
  image_url?: string;
  representative_image_url?: string;

};

/** === Calls used by the POS screen === */

export async function getMyStores(): Promise<StoreLite[]> {
  const res = await fetchWithAuth(`${API_BASE}/api/v1/pos/stores`);
  return jsonOrThrow<StoreLite[]>(res);
}

export async function searchProducts(params: { store_id: number; query?: string }): Promise<VariantLite[]> {
  const q = new URLSearchParams({ store_id: String(params.store_id) });
  if (params.query) q.set("query", params.query); // note: backend expects "query"
  const res = await fetchWithAuth(`${API_BASE}/api/v1/pos/products?${q.toString()}`);
  return jsonOrThrow<VariantLite[]>(res);
}

export async function lookupBarcode(store_id: number, barcode: string): Promise<VariantLite | null> {
  const url = `${API_BASE}/api/v1/pos/lookup_barcode?store_id=${store_id}&barcode=${encodeURIComponent(barcode)}`;
  const res = await fetchWithAuth(url);
  if (res.status === 404) return null;
  return jsonOrThrow<VariantLite>(res);
}

export async function checkout(payload: {
  store_id: number;
  register_id: number | null;
  lines: { variant_id: number; qty: number; unit_price: string; line_discount?: string }[];
  payment: { type: "CASH" | "CARD"; amount: string; [k: string]: any };
  coupon_code?: string; // optional
}): Promise<{
  ok: boolean;
  sale_id: number;
  receipt_no?: string;
  receipt_number?: string;
  total?: string;
  change?: string;
  receipt?: any;
  qr_png_data_url?: string;
  receipt_qr_png?: string;
}> {
  const res = await fetchWithAuth(`${API_BASE}/api/v1/pos/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // auth headers will be merged by fetchWithAuth
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}


// === Quote (server-side totals) ===
export type QuoteLineIn = { variant_id: number; qty: number; unit_price: string | number };
export type QuoteRuleAmount = { rule_id: number; code: string; name: string; amount: string };
export type QuoteOut = {
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  tax_by_rule: QuoteRuleAmount[];
  lines: Array<{
    variant_id: number;
    qty: number;
    unit_price: string;
    line_subtotal: string;
    line_discount: string;
    line_net: string;
  }>;
};



export async function quoteTotals(payload: {
  store_id: number;
  lines: QuoteLineIn[];
  coupon_code?: string;      // backward-compat
  coupon_codes?: string[];   // NEW multi-coupon
}): Promise<QuoteOut> {
  const body = { ...payload };
  // prefer coupon_codes if present, else if coupon_code present wrap into array
  if (!body.coupon_codes && body.coupon_code) {
    body.coupon_codes = [body.coupon_code];
  }
  const res = await fetchWithAuth(`${API_BASE}/api/v1/pos/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await jsonOrThrow<{ ok: boolean; quote: QuoteOut }>(res);
  return data.quote;
}
