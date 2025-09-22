// src/features/admin/adminApi.ts
import { ensureAuthedFetch } from "@/components/AppShell";

const API = import.meta.env.VITE_API_BASE;

/* =========================
 * Users
 * ========================= */

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

export async function upsertTenantUser(payload: {
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  password?: string;
  role: string;
  is_active?: boolean;
}): Promise<TenantUserRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateTenantUser(
  id: number,
  patch: Partial<{ email: string; first_name: string; last_name: string; password: string; role: string; is_active: boolean }>
): Promise<TenantUserRow> {
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

/* =========================
 * Stores
 * ========================= */

// export type StoreRow = { id: number; code: string; name: string };

export type StoreRow = {
  id: number;
  code: string;
  name: string;
  timezone?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
};

export async function listStoresAdmin(q = ""): Promise<StoreRow[]> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/stores${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  if (!res.ok) throw new Error("Failed to load stores");
  return res.json();
}
// export async function createStore(payload: { code: string; name: string }): Promise<StoreRow> {
//   const res = await ensureAuthedFetch(`${API}/api/v1/admin/stores`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(payload),
//   });
//   if (!res.ok) throw new Error(await res.text());
//   return res.json();
// }
// export async function updateStore(id: number, patch: Partial<{ code: string; name: string }>): Promise<StoreRow> {
//   const res = await ensureAuthedFetch(`${API}/api/v1/admin/stores/${id}`, {
//     method: "PATCH",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(patch),
//   });
//   if (!res.ok) throw new Error(await res.text());
//   return res.json();
// }

export async function createStore(payload: {
  code: string;
  name: string;
  timezone?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
}): Promise<StoreRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/stores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateStore(
  id: number,
  patch: Partial<StoreRow>
): Promise<StoreRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/stores/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function deleteStore(id: number): Promise<void> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/stores/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/* =========================
 * Registers
 * ========================= */

export type RegisterRow = { id: number; code: string; name: string; store: number };

export async function listRegistersAdmin(store_id?: number): Promise<RegisterRow[]> {
  const res = await ensureAuthedFetch(
    `${API}/api/v1/admin/registers${store_id ? `?store_id=${encodeURIComponent(String(store_id))}` : ""}`
  );
  if (!res.ok) throw new Error("Failed to load registers");
  return res.json();
}
export async function createRegister(payload: { store: number; code: string; name?: string }): Promise<RegisterRow> {
  // backend expects a nested object or primary key; we’ll send {store,id}
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/registers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store: payload.store, code: payload.code, name: payload.name ?? payload.code }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function updateRegister(
  id: number,
  patch: Partial<{ code: string; name: string; store: number }>
): Promise<RegisterRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/registers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function deleteRegister(id: number): Promise<void> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/registers/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

/* =========================
 * Tax Categories
 * ========================= */

export type TaxCategoryRow = { id: number; name: string; code: string; rate: string };

export async function listTaxCategoriesAdmin(q = ""): Promise<TaxCategoryRow[]> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/tax_categories${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  if (!res.ok) throw new Error("Failed to load tax categories");
  return res.json();
}
export async function createTaxCategory(payload: { name: string; code: string; rate: number | string }): Promise<TaxCategoryRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/tax_categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function updateTaxCategory(
  id: number,
  patch: Partial<{ name: string; code: string; rate: number | string }>
): Promise<TaxCategoryRow> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/tax_categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function deleteTaxCategory(id: number): Promise<void> {
  const res = await ensureAuthedFetch(`${API}/api/v1/admin/tax_categories/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}
