// pos-frontend/src/features/admin/api/discounts.ts
import { ensureAuthedFetch } from "@/components/AppShell";
import { jsonOrThrow } from "../adminApi";
import type { Query } from "../adminApi";

const BASE = "/api/v1/tenant-admin";

export type DiscountRule = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  description?: string | null;

  scope: "GLOBAL" | "STORE";
  store?: number | null;
  store_name?: string | null;
  basis: "PCT" | "FLAT";
  rate?: string | null;                // decimal string like "0.0825"
  amount?: string | null;              // decimal string like "2.00"
  apply_scope: "LINE" | "RECEIPT";
  target: "ALL" | "CATEGORY" | "PRODUCT" | "VARIANT";
  stackable: boolean;
  priority: number;

  start_at?: string | null;
  end_at?: string | null;

  // read: nested lite resources (serializer supplies these)
  categories?: { id: number; code: string; name: string }[];
  products?: { id: number; name: string }[];
  variants?: { id: number; sku: string }[];

  created_at?: string;
  updated_at?: string;
};

export type DiscountRuleCreatePayload = {
  code: string;
  name: string;
  is_active: boolean;
  description?: string;

  scope: "GLOBAL" | "STORE";
  store?: number | null;
  basis: "PCT" | "FLAT";
  rate?: string | null;
  amount?: string | null;
  apply_scope: "LINE" | "RECEIPT";
  target: "ALL" | "CATEGORY" | "PRODUCT" | "VARIANT";
  stackable: boolean;
  priority: number;

  start_at?: string | null;
  end_at?: string | null;

  // write M2Ms via *_ids (serializer maps these)
  category_ids?: number[];
  product_ids?: number[];
  variant_ids?: number[];
};

export type DiscountRuleUpdatePayload = Partial<DiscountRuleCreatePayload>;

export const DiscountRulesAPI = {
  async list(q?: Query): Promise<{ count?: number; results?: DiscountRule[] } | DiscountRule[]> {
    const p = new URLSearchParams();
    if (q?.search) p.set("search", String(q.search));
    if (q?.ordering) p.set("ordering", String(q.ordering));
    if (typeof q?.is_active === "boolean") p.set("is_active", q.is_active ? "true" : "false");
    if ((q as any)?.scope) p.set("scope", String((q as any).scope));
    if ((q as any)?.basis) p.set("basis", String((q as any).basis));
    if ((q as any)?.apply_scope) p.set("apply_scope", String((q as any).apply_scope));
    if ((q as any)?.target) p.set("target", String((q as any).target));
    if ((q as any)?.store) p.set("store", String((q as any).store));

    const res = await ensureAuthedFetch(`${BASE}/discount-rules/${p.toString() ? `?${p.toString()}` : ""}`);
    return jsonOrThrow(res);
  },

  async create(payload: DiscountRuleCreatePayload): Promise<DiscountRule> {
    const res = await ensureAuthedFetch(`${BASE}/discount-rules/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async update(id: number, payload: DiscountRuleUpdatePayload): Promise<DiscountRule> {
    const res = await ensureAuthedFetch(`${BASE}/discount-rules/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async remove(id: number): Promise<true> {
    const res = await ensureAuthedFetch(`${BASE}/discount-rules/${id}/`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to delete discount rule");
    }
    return true;
  },
};

// ---- Search helpers for products/variants (lazy pickers) ----
export type ProductLite = { id: number; name: string; sku?: string };
export type VariantLite = { id: number; sku: string; name?: string };

export const CatalogAPI = {
  async searchProducts(q: string): Promise<ProductLite[]> {
    const p = new URLSearchParams();
    if (q) p.set("query", q); // catalog expects ?query=
    const res = await ensureAuthedFetch(`/api/v1/catalog/products${p.toString() ? `?${p.toString()}` : ""}`);
    const j = await jsonOrThrow<any>(res);           // {count, results: [...]}
    const list = Array.isArray(j) ? j : j.results ?? [];
    return list.map((row: any) => ({ id: row.id, name: row.name }));
  },

  async searchVariants(q: string, storeId?: number): Promise<VariantLite[]> {
    const p = new URLSearchParams();
    if (q) p.set("q", q);           // catalog expects ?q=
    p.set("limit", "20");
    if (typeof storeId === "number" && storeId > 0) p.set("store_id", String(storeId));
    const res = await ensureAuthedFetch(`/api/v1/catalog/variants${p.toString() ? `?${p.toString()}` : ""}`);
    const j = await jsonOrThrow<any>(res);           // {results: [...]}
    const list = Array.isArray(j) ? j : j.results ?? [];
    return list.map((row: any) => ({ id: row.id, sku: row.sku, name: row.product_name }));
  },
};

