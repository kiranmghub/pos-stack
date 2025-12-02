// pos-frontend/src/features/admin/api/tenant.ts
import { apiFetch, apiFetchJSON } from "@/lib/auth";

export type TenantDetails = {
  id: number;
  name: string;
  code: string;
  logo_url?: string | null;
  logo_file_url?: string | null;
  email?: string | null;
  business_phone?: string | null;
  description?: string | null;
  currency_code?: string;
  currency_symbol?: string | null;
  country_code?: string | null;
};

export async function getTenantDetails(): Promise<TenantDetails> {
  return apiFetchJSON<TenantDetails>("/api/v1/tenant_admin/tenant");
}

export async function uploadTenantLogo(file: File): Promise<{ image_url: string; logo_file_url: string }> {
  const fd = new FormData();
  fd.append("file", file); // field name must be 'file' to match backend

  // Use apiFetch (not apiFetchJSON) because FormData shouldn't have Content-Type: application/json
  const res = await apiFetch("/api/v1/tenant_admin/tenant/logo", {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to upload logo");
  }
  return res.json();
}

