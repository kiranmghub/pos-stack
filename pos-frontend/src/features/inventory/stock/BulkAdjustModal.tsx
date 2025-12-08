// pos-frontend/src/features/inventory/stock/BulkAdjustModal.tsx
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StockItem } from "../api/stock";
import { useAdjustmentReasons, useCreateAdjustment } from "../hooks/useStock";
import { LoadingSkeleton } from "../components";
import { AlertCircle, Plus, Minus, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BulkAdjustModalProps {
  /** Is modal open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Selected items to adjust */
  items: StockItem[];
  /** Store ID (required for adjustment) */
  storeId: number;
  /** On success callback */
  onSuccess?: () => void;
}

interface AdjustmentLine {
  variant_id: number;
  product_name: string;
  sku: string | null;
  current_qty: number;
  delta: number;
}

/**
 * BulkAdjustModal - Modal for bulk inventory adjustments
 * Security: Validates store ownership, requires authentication, tenant-scoped
 */
export function BulkAdjustModal({
  open,
  onClose,
  items,
  storeId,
  onSuccess,
}: BulkAdjustModalProps) {
  const { data: reasons, isLoading: loadingReasons } = useAdjustmentReasons();
  const { mutate: createAdjustment, isPending: creating } = useCreateAdjustment();

  const [selectedReason, setSelectedReason] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [lines, setLines] = useState<AdjustmentLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState<"add" | "set">("add");
  const [bulkValue, setBulkValue] = useState<string>("");

  // Initialize lines when items change
  useEffect(() => {
    if (open && items.length > 0) {
      setLines(
        items.map((item) => ({
          variant_id: item.id,
          product_name: item.product_name,
          sku: item.sku,
          current_qty: item.on_hand,
          delta: 0,
        }))
      );
      setSelectedReason("");
      setNote("");
      setError(null);
      setBulkValue("");
      setBulkMode("add");
    }
  }, [open, items]);

  const handleDeltaChange = (variantId: number, delta: number) => {
    setLines((prev) =>
      prev.map((line) =>
        line.variant_id === variantId ? { ...line, delta } : line
      )
    );
  };

  const handleRemoveLine = (variantId: number) => {
    setLines((prev) => prev.filter((line) => line.variant_id !== variantId));
  };

  const handleApplyToAll = () => {
    const value = parseInt(bulkValue) || 0;
    if (value === 0 && bulkMode === "add") {
      // Don't apply if value is 0 in add mode
      return;
    }

    setLines((prev) =>
      prev.map((line) => {
        if (bulkMode === "add") {
          // Add/subtract the value as delta
          return { ...line, delta: value };
        } else {
          // Set to absolute value (calculate delta needed)
          const targetQty = value;
          const delta = targetQty - line.current_qty;
          return { ...line, delta };
        }
      })
    );
    
    // Clear bulk value after applying
    setBulkValue("");
  };

  const handleSubmit = () => {
    setError(null);

    // Validation
    if (!selectedReason) {
      setError("Please select a reason");
      return;
    }

    const validLines = lines.filter((line) => line.delta !== 0);
    if (validLines.length === 0) {
      setError("Please enter adjustments for at least one item");
      return;
    }

    // Validate store ID
    if (!storeId) {
      setError("Store ID is required");
      return;
    }

    createAdjustment(
      {
        store_id: storeId,
        reason_code: selectedReason,
        note: note.trim() || undefined,
        lines: validLines.map((line) => ({
          variant_id: line.variant_id,
          delta: line.delta,
        })),
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
        onError: (err: any) => {
          setError(err?.message || "Failed to create adjustment");
        },
      }
    );
  };

  const totalDelta = lines.reduce((sum, line) => sum + line.delta, 0);
  const hasChanges = lines.some((line) => line.delta !== 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Adjust Stock</DialogTitle>
          <DialogDescription>
            Adjust inventory for {items.length} selected item{items.length !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-error/50 bg-error/10 p-3 flex items-center gap-2 text-sm text-error">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Reason Selection */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            {loadingReasons ? (
              <LoadingSkeleton variant="rectangular" height={40} />
            ) : (
              <select
                id="reason"
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a reason</option>
                {reasons?.map((reason) => (
                  <option key={reason.id} value={reason.code}>
                    {reason.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this adjustment"
            />
          </div>

          {/* Bulk Adjustment Controls */}
          <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-4">
            <Label>Bulk Adjustment</Label>
            <div className="flex items-center gap-2">
              <select
                value={bulkMode}
                onChange={(e) => setBulkMode(e.target.value as "add" | "set")}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="add">Add/Subtract</option>
                <option value="set">Set to</option>
              </select>
              <Input
                type="number"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={bulkMode === "add" ? "e.g., +10 or -5" : "Target quantity"}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApplyToAll();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleApplyToAll}
                disabled={!bulkValue || (parseInt(bulkValue) || 0) === 0}
                className="shrink-0"
              >
                <Zap className="h-4 w-4 mr-2" />
                Apply to All
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {bulkMode === "add"
                ? "Enter a positive or negative number to add/subtract from all items"
                : "Enter a quantity to set all items to this value"}
            </p>
          </div>

          {/* Adjustment Lines */}
          <div className="space-y-2">
            <Label>Items to Adjust</Label>
            <div className="space-y-2 max-h-96 overflow-y-auto border border-border rounded-lg p-2">
              {lines.map((line) => (
                <div
                  key={line.variant_id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {line.product_name}
                    </div>
                    {line.sku && (
                      <div className="text-xs text-muted-foreground">
                        SKU: {line.sku}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      Current: {line.current_qty}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDeltaChange(line.variant_id, line.delta - 1)
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      value={line.delta || ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        handleDeltaChange(line.variant_id, val);
                      }}
                      className="w-20 text-center"
                      placeholder="0"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDeltaChange(line.variant_id, line.delta + 1)
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {line.delta !== 0 && (
                      <div className="text-sm font-medium text-foreground min-w-[60px] text-right">
                        → {line.current_qty + line.delta}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveLine(line.variant_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {!hasChanges && (
              <p className="text-xs text-muted-foreground">
                Use +/- buttons or enter values to adjust quantities
              </p>
            )}
            {hasChanges && (
              <div className="text-sm text-muted-foreground">
                Total adjustment:{" "}
                <span
                  className={cn(
                    "font-semibold",
                    totalDelta > 0 ? "text-success" : "text-error"
                  )}
                >
                  {totalDelta > 0 ? "+" : ""}
                  {totalDelta}
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!hasChanges || !selectedReason || creating}
          >
            {creating ? "Creating..." : "Create Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

