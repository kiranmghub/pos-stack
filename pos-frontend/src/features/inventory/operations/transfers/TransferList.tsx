// pos-frontend/src/features/inventory/operations/transfers/TransferList.tsx
import React from "react";
import { DataTable, type Column, EmptyState, LoadingSkeleton } from "../../components";
import { TransferStatusBadge } from "./TransferStatusBadge";
import { Transfer } from "../../api/transfers";
import { format } from "date-fns";
import { ArrowRight, Package } from "lucide-react";

export interface TransferListProps {
  /** Transfers to display */
  transfers: Transfer[];
  /** Loading state */
  loading?: boolean;
  /** On transfer click handler */
  onTransferClick?: (transfer: Transfer) => void;
  /** Selected transfer ID */
  selectedTransferId?: number | null;
}

/**
 * TransferList - Displays list of transfers in a table
 * Security: All data is tenant-scoped from the API
 */
export function TransferList({
  transfers,
  loading = false,
  onTransferClick,
  selectedTransferId,
}: TransferListProps) {
  const columns: Column<Transfer>[] = [
    {
      key: "id",
      header: "ID",
      width: "5rem",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">#{row.id}</div>
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
      key: "stores",
      header: "Transfer",
      width: "minmax(250px, 1fr)",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="text-sm">
            <div className="font-medium text-foreground">{row.from_store.name}</div>
            <div className="text-xs text-muted-foreground">{row.from_store.code}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-foreground">{row.to_store.name}</div>
            <div className="text-xs text-muted-foreground">{row.to_store.code}</div>
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
      cell: (row) => <TransferStatusBadge status={row.status} size="sm" />,
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

  if (transfers.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="No transfers found"
        description="Create a new transfer to get started"
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <DataTable
        data={transfers}
        columns={columns}
        onRowClick={onTransferClick}
        getRowClassName={(row) =>
          selectedTransferId === row.id ? "bg-accent/50" : ""
        }
        emptyMessage="No transfers found"
      />
    </div>
  );
}

