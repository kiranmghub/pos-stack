// pos-frontend/src/features/inventory/operations/adjustments/AdjustmentModal.tsx
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdjustmentReasons, useCreateAdjustment } from "../../hooks/useAdjustments";
import { useNotify } from "@/lib/notify";
import { LoadingSkeleton } from "../../components";
import { Plus, Minus, Search } from "lucide-react";
import { apiFetchJSON } from "@/lib/auth";
import { cn } from "@/lib/utils";

export interface VariantOption {
  id: number;
  sku: string;
  product_name: string;
  name?: string;
}

export interface AdjustmentModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Variant ID to adjust (optional - if not provided, user can search) */
  variantId?: number | null;
  /** Variant name */
  variantName?: string;
  /** Variant SKU */
  variantSku?: string | null;
  /** Current quantity */
  currentQty?: number;
  /** Store ID (required) */
  storeId: number;
  /** On success callback */
  onSuccess?: () => void;
}

/**
 * AdjustmentModal - Modal for single-item inventory adjustment
 * Security: All operations are tenant-scoped via API
 */
export function AdjustmentModal({
  open,
  onClose,
  variantId,
  variantName,
  variantSku,
  currentQty = 0,
  storeId,
  onSuccess,
}: AdjustmentModalProps) {
  const notify = useNotify();
  const [delta, setDelta] = useState<number>(0);
  const [reasonCode, setReasonCode] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<VariantOption[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(variantId || null);
  const [selectedVariant, setSelectedVariant] = useState<VariantOption | null>(null);
  const [currentQtyState, setCurrentQtyState] = useState<number>(currentQty || 0);

  const { data: reasons, isLoading: reasonsLoading } = useAdjustmentReasons();
  const createMutation = useCreateAdjustment();

  // Search variants when search query changes
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("q", searchQuery.trim());
        params.append("limit", "20");
        const data = await apiFetchJSON(`/api/v1/catalog/variants?${params.toString()}`) as any;
        const results = Array.isArray(data) ? data : data.results || [];
        setSearchResults(results.map((v: any) => ({
          id: v.id,
          sku: v.sku || "",
          product_name: v.product_name || v.name || "",
          name: v.name,
        })));
      } catch (err) {
        console.error("Failed to search variants:", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Update selected variant when variantId prop changes
  React.useEffect(() => {
    if (variantId) {
      setSelectedVariantId(variantId);
      if (variantName) {
        setSelectedVariant({
          id: variantId,
          sku: variantSku || "",
          product_name: variantName,
        });
      }
      setCurrentQtyState(currentQty || 0);
    } else {
      setSelectedVariantId(null);
      setSelectedVariant(null);
      setCurrentQtyState(0);
    }
  }, [variantId, variantName, variantSku, currentQty]);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (open) {
      setDelta(0);
      setReasonCode("");
      setNote("");
      setSearchQuery("");
      setSearchResults([]);
      if (!variantId) {
        setSelectedVariantId(null);
        setSelectedVariant(null);
        setCurrentQtyState(0);
      }
    }
  }, [open, variantId]);

  const handleVariantSelect = (variant: VariantOption) => {
    setSelectedVariantId(variant.id);
    setSelectedVariant(variant);
    setSearchQuery("");
    setSearchResults([]);
    // TODO: Fetch current quantity for this variant at this store
    // For now, we'll just set it to 0
    setCurrentQtyState(0);
  };

  const handleDeltaChange = (value: number) => {
    setDelta(value);
  };

  const handleSubmit = async () => {
    if (!selectedVariantId) {
      notify.error("Please select a variant");
      return;
    }

    if (!reasonCode) {
      notify.error("Please select a reason");
      return;
    }

    if (delta === 0) {
      notify.error("Adjustment quantity cannot be zero");
      return;
    }

    try {
      await createMutation.mutateAsync({
        store_id: storeId,
        reason_code: reasonCode,
        note: note.trim() || undefined,
        lines: [
          {
            variant_id: selectedVariantId,
            delta: delta,
          },
        ],
      });
      notify.success("Adjustment created successfully");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      notify.error(err.message || "Failed to create adjustment");
    }
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      setDelta(0);
      setReasonCode("");
      setNote("");
      setSearchQuery("");
      setSearchResults([]);
      if (!variantId) {
        setSelectedVariantId(null);
        setSelectedVariant(null);
        setCurrentQtyState(0);
      }
      onClose();
    }
  };

  const newQty = currentQtyState + delta;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adjust Inventory</DialogTitle>
          <DialogDescription>
            Adjust the quantity for this item. Use positive values to increase, negative to decrease.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Variant Selection (if not pre-selected) */}
          {!variantId && (
            <div className="space-y-2">
              <Label htmlFor="variant-search">Product *</Label>
              {selectedVariant ? (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {selectedVariant.product_name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        SKU: {selectedVariant.sku}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Current Quantity:{" "}
                        <span className="font-medium text-foreground">{currentQtyState}</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedVariant(null);
                        setSelectedVariantId(null);
                        setCurrentQtyState(0);
                      }}
                      disabled={createMutation.isPending}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="variant-search"
                      type="text"
                      placeholder="Search by SKU or product name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={createMutation.isPending}
                      className="pl-9"
                    />
                  </div>
                  {searchQuery && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
                      {searchLoading ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          Searching...
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div className="divide-y divide-border">
                          {searchResults.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => handleVariantSelect(variant)}
                              disabled={createMutation.isPending}
                              className="w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                            >
                              <div className="text-sm font-medium text-foreground">
                                {variant.product_name}
                              </div>
                              <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No products found
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Variant Info (if pre-selected) */}
          {variantId && variantName && (
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-sm font-medium text-foreground">{variantName}</div>
              {variantSku && (
                <div className="text-xs text-muted-foreground mt-0.5">SKU: {variantSku}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                Current Quantity: <span className="font-medium text-foreground">{currentQty}</span>
              </div>
            </div>
          )}

          {/* Adjustment Quantity */}
          <div className="space-y-2">
            <Label htmlFor="delta">Adjustment Quantity *</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDeltaChange(delta - 1)}
                disabled={createMutation.isPending}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="delta"
                type="number"
                value={delta || ""}
                onChange={(e) => handleDeltaChange(parseInt(e.target.value, 10) || 0)}
                disabled={createMutation.isPending}
                className="flex-1 text-center"
                placeholder="0"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDeltaChange(delta + 1)}
                disabled={createMutation.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {delta !== 0 && (
              <div className="text-sm text-muted-foreground">
                New Quantity:{" "}
                <span
                  className={`font-semibold ${
                    newQty < 0
                      ? "text-badge-error-text"
                      : newQty < currentQty
                      ? "text-badge-warning-text"
                      : "text-badge-success-text"
                  }`}
                >
                  {newQty}
                </span>
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            {reasonsLoading ? (
              <LoadingSkeleton variant="rectangular" height={40} />
            ) : (
              <select
                id="reason"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                disabled={createMutation.isPending}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
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
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={createMutation.isPending}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Add any notes about this adjustment..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !selectedVariantId || !reasonCode || delta === 0}
          >
            {createMutation.isPending ? "Creating..." : "Create Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

