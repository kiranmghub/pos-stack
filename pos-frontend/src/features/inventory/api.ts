// pos-frontend/src/features/inventory/api.ts
import { ensureAuthedFetch } from "@/components/AppShell";

const API = import.meta.env.VITE_API_BASE || "";

export type CurrencyInfo = { code: string; symbol?: string | null; precision?: number | null };

export type InvReason = { id: number; code: string; name: string };
export type InvStockRow = {
  id: number;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  price: string;       // "12.34"
  on_hand: number;
  low_stock: boolean;
};

export async function getOverview(params: { store_id?: number }) {
  const u = new URL(`${API}/api/v1/inventory/overview`, window.location.origin);
  if (params.store_id) u.searchParams.set("store_id", String(params.store_id));
  const res = await ensureAuthedFetch(u.toString());
  if (!res.ok) throw new Error("Failed to load overview");
  return res.json() as Promise<{ on_hand_value: string; low_stock_count: number; recent: any[]; currency?: CurrencyInfo }>;
}

export async function listReasons() {
  const res = await ensureAuthedFetch(`${API}/api/v1/inventory/reasons`);
  if (!res.ok) throw new Error("Failed to load reasons");
  return res.json() as Promise<InvReason[]>;
}

export async function listStock(params: {
  store_id: number;
  q?: string;
  category?: string;
  page?: number;
  page_size?: number;
}): Promise<{ results: InvStockRow[]; count: number; currency?: CurrencyInfo }> {
  const u = new URL(`${API}/api/v1/inventory/stock`, window.location.origin);
  u.searchParams.set("store_id", String(params.store_id));
  if (params.q) u.searchParams.set("q", params.q);
  if (params.category) u.searchParams.set("category", params.category);
  if (params.page) u.searchParams.set("page", String(params.page));
  if (params.page_size) u.searchParams.set("page_size", String(params.page_size));
  const res = await ensureAuthedFetch(u.toString());
  if (!res.ok) throw new Error("Failed to load stock");
  return res.json() as Promise<{ results: InvStockRow[]; count: number; currency?: CurrencyInfo }>;
}

export async function createAdjustment(payload: {
  store_id: number;
  reason_code: string;
  note?: string;
  lines: { variant_id: number; delta: number }[];
}) {
  const res = await ensureAuthedFetch(`${API}/api/v1/inventory/adjustments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Adjustment failed");
  }
  return res.json() as Promise<{ id: number; lines: { variant_id: number; delta: number; balance_after: number }[] }>;
}

export async function listLedger(params: {
  store_id?: number;
  q?: string;
  ref_type?: string;
  page?: number;
  page_size?: number;
}) {
  const u = new URL(`${API}/api/v1/inventory/ledger`, window.location.origin);
  if (params.store_id) u.searchParams.set("store_id", String(params.store_id));
  if (params.q) u.searchParams.set("q", params.q);
  if (params.ref_type) u.searchParams.set("ref_type", params.ref_type);
  if (params.page) u.searchParams.set("page", String(params.page));
  if (params.page_size) u.searchParams.set("page_size", String(params.page_size));
  const res = await ensureAuthedFetch(u.toString());
  if (!res.ok) throw new Error("Failed to load ledger");
  return res.json() as Promise<{ results: any[]; count: number }>;
}


export async function listTransfers(params: { page?: number; page_size?: number; status?: string; store_id?: number|string }) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (params.status) q.set("status", params.status);
  if (params.store_id) q.set("store_id", String(params.store_id));
  const res = await ensureAuthedFetch(`/api/v1/inventory/transfers?${q.toString()}`);
  if (!res.ok) throw new Error("Failed to load transfers");
  return res.json();
}

export async function createTransfer(payload: {
  from_store_id: number; to_store_id: number;
  notes?: string; lines: { variant_id: number; qty: number }[];
}) {
  const res = await ensureAuthedFetch(`/api/v1/inventory/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create transfer");
  return res.json();
}

export async function performTransferAction(id: number, action: "send" | "receive" | "cancel") {
  const res = await ensureAuthedFetch(`/api/v1/inventory/transfers/${id}?action=${action}`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to ${action} transfer`);
  return res.json();
}
