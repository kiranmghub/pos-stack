// pos-frontend/src/features/inventory/audit/LedgerTable.tsx
import React from "react";
import { DataTable, type Column } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { LedgerEntry } from "../api/ledger";
import { format } from "date-fns";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LedgerTableProps {
  /** Ledger entries */
  entries: LedgerEntry[];
  /** Loading state */
  loading?: boolean;
  /** On entry click handler */
  onEntryClick?: (entry: LedgerEntry) => void;
}

/**
 * LedgerTable - Displays ledger entries in a table format
 * Security: All data is tenant-scoped from the API
 */
export function LedgerTable({
  entries,
  loading = false,
  onEntryClick,
}: LedgerTableProps) {
  const formatRefType = (refType: string): string => {
    return refType
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  const getRefTypeVariant = (refType: string): "success" | "error" | "warning" | "info" => {
    if (refType.includes("SALE") || refType.includes("RECEIPT") || refType.includes("TRANSFER_IN")) {
      return "success";
    }
    if (refType.includes("WASTE") || refType.includes("TRANSFER_OUT")) {
      return "error";
    }
    if (refType.includes("ADJUSTMENT") || refType.includes("COUNT")) {
      return "warning";
    }
    return "info";
  };

  const columns: Column<LedgerEntry>[] = [
    {
      key: "created_at",
      header: "Date & Time",
      width: "10rem",
      cell: (row) => (
        <div className="text-sm">
          <div className="font-medium text-foreground">
            {format(new Date(row.created_at), "MMM d, yyyy")}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(row.created_at), "h:mm a")}
          </div>
        </div>
      ),
    },
    {
      key: "store",
      header: "Store",
      width: "8rem",
      cell: (row) => (
        <div className="text-sm">
          <div className="font-medium text-foreground">
            {row.store_name || row.store_code || `Store ${row.store_id}`}
          </div>
          {row.store_code && row.store_name && (
            <div className="text-xs text-muted-foreground">{row.store_code}</div>
          )}
        </div>
      ),
    },
    {
      key: "product",
      header: "Product",
      width: "minmax(200px, 1fr)",
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.product_name || "N/A"}</div>
          {row.sku && (
            <div className="text-xs text-muted-foreground">SKU: {row.sku}</div>
          )}
        </div>
      ),
    },
    {
      key: "qty_delta",
      header: "Quantity Change",
      width: "8rem",
      align: "right",
      cell: (row) => {
        const isPositive = row.qty_delta > 0;
        const isNegative = row.qty_delta < 0;
        const isZero = row.qty_delta === 0;

        return (
          <div className="flex items-center justify-end gap-1.5">
            {isPositive && <ArrowUp className="h-4 w-4 text-success" />}
            {isNegative && <ArrowDown className="h-4 w-4 text-destructive" />}
            {isZero && <Minus className="h-4 w-4 text-muted-foreground" />}
            <span
              className={cn(
                "font-semibold",
                isPositive && "text-success",
                isNegative && "text-destructive",
                isZero && "text-muted-foreground"
              )}
            >
              {isPositive ? "+" : ""}
              {row.qty_delta}
            </span>
          </div>
        );
      },
    },
    {
      key: "balance_after",
      header: "Balance After",
      width: "8rem",
      align: "right",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">
          {row.balance_after !== null ? row.balance_after : "N/A"}
        </div>
      ),
    },
    {
      key: "ref_type",
      header: "Type",
      width: "10rem",
      cell: (row) => (
        <StatusBadge
          status={formatRefType(row.ref_type)}
          variant={getRefTypeVariant(row.ref_type)}
          size="sm"
        />
      ),
    },
    {
      key: "ref_id",
      header: "Reference",
      width: "8rem",
      cell: (row) => (
        <div className="text-sm text-muted-foreground">
          {row.ref_id ? `#${row.ref_id}` : "—"}
        </div>
      ),
    },
    {
      key: "created_by",
      header: "User",
      width: "minmax(12rem, 1fr)",
      cell: (row) => (
        <div className="text-sm text-muted-foreground truncate" title={row.created_by || "System"}>
          {row.created_by || "System"}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={entries}
      columns={columns}
      loading={loading}
      onRowClick={onEntryClick}
      emptyMessage="No ledger entries found"
    />
  );
}

