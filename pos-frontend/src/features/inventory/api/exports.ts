// pos-frontend/src/features/inventory/api/exports.ts
import { apiFetch, apiFetchJSON } from "@/lib/auth";

export type ExportFormat = "csv" | "json";
export type ExportType = "snapshot" | "delta";
export type DeltaExportType = "ledger" | "transfers" | "counts" | "purchase_orders";

export interface ExportSnapshotRequest {
  format: ExportFormat;
  store_id?: number;
  include_ledger?: boolean;
}

export interface ExportDeltaRequest {
  type: DeltaExportType;
  format: ExportFormat;
  store_id?: number;
  reset?: boolean;
}

export interface ExportTracking {
  id: number;
  export_type: DeltaExportType;
  last_exported_id: number;
  last_exported_at: string;
  records_exported: number;
}

export interface ExportTrackingListResponse {
  results: ExportTracking[];
  count: number;
}

/**
 * Export inventory snapshot (full data dump)
 * Security: Owner-only, tenant-scoped via API
 * Returns: File download (blob)
 */
export async function exportSnapshot(
  payload: ExportSnapshotRequest
): Promise<Blob> {
  const response = await apiFetch("/api/v1/analytics/exports/snapshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Export failed" }));
    throw new Error(error.error || error.detail || "Export failed");
  }

  return response.blob();
}

/**
 * Export inventory delta (incremental changes)
 * Security: Owner-only, tenant-scoped via API
 * Returns: File download (blob)
 */
export async function exportDelta(payload: ExportDeltaRequest): Promise<Blob> {
  const response = await apiFetch("/api/v1/analytics/exports/delta", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Export failed" }));
    throw new Error(error.error || error.detail || "Export failed");
  }

  return response.blob();
}

/**
 * Get export tracking information for delta exports
 * Security: Owner-only, tenant-scoped via API
 */
export async function getExportTracking(): Promise<ExportTrackingListResponse> {
  return apiFetchJSON("/api/v1/analytics/exports/tracking");
}

/**
 * Helper function to download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

