// pos-frontend/src/features/inventory/operations/returns/InspectionQueue.tsx
import React from "react";
import { Return } from "../../api/returns";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { Package, AlertCircle } from "lucide-react";

export interface InspectionQueueProps {
  /** Returns list */
  returns: Return[];
  /** Selected return ID */
  selectedReturnId?: number | null;
  /** On return click handler */
  onReturnClick?: (returnItem: Return) => void;
  /** Loading state */
  isLoading?: boolean;
}

const getStatusVariant = (status: string) => {
  switch (status) {
    case "awaiting_inspection":
      return "warning";
    case "accepted":
      return "success";
    case "rejected":
      return "error";
    case "finalized":
      return "default";
    case "draft":
      return "muted";
    default:
      return "default";
  }
};

/**
 * InspectionQueue - Table component for displaying returns awaiting inspection
 * Security: All data is tenant-scoped from the API
 */
export function InspectionQueue({
  returns,
  selectedReturnId,
  onReturnClick,
  isLoading = false,
}: InspectionQueueProps) {
  const getPendingItemsCount = (returnItem: Return) => {
    return returnItem.items.filter((item) => item.disposition === "PENDING").length;
  };

  const getInspectedItemsCount = (returnItem: Return) => {
    return returnItem.items.filter(
      (item) => item.disposition === "RESTOCK" || item.disposition === "WASTE"
    ).length;
  };

  const columns = [
    {
      key: "return_no",
      header: "Return #",
      render: (returnItem: Return) => (
        <div>
          <div className="font-medium text-foreground">
            {returnItem.return_no || `#${returnItem.id}`}
          </div>
          {returnItem.sale_receipt_no && (
            <div className="text-xs text-muted-foreground">
              Sale: {returnItem.sale_receipt_no}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "store",
      header: "Store",
      render: (returnItem: Return) => (
        <div className="text-sm text-foreground">
          {returnItem.store_name || `Store #${returnItem.store}`}
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      render: (returnItem: Return) => {
        const pending = getPendingItemsCount(returnItem);
        const inspected = getInspectedItemsCount(returnItem);
        const total = returnItem.items.length;

        return (
          <div>
            <div className="text-sm font-medium text-foreground">
              {total} item{total !== 1 ? "s" : ""}
            </div>
            {pending > 0 && (
              <div className="text-xs text-badge-warning-text">
                {pending} pending inspection
              </div>
            )}
            {inspected > 0 && (
              <div className="text-xs text-muted-foreground">
                {inspected} inspected
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (returnItem: Return) => (
        <StatusBadge
          status={returnItem.status.replace("_", " ")}
          variant={getStatusVariant(returnItem.status)}
        />
      ),
    },
    {
      key: "refund",
      header: "Refund",
      render: (returnItem: Return) => (
        <div className="text-sm font-medium text-foreground">
          ${parseFloat(returnItem.refund_total || "0").toFixed(2)}
        </div>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (returnItem: Return) => (
        <div>
          <div className="text-sm text-foreground">
            {formatDistanceToNow(new Date(returnItem.created_at), { addSuffix: true })}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(returnItem.created_at), "PPp")}
          </div>
        </div>
      ),
    },
    {
      key: "priority",
      header: "",
      render: (returnItem: Return) => {
        const pending = getPendingItemsCount(returnItem);
        if (pending === 0) {
          return null;
        }
        return (
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-1 text-badge-warning-text">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Ready</span>
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <DataTable
        columns={columns}
        data={returns}
        emptyMessage="No returns awaiting inspection"
        isLoading={isLoading}
        onRowClick={onReturnClick}
        getRowClassName={(returnItem) =>
          cn(
            "cursor-pointer hover:bg-accent/50",
            selectedReturnId === returnItem.id && "bg-accent",
            getPendingItemsCount(returnItem) === 0 && "opacity-75"
          )
        }
      />
    </div>
  );
}

