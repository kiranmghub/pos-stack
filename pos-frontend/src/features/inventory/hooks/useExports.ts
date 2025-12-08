// pos-frontend/src/features/inventory/hooks/useExports.ts
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  exportSnapshot,
  exportDelta,
  getExportTracking,
  downloadBlob,
  type ExportSnapshotRequest,
  type ExportDeltaRequest,
} from "../api/exports";
import { useNotify } from "@/lib/notify";

/**
 * React Query hook for export tracking
 * Security: Owner-only, tenant-scoped via API
 */
export function useExportTracking() {
  return useQuery({
    queryKey: ["inventory", "exports", "tracking"],
    queryFn: () => getExportTracking(),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query mutation for exporting snapshot
 * Security: Owner-only, tenant-scoped via API
 */
export function useExportSnapshot() {
  const notify = useNotify();

  return useMutation({
    mutationFn: async (payload: ExportSnapshotRequest) => {
      const blob = await exportSnapshot(payload);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const extension = payload.format;
      const filename = `inventory_snapshot_${timestamp}.${extension}`;
      downloadBlob(blob, filename);
      return { success: true, filename };
    },
    onSuccess: (data) => {
      notify.success(`Export completed: ${data.filename}`);
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to export snapshot");
    },
  });
}

/**
 * React Query mutation for exporting delta
 * Security: Owner-only, tenant-scoped via API
 */
export function useExportDelta() {
  const notify = useNotify();

  return useMutation({
    mutationFn: async (payload: ExportDeltaRequest) => {
      const blob = await exportDelta(payload);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const extension = payload.format;
      const filename = `${payload.type}_delta_${timestamp}.${extension}`;
      downloadBlob(blob, filename);
      return { success: true, filename };
    },
    onSuccess: (data) => {
      notify.success(`Export completed: ${data.filename}`);
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to export delta");
    },
  });
}

