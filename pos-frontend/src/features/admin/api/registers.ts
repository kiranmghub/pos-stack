// pos-frontend/src/features/admin/api/registers.ts
import { ensureAuthedFetch } from "@/components/AppShell";
import { jsonOrThrow } from "../adminApi";
import type { Query } from "../adminApi";

const BASE = "/api/v1/tenant-admin";


// export const RegistersAPI = {
//   async listByStore(storeId: number) {
//     const res = await ensureAuthedFetch(`${BASE}/registers/?store=${storeId}`);
//     return jsonOrThrow<{ count?: number; results?: Register[] } | Register[]>(res);
//   },
// };


export type Register = {
  id: number;
  store: number;           // FK id
  name: string;
  code: string;
  hardware_profile: Record<string, any>;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type RegisterCreatePayload = {
  store: number;
  name?: string;
  code: string;
  hardware_profile?: Record<string, any>;
  is_active?: boolean;
};

export type RegisterUpdatePayload = Partial<RegisterCreatePayload>;

export const RegistersAPI = {
  async list(q?: Query): Promise<{ count?: number; results?: Register[] } | Register[]> {
    const p = new URLSearchParams();
    if (q?.search) p.set("search", String(q.search));          // code, store__code, store__name  :contentReference[oaicite:2]{index=2}
    if (q?.ordering) p.set("ordering", String(q.ordering));    // id, code, is_active             :contentReference[oaicite:3]{index=3}
    if ((q as any)?.store) p.set("store", String((q as any).store)); // filterset_fields includes store
    if (typeof q?.is_active === "boolean") p.set("is_active", q.is_active ? "true" : "false");
    const url = `${BASE}/registers/${p.toString() ? `?${p.toString()}` : ""}`;
    const res = await ensureAuthedFetch(url);
    return jsonOrThrow(res);
  },

  async create(payload: RegisterCreatePayload): Promise<Register> {
    const res = await ensureAuthedFetch(`${BASE}/registers/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async update(id: number, payload: RegisterUpdatePayload): Promise<Register> {
    const res = await ensureAuthedFetch(`${BASE}/registers/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return jsonOrThrow(res);
  },

  async remove(id: number): Promise<true> {
    const res = await ensureAuthedFetch(`${BASE}/registers/${id}/`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to delete register");
    }
    return true;
  },

  async setPin(id: number, pin: string): Promise<{ ok: true }> {
    const res = await ensureAuthedFetch(`${BASE}/registers/${id}/set-pin/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    return jsonOrThrow(res);
  },

  async listByStore(storeId: number) {
    const res = await ensureAuthedFetch(`${BASE}/registers/?store=${storeId}`);
    return jsonOrThrow<{ count?: number; results?: Register[] } | Register[]>(res);
  },
};
