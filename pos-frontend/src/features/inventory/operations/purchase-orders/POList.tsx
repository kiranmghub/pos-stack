// pos-frontend/src/features/inventory/operations/purchase-orders/POList.tsx
import React from "react";
import { DataTable, type Column, EmptyState, LoadingSkeleton } from "../../components";
import { StatusBadge } from "../../components/StatusBadge";
import { PurchaseOrder } from "../../api/purchaseOrders";
import { format } from "date-fns";
import { Package, Building2, Store } from "lucide-react";
import { cn } from "@/lib/utils";

export interface POListProps {
  /** Purchase orders to display */
  purchaseOrders: PurchaseOrder[];
  /** Loading state */
  loading?: boolean;
  /** On PO click handler */
  onPOClick?: (po: PurchaseOrder) => void;
  /** Selected PO ID */
  selectedPOId?: number | null;
}

/**
 * POList - Displays list of purchase orders in a table
 * Security: All data is tenant-scoped from the API
 */
export function POList({
  purchaseOrders,
  loading = false,
  onPOClick,
  selectedPOId,
}: POListProps) {
  const getStatusVariant = (status: string): "draft" | "in_progress" | "completed" | "cancelled" => {
    if (status === "DRAFT") return "draft";
    if (status === "SUBMITTED" || status === "PARTIAL_RECEIVED") return "in_progress";
    if (status === "RECEIVED") return "completed";
    if (status === "CANCELLED") return "cancelled";
    return "draft";
  };

  const columns: Column<PurchaseOrder>[] = [
    {
      key: "po_number",
      header: "PO Number",
      width: "10rem",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">{row.po_number || `#${row.id}`}</div>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      width: "8rem",
      cell: (row) => (
        <div className="text-sm text-muted-foreground">
          {format(new Date(row.created_at), "MMM d, yyyy")}
        </div>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      width: "12rem",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">{row.vendor.name}</div>
            {row.vendor.code && (
              <div className="text-xs text-muted-foreground">{row.vendor.code}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "store",
      header: "Store",
      width: "10rem",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">{row.store.name}</div>
            <div className="text-xs text-muted-foreground">{row.store.code}</div>
          </div>
        </div>
      ),
    },
    {
      key: "lines",
      header: "Items",
      width: "6rem",
      align: "center",
      cell: (row) => (
        <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
          <Package className="h-4 w-4" />
          <span>{row.lines.length}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "10rem",
      cell: (row) => (
        <StatusBadge
          status={row.status.replace("_", " ")}
          variant={getStatusVariant(row.status)}
          size="sm"
        />
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <LoadingSkeleton key={i} variant="card" height={60} />
        ))}
      </div>
    );
  }

  if (purchaseOrders.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="No purchase orders found"
        description="Create a new purchase order to get started"
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <DataTable
        data={purchaseOrders}
        columns={columns}
        onRowClick={onPOClick}
        getRowClassName={(row) =>
          selectedPOId === row.id ? "bg-accent/50" : ""
        }
        emptyMessage="No purchase orders found"
      />
    </div>
  );
}

