// src/features/inventory/countsApi.ts
import { ensureAuthedFetch } from "@/components/AppShell";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export type StoreLite = { id: number; code: string; name: string };

export type CountLine = {
  id: number;
  variant_id: number;
  sku: string | null;
  product_name: string;
  expected_qty: number | null;
  counted_qty: number;
  method: string;
  location: string;
};

export type CountSession = {
  id: number;
  code: string;
  status: "DRAFT" | "IN_PROGRESS" | "FINALIZED";
  note: string;
  store: StoreLite;
  created_at: string;
  started_at?: string | null;
  finalized_at?: string | null;
  lines: CountLine[];
};

export async function listStores(): Promise<StoreLite[]> {
  const res = await ensureAuthedFetch(`${API_BASE}/api/v1/pos/stores`);
  if (!res.ok) throw new Error("Failed to load stores");
  const data = await res.json();
  const rows = Array.isArray(data) ? data : data.results || [];
  return rows.map((r: any) => ({ id: r.id, code: r.code, name: r.name }));
}

export async function listCountSessions(params: {
  store_id?: number;
  status?: string;
  q?: string;
  page?: number;
  page_size?: number;
}) {
  const u = new URL(`${API_BASE}/api/v1/inventory/counts`, window.location.origin);
  if (params.store_id) u.searchParams.set("store_id", String(params.store_id));
  if (params.status) u.searchParams.set("status", params.status);
  if (params.q) u.searchParams.set("q", params.q);
  u.searchParams.set("page", String(params.page || 1));
  u.searchParams.set("page_size", String(params.page_size || 24));
  const res = await ensureAuthedFetch(u.toString());
  if (!res.ok) throw new Error("Failed to load count sessions");
  return res.json() as Promise<{ results: CountSession[]; count: number }>;
}

export async function createCountSession(payload: {
  store_id: number;
  code?: string;
  note?: string;
}) {
  const res = await ensureAuthedFetch(`${API_BASE}/api/v1/inventory/counts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create count");
  return res.json() as Promise<{ id: number }>;
}

export async function getCountSession(id: number) {
  const res = await ensureAuthedFetch(`${API_BASE}/api/v1/inventory/counts/${id}`);
  if (!res.ok) throw new Error("Failed to load count");
  return res.json() as Promise<CountSession>;
}

export async function scanIntoCount(id: number, payload: {
  barcode?: string;
  sku?: string;
  variant_id?: number;
  qty?: number;
  location?: string;
}) {
  const res = await ensureAuthedFetch(`${API_BASE}/api/v1/inventory/counts/${id}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Scan failed");
  return res.json();
}

export async function setCountQty(id: number, payload: {
  variant_id: number;
  counted_qty: number;
  location?: string;
}) {
  const res = await ensureAuthedFetch(`${API_BASE}/api/v1/inventory/counts/${id}/set_qty`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Update quantity failed");
  return res.json();
}

export async function finalizeCount(id: number) {
  const res = await ensureAuthedFetch(`${API_BASE}/api/v1/inventory/counts/${id}/finalize`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Finalize failed");
  return res.json() as Promise<{ ok: true; summary: any }>;
}
