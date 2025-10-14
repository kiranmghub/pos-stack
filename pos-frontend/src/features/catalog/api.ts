// pos-frontend/src/features/catalog/api.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

/* ---------- Types (match your existing ones) ---------- */
export type Category = { id: number; name: string };
export type TaxCategory = { id: number; name: string; rate: string | number };

export type ProductListItem = {
  id: number;
  name: string;
  code?: string | null;
  is_active: boolean;
  image_url?: string | null;
  category?: { id: number; name: string } | null;
  tax_category?: { id: number; name: string } | null;
  variants_count: number;
  min_price?: string | null;
  max_price?: string | null;
  on_hand_total?: number;
  low_stock?: number;
};

export type ProductDTO = {
  id?: number;
  name: string;
  code?: string | null;
  description?: string | null;
  category_id?: number | null;
  tax_category_id?: number | null;
  is_active?: boolean;
  image_url?: string | null;
  variants?: Array<{
    id?: number;
    sku?: string | null;
    barcode?: string | null;
    price: string | number;
    uom?: string | null;
    is_active?: boolean;
    tax_category_id?: number | null;
  }>;
};

/* ---------- Helpers ---------- */
function q(params: Record<string, any>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  return sp.toString();
}

/* ---------- API ---------- */

export async function listCategories(): Promise<Category[]> {
  return apiFetchJSON("/api/v1/catalog/categories");
}

export async function listTaxCategories(): Promise<TaxCategory[]> {
  return apiFetchJSON("/api/v1/catalog/tax_categories");
}

export async function listProducts(params: {
  q?: string;
  is_active?: "true" | "false";
  category_id?: string | number;
  page?: number;
  page_size?: number;
}): Promise<{ count: number; results: ProductListItem[] }> {
  // backend expects "query=" not "q=" — map it here
  const { q: query, ...rest } = params || {};
  const search = q({ query, ...rest });
  return apiFetchJSON(`/api/v1/catalog/products?${search}`);
}

export async function createProduct(payload: ProductDTO): Promise<{ id: number }> {
  return apiFetchJSON("/api/v1/catalog/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProduct(id: number, payload: ProductDTO): Promise<{ ok: true }> {
  return apiFetchJSON(`/api/v1/catalog/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteProduct(id: number): Promise<{ ok: true }> {
  // Soft delete in our API → DELETE sets is_active=false
  return apiFetchJSON(`/api/v1/catalog/products/${id}`, { method: "DELETE" });
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch("/api/v1/uploads/image", {
    method: "POST",
    body: fd, // apiFetch will NOT set JSON header for FormData
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
