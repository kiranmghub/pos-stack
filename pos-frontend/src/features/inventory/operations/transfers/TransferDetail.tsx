// pos-frontend/src/features/inventory/operations/transfers/TransferDetail.tsx
import React from "react";
import { Transfer } from "../../api/transfers";
import { TransferStatusBadge } from "./TransferStatusBadge";
import { format } from "date-fns";
import { ArrowRight, Package, FileText, Calendar, User } from "lucide-react";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingSkeleton } from "../../components";
import { cn } from "@/lib/utils";

export interface TransferDetailProps {
  /** Transfer to display */
  transfer: Transfer | null;
  /** Loading state */
  loading?: boolean;
  /** On send handler */
  onSend?: () => void;
  /** On receive handler */
  onReceive?: () => void;
  /** On cancel handler */
  onCancel?: () => void;
  /** Sending state */
  sending?: boolean;
  /** Receiving state */
  receiving?: boolean;
  /** Cancelling state */
  cancelling?: boolean;
}

/**
 * TransferDetail - Displays detailed information about a transfer
 * Security: All data is tenant-scoped from the API
 */
export function TransferDetail({
  transfer,
  loading = false,
  onSend,
  onReceive,
  onCancel,
  sending = false,
  receiving = false,
  cancelling = false,
}: TransferDetailProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="card" height={200} />
        <LoadingSkeleton variant="card" height={300} />
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">
          Select a transfer to view details
        </p>
      </div>
    );
  }

  const canSend = transfer.status === "DRAFT";
  const canReceive = ["SENT", "IN_TRANSIT", "PARTIAL_RECEIVED"].includes(transfer.status);
  const canCancel = transfer.status === "DRAFT";

  const lineColumns: Column<Transfer["lines"][0]>[] = [
    {
      key: "product",
      header: "Product",
      width: "minmax(200px, 1fr)",
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.product}</div>
          <div className="text-xs text-muted-foreground">SKU: {row.sku}</div>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Ordered",
      width: "6rem",
      align: "right",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">{row.qty}</div>
      ),
    },
    {
      key: "qty_sent",
      header: "Sent",
      width: "6rem",
      align: "right",
      cell: (row) => (
        <div className="text-sm text-muted-foreground">
          {row.qty_sent ?? "—"}
        </div>
      ),
    },
    {
      key: "qty_received",
      header: "Received",
      width: "6rem",
      align: "right",
      cell: (row) => (
        <div className="text-sm text-muted-foreground">
          {row.qty_received}
        </div>
      ),
    },
    {
      key: "qty_remaining",
      header: "Remaining",
      width: "6rem",
      align: "right",
      cell: (row) => (
        <div
          className={cn(
            "text-sm font-medium",
            row.qty_remaining > 0 ? "text-warning" : "text-success"
          )}
        >
          {row.qty_remaining}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-foreground">
                Transfer #{transfer.id}
              </h3>
              <TransferStatusBadge status={transfer.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(transfer.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Store Transfer */}
        <div className="flex items-center gap-4 py-4 border-t border-border">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">From Store</div>
            <div className="font-medium text-foreground">{transfer.from_store.name}</div>
            <div className="text-xs text-muted-foreground">{transfer.from_store.code}</div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">To Store</div>
            <div className="font-medium text-foreground">{transfer.to_store.name}</div>
            <div className="text-xs text-muted-foreground">{transfer.to_store.code}</div>
          </div>
        </div>

        {/* Notes */}
        {transfer.notes && (
          <div className="pt-4 border-t border-border">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="text-sm text-foreground">{transfer.notes}</div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4 border-t border-border">
          {canSend && onSend && (
            <button
              onClick={onSend}
              disabled={sending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? "Sending..." : "Send Transfer"}
            </button>
          )}
          {canReceive && onReceive && (
            <button
              onClick={onReceive}
              disabled={receiving}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {receiving ? "Receiving..." : "Receive Transfer"}
            </button>
          )}
          {canCancel && onCancel && (
            <button
              onClick={onCancel}
              disabled={cancelling}
              className="px-4 py-2 rounded-md border border-border bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cancelling ? "Cancelling..." : "Cancel Transfer"}
            </button>
          )}
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 bg-muted border-b border-border">
          <h4 className="text-sm font-medium text-foreground">Line Items</h4>
        </div>
        <DataTable
          data={transfer.lines}
          columns={lineColumns}
          emptyMessage="No line items"
        />
      </div>
    </div>
  );
}

