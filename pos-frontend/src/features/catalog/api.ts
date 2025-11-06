// pos-frontend/src/features/catalog/api.ts
import { apiFetch, apiFetchJSON, authHeaders } from "@/lib/auth";
import type {
  ProductListItem,
  ProductDetail,
  Paginated,
  CreateProductDto,
  UpdateProductDto,
  CreateVariantDto,
  UpdateVariantDto,
  Variant,
  ID,
} from "./types";


const API_BASE = import.meta.env.VITE_API_BASE || ""; // your auth.ts handles prefixing with "/api" when empty

function toFormData(obj: Record<string, any>): FormData {
  const fd = new FormData();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, v as any);
  });
  return fd;
}

// Upload a product image via the dedicated /image endpoint
export async function uploadProductImage(
  productId: ID,
  file: File
): Promise<{ image_url: string }> {
  const fd = new FormData();
  fd.append("file", file); // field name must be 'file' to match backend

  // Use apiFetch (not apiFetchJSON) because FormData shouldn't have Content-Type: application/json
  const res = await apiFetch(`/api/v1/catalog/products/${productId}/image`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function uploadVariantImage(variantId: ID, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch(`/api/v1/catalog/variants/${variantId}/image`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    let msg = "Failed to upload image.";
    try { const data = await res.json(); msg = data?.error || data?.detail || msg; } catch {}
    throw new Error(msg);
  }
  // backend currently returns { image_url: ... }
  try {
    return await res.json();
  } catch {
    return {};
  }
}


export async function listProducts(params: {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  sort?: "name" | "price_min" | "price_max" | "on_hand" | "active";
  direction?: "asc" | "desc";
  store_id?: string | number;
}) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (params.search) q.set("query", params.search);
  if (params.category) q.set("category", params.category);
  if (params.sort) q.set("sort", params.sort);
  if (params.direction) q.set("direction", params.direction);
  if (params?.store_id) q.set("store_id", String(params.store_id));
  return apiFetchJSON(`/api/v1/catalog/products?${q.toString()}`);
}


export async function getProduct(
  id: ID,
  opts?: { 
    vsort?: "name" | "price" | "on_hand" | "active"; 
    vdirection?: "asc" | "desc";
    store_id?: string | number;
   }
): Promise<ProductDetail> {
  const qs = new URLSearchParams();
  if (opts?.vsort) qs.set("vsort", opts.vsort);
  if (opts?.vdirection) qs.set("vdirection", opts.vdirection);
  if (opts?.store_id) qs.set("store_id", String(opts.store_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetchJSON(`/api/catalog/products/${id}/${suffix}`) as Promise<ProductDetail>;
}


export async function exportCatalog(params: {
  scope: "products" | "variants" | "combined";
  format: "csv" | "json" | "pdf";
  q?: string;
  include_on_hand?: boolean;
  on_hand_mode?: "aggregate" | "store" | "breakdown_columns" | "breakdown_rows";
  store_id?: string | number;
  store_ids?: (string | number)[];
}) {
  const qs = new URLSearchParams();
  qs.set("scope", params.scope);
  qs.set("output_format", params.format);
  if (params.q) qs.set("q", params.q);
    if (params.include_on_hand) qs.set("include_on_hand", "true");
  if (params.on_hand_mode) qs.set("on_hand_mode", params.on_hand_mode);
  if (params.store_id != null) qs.set("store_id", String(params.store_id));
  if (params.store_ids && params.store_ids.length) {
    params.store_ids.forEach((id) => qs.append("store_ids[]", String(id)));
  }

  const url = `/api/v1/catalog/export?${qs.toString()}`;
  const headers = await authHeaders();

  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Export failed (${resp.status})`);
  }

  // Extract filename from Content-Disposition
  const disposition = resp.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]*)"?/);
  const defaultName = `catalog-${params.scope}.${params.format}`;
  const filename = filenameMatch?.[1] || defaultName;

  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

// NEW: Download CSV template for import
export async function downloadImportTemplate(scope: "products" | "variants") {
  const url = new URL("/api/v1/catalog/import/template", window.location.origin);
  url.searchParams.set("scope", scope);
  url.searchParams.set("output_format", "csv");
  const headers = await authHeaders();
  const resp = await fetch(url.toString(), { headers });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(txt || `Template download failed (${resp.status})`);
  }
  const cd = resp.headers.get("Content-Disposition") || "";
  const m = /filename=\"?([^\";]+)\"?/i.exec(cd);
  const suggested = m?.[1] || `${scope}-template.csv`;
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = suggested;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// NEW: Upload CSV for import (dry-run or apply)
export async function importCatalog(params: {
  scope: "products" | "variants";
  mode: "create" | "upsert";
  dry_run: boolean;
  file: File;
}) {
  const url = new URL("/api/v1/catalog/import", window.location.origin);
  const qs = url.searchParams;
  qs.set("scope", params.scope);
  qs.set("mode", params.mode);
  qs.set("dry_run", params.dry_run ? "1" : "0");
  const headers = await authHeaders();
  // **Do not** set Content-Type manually for FormData
  const fd = new FormData();
  fd.append("file", params.file);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers, // includes Authorization only
    body: fd,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(txt || `Import failed (${resp.status})`);
  }
  return resp.json() as Promise<{
    scope: string;
    mode: string;
    dry_run: boolean;
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: any }[];
    total_rows: number;
  }>;
}

export async function createProduct(data: CreateProductDto): Promise<ProductDetail> {
  const body = toFormData(data as any);
  const res = await apiFetch(`/api/catalog/products/`, { method: "POST", body, headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateProduct(id: ID, data: UpdateProductDto): Promise<ProductDetail> {
  const body = toFormData(data as any);
  const res = await apiFetch(`/api/catalog/products/${id}/`, { method: "PATCH", body, headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listVariants(params?: { product?: ID; search?: string; page?: number; page_size?: number }): Promise<Paginated<Variant>> {
  const qs = new URLSearchParams();
  if (params?.product) qs.set("product", String(params.product));
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  return apiFetchJSON(`/api/catalog/variants/?${qs.toString()}`);
}

export async function createVariant(data: CreateVariantDto): Promise<Variant> {
  const body = toFormData(data as any);
  const res = await apiFetch(`/api/catalog/variants/`, { method: "POST", body, headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateVariant(id: ID, data: UpdateVariantDto): Promise<Variant> {
  const { id: _id, ...rest } = data as any;
  const body = toFormData(rest);
  const res = await apiFetch(`/api/catalog/variants/${id}/`, { method: "PATCH", body, headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteVariant(id: ID) {
  // Use the raw fetch wrapper, not the JSON helper.
  const res = await apiFetch(`/api/catalog/variants/${id}/`, { method: "DELETE" });
  if (!res.ok) {
    // If you have a shared error util, use it here instead of throwing a generic error
    // e.g., throw await toApiError(res)
    let msg = "Failed to delete variant";
    try {
      const data = await res.json();
      msg = data?.detail || msg;
    } catch { /* 204 -> no body, ignore */ }
    throw new Error(msg);
  }
  // success: 204 No Content -> just return void
  return;
}

export async function deleteProduct(id: ID) {
  const res = await apiFetch(`/api/catalog/products/${id}/`, { method: "DELETE" });
  if (!res.ok) {
    let msg = "Failed to delete product.";
    try { const d = await res.json(); msg = d?.detail || msg; } catch {}
    throw new Error(msg);
  }
}


export async function generateProductCode(name: string) {
  return apiFetchJSON("/api/v1/catalog/codes", {
    method: "POST",
    body: JSON.stringify({ scope: "product", name }),
  }); // -> { code }
}

export async function generateVariantSku(productId: ID, name: string) {
  return apiFetchJSON("/api/v1/catalog/codes", {
    method: "POST",
    body: JSON.stringify({ scope: "variant", product_id: productId, name }),
  }); // -> { code }
}

export async function generateBarcode(preferred?: "EAN13" | "CODE128") {
  return apiFetchJSON("/api/v1/catalog/barcodes", {
    method: "POST",
    body: JSON.stringify(preferred ? { type: preferred } : {}),
  }); // -> { barcode, type }
}


// Fetch lightweight store options for the dropdown
export async function listInventoryStores(): Promise<{ id: number; name: string }[]> {
  const data = await apiFetchJSON("/api/v1/stores/stores-lite");
  // If DRF pagination is enabled, data is {count, next, previous, results:[...]}
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}



