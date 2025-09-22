// src/features/admin/adminAapi.ts
import { ensureAuthedFetch } from "@/components/AppShell"; // same helper you use elsewhere

const API = import.meta.env.VITE_API_BASE;

export type TenantUserRow = {
  id: number;
  role: string;
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    is_active: boolean;
  };
};

export async function listTenantUsers(q = ""): Promise<TenantUserRow[]> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

// Create or update user & tenant role in one call
export async function upsertTenantUser(payload: {
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  password?: string;
  role: string;
  is_active?: boolean; // NEW: when updating, allow toggling
}): Promise<TenantUserRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateTenantUser(id: number, patch: Partial<{
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  role: string;
  is_active: boolean; // NEW
}>): Promise<TenantUserRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteTenantUser(id: number): Promise<void> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/users/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}
