// pos-frontend/src/features/inventory/settings/ExportHistory.tsx
import React from "react";
import { ExportTracking } from "../api/exports";
import { DataTable } from "../components/DataTable";
import { formatDistanceToNow, format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ExportHistoryProps {
  /** Export tracking list */
  tracking: ExportTracking[];
  /** Loading state */
  isLoading?: boolean;
  /** On refresh handler */
  onRefresh?: () => void;
}

const DELTA_EXPORT_TYPE_LABELS: Record<string, string> = {
  ledger: "Stock Ledger",
  transfers: "Transfers",
  counts: "Count Sessions",
  purchase_orders: "Purchase Orders",
};

/**
 * ExportHistory - Table component for displaying export tracking history
 * Security: All data is owner-only and tenant-scoped from the API
 */
export function ExportHistory({
  tracking,
  isLoading = false,
  onRefresh,
}: ExportHistoryProps) {
  const columns = [
    {
      key: "export_type",
      header: "Export Type",
      render: (item: ExportTracking) => (
        <div>
          <div className="font-medium text-foreground">
            {DELTA_EXPORT_TYPE_LABELS[item.export_type] || item.export_type}
          </div>
          <div className="text-xs text-muted-foreground">Delta Export</div>
        </div>
      ),
    },
    {
      key: "last_exported",
      header: "Last Exported",
      render: (item: ExportTracking) => (
        <div>
          {item.last_exported_at ? (
            <>
              <div className="text-sm text-foreground">
                {formatDistanceToNow(new Date(item.last_exported_at), { addSuffix: true })}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(item.last_exported_at), "PPpp")}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Never</div>
          )}
        </div>
      ),
    },
    {
      key: "records",
      header: "Records Exported",
      render: (item: ExportTracking) => (
        <div className="text-sm font-medium text-foreground">
          {item.records_exported.toLocaleString()}
        </div>
      ),
    },
    {
      key: "last_id",
      header: "Last Exported ID",
      render: (item: ExportTracking) => (
        <div className="text-sm text-muted-foreground font-mono">
          {item.last_exported_id.toLocaleString()}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Export History</h3>
          <p className="text-sm text-muted-foreground">
            Track delta export progress and history
          </p>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}
      </div>
      <div className="rounded-lg border border-border bg-card">
        <DataTable
          columns={columns}
          data={tracking}
          emptyMessage="No export history found. Create your first delta export to see tracking information."
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

