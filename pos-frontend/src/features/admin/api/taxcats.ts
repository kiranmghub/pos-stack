// pos-frontend/src/features/admin/api/taxcats.ts
import { ensureAuthedFetch } from "@/components/AppShell";
import { jsonOrThrow } from "../adminApi";
import type { Query } from "../adminApi";

const BASE = "/api/v1/tenant-admin";

export type TaxCategory = {
  id: number;
  code: string;
  name: string;
  rate: string;            // backend is string/decimal
  description?: string;    // newly added field
  created_at?: string;
  updated_at?: string;
};

export type TaxCategoryCreatePayload = {
  code: string;
  name: string;
  rate: string | number;       // send string to be safe
  description?: string;
};

export type TaxCategoryUpdatePayload = Partial<TaxCategoryCreatePayload>;

export const TaxCatsAPI = {
  async list(q?: Query): Promise<{ count?: number; results?: TaxCategory[] } | TaxCategory[]> {
    const p = new URLSearchParams();
    if (q?.search) p.set("search", String(q.search));          // search supports code,name,description
    if (q?.ordering) p.set("ordering", String(q.ordering));    // id, code, name, rate, description
    const url = `${BASE}/tax-categories/${p.toString() ? `?${p.toString()}` : ""}`;
    const res = await ensureAuthedFetch(url);
    return jsonOrThrow(res);
  },

  async create(payload: TaxCategoryCreatePayload): Promise<TaxCategory> {
    const res = await ensureAuthedFetch(`${BASE}/tax-categories/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async update(id: number, payload: TaxCategoryUpdatePayload): Promise<TaxCategory> {
    const res = await ensureAuthedFetch(`${BASE}/tax-categories/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async remove(id: number): Promise<true> {
    const res = await ensureAuthedFetch(`${BASE}/tax-categories/${id}/`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to delete tax category");
    }
    return true;
  },
};
