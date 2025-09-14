// src/features/pos/api.ts
import { authHeaders } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE || ""; // "" means use the Vite proxy

async function jsonOrThrow<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = (data?.detail || data?.message || msg) as string;
    } catch {
      /* no-op */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** === Types returned by the backend === */
export type StoreLite = {
  id: number;
  code: string;
  name: string;
};

export type VariantLite = {
  id: number;
  product_id?: number;           // made optional to match backend response
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price: string;                 // money as string
  tax_rate?: string;             // decimal string
  on_hand?: number | string | null; // accept number or string
};

/** === Calls used by the POS screen === */

export async function getMyStores(): Promise<StoreLite[]> {
  const res = await fetch(`${API_BASE}/api/v1/pos/stores`, {
    headers: authHeaders(),
  });
  return jsonOrThrow<StoreLite[]>(res);
}

export async function searchProducts(params: {
  store_id: number;
  query?: string;
}): Promise<VariantLite[]> {
  const q = new URLSearchParams({ store_id: String(params.store_id) });
  if (params.query) q.set("query", params.query); // FIX: backend expects "query"

  const res = await fetch(`${API_BASE}/api/v1/pos/products?${q.toString()}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow<VariantLite[]>(res);
}

export async function lookupBarcode(
  store_id: number,
  barcode: string
): Promise<VariantLite | null> {
  const url = `${API_BASE}/api/v1/pos/lookup_barcode?store_id=${store_id}&barcode=${encodeURIComponent(
    barcode
  )}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 404) return null;
  return jsonOrThrow<VariantLite | null>(res); // backend can return null with 200
}

// --- Checkout ---
// Keep strong typing for the basics, allow extra fields so we don't drop metadata
export type CheckoutLine = {
  variant_id: number;
  qty: number;
  unit_price: string;
  line_discount?: string;
};

type PaymentBase = { type: "CASH" | "CARD"; amount: string } & Record<string, any>;

export type CheckoutPayload = {
  store_id: number;
  register_id: number | null;
  lines: CheckoutLine[];
  payment: PaymentBase; // permits received, card_brand, card_last4, etc.
};

export type CheckoutResponse = {
  sale_id: number;
  receipt_no?: string;
  total?: string;
  change?: string;
  [k: string]: any;
};

export async function checkout(payload: CheckoutPayload): Promise<CheckoutResponse> {
  // Optional: uncomment to verify the full payload being sent
  // console.debug("[checkout] payload", payload);

  const res = await fetch(`${API_BASE}/api/v1/pos/checkout`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload), // send payment object verbatim
  });
  return jsonOrThrow<CheckoutResponse>(res);
}
