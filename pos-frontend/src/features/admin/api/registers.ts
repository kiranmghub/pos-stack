// pos-frontend/src/features/admin/api/registers.ts
import { ensureAuthedFetch } from "@/components/AppShell";
import { jsonOrThrow } from "../adminApi";

const BASE = "/api/v1/tenant-admin";

export type Register = { id:number; code:string; name?:string; is_active:boolean; store:number };

export const RegistersAPI = {
  async listByStore(storeId: number) {
    const res = await ensureAuthedFetch(`${BASE}/registers/?store=${storeId}`);
    return jsonOrThrow<{ count?: number; results?: Register[] } | Register[]>(res);
  },
};
