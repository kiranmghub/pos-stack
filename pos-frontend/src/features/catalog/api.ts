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

// export async function uploadVariantImage(variantId: ID, file: File) {
//   const fd = new FormData();
//   fd.append("file", file);
//   return apiFetchJSON(`/api/v1/catalog/variants/${variantId}/image`, {
//     method: "POST",
//     body: fd,
//   });
// }

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



export async function listProducts(params?: { page?: number; page_size?: number; search?: string; category?: string; active?: boolean }): Promise<Paginated<ProductListItem>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.search) qs.set("search", params.search);
  if (params?.category) qs.set("category", params.category);
  if (typeof params?.active === "boolean") qs.set("active", String(params.active));
  return apiFetchJSON(`/api/catalog/products/?${qs.toString()}`);
}

export async function getProduct(id: ID): Promise<ProductDetail> {
  return apiFetchJSON(`/api/catalog/products/${id}/`);
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
