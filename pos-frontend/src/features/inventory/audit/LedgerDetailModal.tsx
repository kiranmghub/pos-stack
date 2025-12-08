// pos-frontend/src/features/inventory/audit/LedgerDetailModal.tsx
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LedgerEntry } from "../api/ledger";
import { StatusBadge } from "../components/StatusBadge";
import { format } from "date-fns";
import { X, Package, Store, User, FileText, Hash, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

export interface LedgerDetailModalProps {
  /** Entry to display */
  entry: LedgerEntry | null;
  /** Open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
}

/**
 * LedgerDetailModal - Displays detailed information about a ledger entry
 * Security: All data is tenant-scoped from the API
 */
export function LedgerDetailModal({
  entry,
  open,
  onClose,
}: LedgerDetailModalProps) {
  if (!entry) return null;

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

  const isPositive = entry.qty_delta > 0;
  const isNegative = entry.qty_delta < 0;
  const isZero = entry.qty_delta === 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Ledger Entry Details</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Quantity Change - Prominent */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Quantity Change</div>
                <div className="flex items-center gap-2">
                  {isPositive && <ArrowUp className="h-5 w-5 text-success" />}
                  {isNegative && <ArrowDown className="h-5 w-5 text-destructive" />}
                  {isZero && <Minus className="h-5 w-5 text-muted-foreground" />}
                  <span
                    className={cn(
                      "text-3xl font-bold",
                      isPositive && "text-success",
                      isNegative && "text-destructive",
                      isZero && "text-muted-foreground"
                    )}
                  >
                    {isPositive ? "+" : ""}
                    {entry.qty_delta}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Balance After</div>
                <div className="text-2xl font-semibold text-foreground">
                  {entry.balance_after !== null ? entry.balance_after : "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Date & Time */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Date & Time</span>
              </div>
              <div className="text-sm font-medium text-foreground">
                {format(new Date(entry.created_at), "MMMM d, yyyy 'at' h:mm a")}
              </div>
            </div>

            {/* Type */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Type</span>
              </div>
              <StatusBadge
                status={formatRefType(entry.ref_type)}
                variant={getRefTypeVariant(entry.ref_type)}
                size="sm"
              />
            </div>

            {/* Store */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Store className="h-4 w-4" />
                <span>Store</span>
              </div>
              <div className="text-sm font-medium text-foreground">
                {entry.store_name || entry.store_code || `Store ${entry.store_id}`}
              </div>
              {entry.store_code && entry.store_name && (
                <div className="text-xs text-muted-foreground">{entry.store_code}</div>
              )}
            </div>

            {/* Product */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                <span>Product</span>
              </div>
              <div className="text-sm font-medium text-foreground">
                {entry.product_name || "N/A"}
              </div>
              {entry.sku && (
                <div className="text-xs text-muted-foreground">SKU: {entry.sku}</div>
              )}
            </div>

            {/* Reference ID */}
            {entry.ref_id && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="h-4 w-4" />
                  <span>Reference ID</span>
                </div>
                <div className="text-sm font-medium text-foreground">#{entry.ref_id}</div>
              </div>
            )}

            {/* Created By */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Created By</span>
              </div>
              <div className="text-sm font-medium text-foreground">
                {entry.created_by || "System"}
              </div>
            </div>
          </div>

          {/* Note */}
          {entry.note && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Note</div>
              <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground">
                {entry.note}
              </div>
            </div>
          )}

          {/* Entry ID */}
          <div className="pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Entry ID: {entry.id}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

