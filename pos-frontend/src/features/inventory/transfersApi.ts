// src/features/inventory/transfersApi.ts
import { ensureAuthedFetch } from "@/components/AppShell";

const API = "/api/v1/inventory";

// ---------- Types ----------
export type TransferStatus = "DRAFT" | "REQUESTED" | "SENT" | "RECEIVED" | "CANCELLED";

export type TransferLine = {
  variant_id: number;
  sku?: string | null;
  product_name?: string | null;
  qty: number;
};

export type TransferListItem = {
  id: number;
  created_at: string;
  from_store: { id: number; code: string; name: string };
  to_store: { id: number; code: string; name: string };
  status: TransferStatus;
  line_count: number;
  note?: string | null;
};

export type TransferDetail = {
  id: number;
  created_at: string;
  from_store_id: number;
  to_store_id: number;
  status: TransferStatus;
  note?: string | null;
  lines: Array<{
    variant_id: number;
    sku?: string | null;
    product_name?: string | null;
    qty: number;           // requested/sent
    received_qty?: number; // if backend tracks partial receive
  }>;
};

export async function listTransfers(params: {
  from_store_id?: number | string;
  to_store_id?: number | string;
  status?: string; // allow comma list if your backend supports it
  q?: string;
  page?: number;
  page_size?: number;
}) {
  const usp = new URLSearchParams();
  if (params.from_store_id) usp.set("from_store_id", String(params.from_store_id));
  if (params.to_store_id) usp.set("to_store_id", String(params.to_store_id));
  if (params.status) usp.set("status", params.status);
  if (params.q) usp.set("q", params.q);
  usp.set("page", String(params.page ?? 1));
  usp.set("page_size", String(params.page_size ?? 20));

  const res = await ensureAuthedFetch(`${API}/transfers?${usp.toString()}`);
  if (!res.ok) throw new Error(`Failed to list transfers (${res.status})`);
  return (await res.json()) as { results: TransferListItem[]; count: number };
}

export async function getTransfer(id: number) {
  const res = await ensureAuthedFetch(`${API}/transfers/${id}`);
  if (!res.ok) throw new Error(`Failed to load transfer #${id}`);
  return (await res.json()) as TransferDetail;
}

export async function createTransfer(payload: {
  from_store_id: number;
  to_store_id: number;
  note?: string;
  lines: TransferLine[];
  send_now?: boolean;
}) {
  const res = await ensureAuthedFetch(`${API}/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create transfer`);
  return (await res.json()) as { id: number; status: TransferStatus };
}

export async function sendTransfer(id: number) {
  const res = await ensureAuthedFetch(`${API}/transfers/${id}/send`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to send transfer #${id}`);
  return await res.json();
}

export async function receiveTransfer(id: number, payload?: { lines?: Array<{ variant_id: number; qty: number }> }) {
  const res = await ensureAuthedFetch(`${API}/transfers/${id}/receive`, {
    method: "POST",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) throw new Error(`Failed to receive transfer #${id}`);
  return await res.json();
}

export async function cancelTransfer(id: number) {
  const res = await ensureAuthedFetch(`${API}/transfers/${id}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to cancel transfer #${id}`);
  return await res.json();
}
