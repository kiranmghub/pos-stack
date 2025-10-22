// pos-frontend/src/features/admin/api/coupons.ts
import { ensureAuthedFetch } from "@/components/AppShell";
import { jsonOrThrow } from "../adminApi";
import type { Query } from "../adminApi";

const BASE = "/api/v1/tenant-admin";

export type Coupon = {
  id: number;
  code: string;
  name?: string | null;
  description?: string | null;
  is_active: boolean;

  // Rule linkage
  rule?: any;          // nested rule (read-only)
  rule_id?: number;    // write path

  min_subtotal?: string | null;
  max_uses?: number | null;
  used_count?: number | null;
  remaining_uses?: number | null;

  start_at?: string | null;
  end_at?: string | null;

  created_at?: string;
  updated_at?: string;
};

export type CouponCreatePayload = {
  code: string;
  name?: string;
  description?: string;
  is_active: boolean;
  rule_id: number;
  min_subtotal?: string | null; // send string decimals
  max_uses?: number | null;
  start_at?: string | null;
  end_at?: string | null;
};

export type CouponUpdatePayload = Partial<CouponCreatePayload>;

export const CouponsAPI = {
  async list(q?: Query): Promise<{ count?: number; results?: Coupon[] } | Coupon[]> {
    const p = new URLSearchParams();
    if (q?.search) p.set("search", String(q.search));
    if (q?.ordering) p.set("ordering", String(q.ordering));
    if (typeof q?.is_active === "boolean") p.set("is_active", q.is_active ? "true" : "false");
    if ((q as any)?.rule) p.set("rule", String((q as any).rule));
    const res = await ensureAuthedFetch(`${BASE}/coupons/${p.toString() ? `?${p.toString()}` : ""}`);
    return jsonOrThrow(res);
  },

  async create(payload: CouponCreatePayload): Promise<Coupon> {
    const res = await ensureAuthedFetch(`${BASE}/coupons/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async update(id: number, payload: CouponUpdatePayload): Promise<Coupon> {
    const res = await ensureAuthedFetch(`${BASE}/coupons/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async remove(id: number): Promise<true> {
    const res = await ensureAuthedFetch(`${BASE}/coupons/${id}/`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to delete coupon");
    }
    return true;
  },
};
