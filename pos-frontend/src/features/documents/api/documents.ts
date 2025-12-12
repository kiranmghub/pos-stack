// pos-frontend/src/features/documents/api/documents.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

export interface DocumentUser {
  id: number;
  username: string;
  email?: string;
}

export interface RelatedPO {
  id: number;
  po_number: string;
  status: string;
  link_type: "direct" | "metadata";
}

export interface Document {
  id: number;
  label: string;
  doc_type: string;
  description: string;
  file_url: string;
  file_name: string;
  file_size?: number;
  file_type?: string;
  uploaded_by: DocumentUser;
  subject_user?: {
    id: number;
    username: string;
  } | null;
  metadata: Record<string, any>;
  related_pos?: RelatedPO[];
  created_at: string;
  updated_at: string;
}

export interface DocumentsListResponse {
  count: number;
  results: Document[];
}

export interface DocumentsListParams {
  page?: number;
  page_size?: number;
  search?: string;
  doc_type?: string;
  ordering?: string;
}

/**
 * List tenant documents with pagination, filtering, and search.
 */
export async function listDocuments(
  params: DocumentsListParams = {}
): Promise<DocumentsListResponse> {
  const queryParams = new URLSearchParams();
  
  if (params.page) queryParams.set("page", String(params.page));
  if (params.page_size) queryParams.set("page_size", String(params.page_size));
  if (params.search) queryParams.set("search", params.search);
  if (params.doc_type) queryParams.set("doc_type", params.doc_type);
  if (params.ordering) queryParams.set("ordering", params.ordering);
  
  const queryString = queryParams.toString();
  const url = `/api/v1/tenant_admin/documents/${queryString ? `?${queryString}` : ""}`;
  
  return apiFetchJSON(url);
}

/**
 * Get a single document by ID.
 */
export async function getDocument(id: number): Promise<Document> {
  return apiFetchJSON(`/api/v1/tenant_admin/documents/${id}`);
}

/**
 * Get file download URL for a document.
 * For S3: Returns signed URL object with expiration.
 * For local: Returns the file URL directly.
 */
export async function getDocumentFileUrl(
  documentId: number
): Promise<{ file_url: string; expires_in?: number } | string> {
  const response = await apiFetchJSON(`/api/v1/tenant_admin/documents/${documentId}/file/`);
  
  // For S3, response is JSON with file_url and expires_in
  if (typeof response === "object" && "file_url" in response) {
    return response as { file_url: string; expires_in?: number };
  }
  
  // For local storage, the endpoint streams the file directly
  // Return the endpoint URL to use in href
  return `/api/v1/tenant_admin/documents/${documentId}/file/`;
}

export interface UploadDocumentParams {
  file: File;
  label: string;
  doc_type?: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Upload a new document.
 * POST /api/v1/tenant_admin/documents/upload/
 */
export async function uploadDocument(
  params: UploadDocumentParams
): Promise<Document> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("label", params.label);
  
  if (params.doc_type) {
    formData.append("doc_type", params.doc_type);
  }
  
  if (params.description) {
    formData.append("description", params.description);
  }
  
  if (params.metadata) {
    formData.append("metadata", JSON.stringify(params.metadata));
  }

  // Use apiFetch (not apiFetchJSON) because FormData shouldn't have Content-Type: application/json
  const response = await apiFetch("/api/v1/tenant_admin/documents/upload/", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }
    throw new Error(
      errorData.error || 
      errorData.errors || 
      (typeof errorData === "string" ? errorData : "Failed to upload document")
    );
  }

  return response.json();
}

/**
 * Delete a document (soft delete).
 * DELETE /api/v1/tenant_admin/documents/{id}/
 */
export async function deleteDocument(id: number): Promise<{ message: string }> {
  const response = await apiFetch(`/api/v1/tenant_admin/documents/${id}/`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }
    throw new Error(
      errorData.error || 
      errorData.message || 
      "Failed to delete document"
    );
  }

  return response.json();
}

