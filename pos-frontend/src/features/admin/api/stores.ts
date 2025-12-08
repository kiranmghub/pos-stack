// pos-frontend/src/features/admin/api/stores.ts
import { ensureAuthedFetch } from "@/components/AppShell";
import type { Store, Query } from "../adminApi";
import { jsonOrThrow } from "../adminApi";

const BASE = "/api/v1/tenant-admin";

export type StoreCreatePayload = {
  code: string;
  name: string;
  timezone: string;
  region?: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_active?: boolean;
  is_primary?: boolean;
  phone_number?: string;
  mobile_number?: string;
  fax_number?: string;
  email?: string;
  contact_person?: string;
  landmark?: string;
  description?: string;
  geo_lat?: number | string;
  geo_lng?: number | string;
  opening_time?: string;
  closing_time?: string;
  tax_id?: string;
};

export type StoreUpdatePayload = Partial<StoreCreatePayload>;

export const StoresAPI = {
  async list(q?: Query): Promise<{ count?: number; results?: Store[] } | Store[]> {
    const p = new URLSearchParams();
    if (q?.search) p.set("search", String(q.search));               // search on code,name (DRF SearchFilter)
    if (q?.ordering) p.set("ordering", String(q.ordering));         // id, code, name, is_active
    if (typeof q?.is_active === "boolean") p.set("is_active", q.is_active ? "true" : "false");
    if ((q as any)?.code) p.set("code", String((q as any).code));   // filterset_fields includes code
    const url = `${BASE}/stores/${p.toString() ? `?${p.toString()}` : ""}`;
    const res = await ensureAuthedFetch(url);
    return jsonOrThrow(res);
  },

  async create(payload: StoreCreatePayload): Promise<Store> {
    const res = await ensureAuthedFetch(`${BASE}/stores/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async update(id: number, payload: StoreUpdatePayload): Promise<Store> {
    const res = await ensureAuthedFetch(`${BASE}/stores/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async remove(id: number): Promise<true> {
    const res = await ensureAuthedFetch(`${BASE}/stores/${id}/`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to delete store");
    }
    return true;
  },
};
