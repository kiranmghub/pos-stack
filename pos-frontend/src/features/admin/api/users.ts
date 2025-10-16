// pos-frontend/src/features/admin/api/users.ts
// This file provides API functions for managing admin users, including listing, creating, updating, and deleting users.
// It uses the existing ensureAuthedFetch utility to handle authenticated requests.
import { ensureAuthedFetch } from "@/components/AppShell";
import type { AdminUser, Query, RoleOption } from "../adminApi";
import { jsonOrThrow } from "../adminApi";

const BASE = "/api/v1/tenant-admin";

const toLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const UsersAPI = {
  async list(q?: Query): Promise<{ count?: number; results?: AdminUser[] } | AdminUser[]> {
    const params = new URLSearchParams();
    if (q?.search)   params.set("search", String(q.search));
    if (q?.ordering) params.set("ordering", String(q.ordering));
    if (typeof q?.is_active === "boolean") params.set("is_active", q.is_active ? "true" : "false");
    if ((q as any)?.role) params.set("role", String((q as any).role));
    const url = `${BASE}/users/${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await ensureAuthedFetch(url);
    return jsonOrThrow(res);
  },

  async create(payload: {
    username?: string;
    email?: string;
    password?: string;
    user_id?: number;
    role: string;
    is_active: boolean;
    stores: number[];
  }): Promise<AdminUser> {
    const res = await ensureAuthedFetch(`${BASE}/users/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async update(id: number, payload: Partial<{
    username: string;
    email: string;
    password: string;
    role: string;
    is_active: boolean;
    stores: number[];
  }>): Promise<AdminUser> {
    const res = await ensureAuthedFetch(`${BASE}/users/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async remove(id: number): Promise<true> {
    const res = await ensureAuthedFetch(`${BASE}/users/${id}/`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to delete user");
    }
    return true;
  },

  /** Returns RoleOption[]; supports either string[] or { ok, roles } from backend */
  async getTenantRoles(): Promise<RoleOption[]> {
    const res = await ensureAuthedFetch(`${BASE}/roles/tenant`);
    const j = await jsonOrThrow<any>(res);
    if (Array.isArray(j)) {
      // string[] -> map to RoleOption[]
      return j.map((v: string) => ({ value: v, label: toLabel(v) }));
    }
    if (Array.isArray(j?.roles)) {
      // roles already in RoleOption[] shape
      return j.roles as RoleOption[];
    }
    // last resort: try to parse any array of strings-like
    const arr: string[] = Array.isArray(j?.roles) ? j.roles : [];
    return arr.map((v) => ({ value: String(v), label: toLabel(String(v)) }));
  },
};
