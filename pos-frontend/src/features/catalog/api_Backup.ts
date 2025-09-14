// src/features/catalog/api.ts
import { authHeaders } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "";

/** ===== Types ===== */
export type TaxCategory = { id: number; name: string; rate: string };
export type Category = { id: number; name: string; slug?: string | null };

export type VariantDTO = {
  id?: number;
  sku?: string | null;
  barcode?: string | null;
  price: string;            // money as string
  uom?: string | null;
  is_active?: boolean;
  tax_category?: number | null; // id
  tax_rate?: string | null;     // derived
  on_hand?: number | string | null; // derived (store scoped)
};

export type ProductDTO = {
  id?: number;
  name: string;
  is_active: boolean;
  category?: string | null;
  description?: string | null;
  created_at?: string;
  variants?: VariantDTO[];
  variants_count?: number;
  default_tax_rate?: string | null;
};

export type Page<T> = {
  count: number;
  results: T[];
};

async function jsonOrThrow<T = any>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = (data?.detail || data?.message || msg) as string;
    } catch { /* no-op */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** ===== Catalog APIs ===== */

/** List products with optional search/filter + pagination */
// ✅ listProducts now sends ?query=... (matches backend)
export async function listProducts(params: {
  page?: number;
  page_size?: number;
  query?: string;          // <— use 'query' (NOT 'q' or 'search')
  is_active?: boolean | null;
}) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (typeof params.query === "string") q.set("query", params.query.trim()); // <-- important
  if (params.is_active !== undefined && params.is_active !== null) {
    q.set("is_active", params.is_active ? "true" : "false");
  }

  const res = await fetch(`/api/v1/catalog/products?${q.toString()}`, {
    headers: authHeaders(),
  });

  return jsonOrThrow<{
    count: number;
    results: Array<{
      id: number;
      name: string;
      is_active: boolean;
      category: string | null;
      variants_count: number;
      default_tax_rate?: string | null;
      created_at: string;
    }>;
  }>(res);
}


/** Get one product (optionally store-scoped for inventory figures) */
export async function getProduct(id: number, opts?: { store_id?: number | string }): Promise<ProductDTO> {
  const q = new URLSearchParams();
  if (opts?.store_id != null) q.set("store_id", String(opts.store_id));
  const res = await fetch(`${API_BASE}/api/v1/catalog/products/${id}?${q.toString()}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow<ProductDTO>(res);
}

/** Create a product */
export async function createProduct(payload: {
  name: string;
  is_active?: boolean;
  category?: string | null;
  description?: string | null;
}): Promise<{ id: number }> {
  const body = {
    name: payload.name,
    is_active: payload.is_active ?? true,
    category: payload.category ?? "",
    // backend allows blank string for description (null coerced server-side)
    description: payload.description ?? "",
  };
  const res = await fetch(`${API_BASE}/api/v1/catalog/products`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow<{ id: number }>(res);
}

/** Update a product (partial) */
export async function updateProduct(id: number, patch: Partial<Pick<ProductDTO, "name" | "is_active" | "category" | "description">>): Promise<ProductDTO> {
  const res = await fetch(`${API_BASE}/api/v1/catalog/products/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<ProductDTO>(res);
}

/** Delete (soft-delete server-side → is_active=false or hard delete; server decides) */
export async function deleteProduct(id: number): Promise<{ ok: true }> {
  const res = await fetch(`${API_BASE}/api/v1/catalog/products/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 204) return { ok: true };
  return jsonOrThrow(res);
}

/** Distinct categories for the tenant */
export async function listCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE}/api/v1/catalog/categories`, {
    headers: authHeaders(),
  });
  return jsonOrThrow<Category[]>(res);
}

/** Tenant tax categories */
export async function listTaxCategories(): Promise<TaxCategory[]> {
  const res = await fetch(`${API_BASE}/api/v1/catalog/tax_categories`, {
    headers: authHeaders(),
  });
  return jsonOrThrow<TaxCategory[]>(res);
}

/** Optional: upload/attach an image to a product (if your backend exposes it) */
export async function uploadImage(productId: number, file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_BASE}/api/v1/catalog/products/${productId}/image`, {
    method: "POST",
    headers: authHeaders(), // do not set Content-Type manually for FormData
    body: form,
  });
  return jsonOrThrow<{ url: string }>(res);
}
