// pos-frontend/src/features/admin/api/taxrules.ts
import { ensureAuthedFetch } from "@/components/AppShell";
import { jsonOrThrow } from "../adminApi";
import type { Query } from "../adminApi";

const BASE = "/api/v1/tenant-admin";

export type TaxRule = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  scope: "GLOBAL" | "STORE";
  store?: number | null;
  basis: "PCT" | "FLAT";
  apply_scope: "LINE" | "RECEIPT";
  priority: number;
  rate?: string | null;    // decimal string like "0.0825"
  amount?: string | null;  // decimal string like "2.00"
  start_at?: string | null;
  end_at?: string | null;
  categories?: number[];   // tax category IDs
  created_at?: string;
  updated_at?: string;
};

export type TaxRuleCreatePayload = Omit<TaxRule, "id"|"created_at"|"updated_at">;
export type TaxRuleUpdatePayload = Partial<TaxRuleCreatePayload>;

export const TaxRulesAPI = {
  async list(q?: Query): Promise<{ count?: number; results?: TaxRule[] } | TaxRule[]> {
    const p = new URLSearchParams();
    if (q?.search) p.set("search", String(q.search));                    // code,name,categories__code
    if (q?.ordering) p.set("ordering", String(q.ordering));              // priority,code,name,start_at,end_at
    if ((q as any)?.scope) p.set("scope", String((q as any).scope));
    if ((q as any)?.basis) p.set("basis", String((q as any).basis));
    if ((q as any)?.apply_scope) p.set("apply_scope", String((q as any).apply_scope));
    if ((q as any)?.store) p.set("store", String((q as any).store));
    if (typeof q?.is_active === "boolean") p.set("is_active", q.is_active ? "true" : "false");
    const res = await ensureAuthedFetch(`${BASE}/tax-rules/${p.toString() ? `?${p.toString()}` : ""}`);
    return jsonOrThrow(res);
  },

  async create(payload: TaxRuleCreatePayload): Promise<TaxRule> {
    const res = await ensureAuthedFetch(`${BASE}/tax-rules/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async update(id: number, payload: TaxRuleUpdatePayload): Promise<TaxRule> {
    const res = await ensureAuthedFetch(`${BASE}/tax-rules/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async remove(id: number): Promise<true> {
    const res = await ensureAuthedFetch(`${BASE}/tax-rules/${id}/`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to delete tax rule");
    }
    return true;
  },
};
