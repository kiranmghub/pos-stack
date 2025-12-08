// pos-frontend/src/features/inventory/planning/reorder/CreatePOFromSuggestions.tsx
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
import { ReorderSuggestion } from "../../api/reorderSuggestions";
import { VendorSelector } from "../../operations/purchase-orders/VendorSelector";
import { useCreatePurchaseOrder } from "../../hooks/usePurchaseOrders";
import { type StoreOption } from "../../components/StoreFilter";
import { useNotify } from "@/lib/notify";
import { Package, X } from "lucide-react";

export interface CreatePOFromSuggestionsProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Selected suggestions */
  suggestions: ReorderSuggestion[];
  /** Available stores */
  stores: StoreOption[];
  /** On success callback */
  onSuccess?: () => void;
}

/**
 * CreatePOFromSuggestions - Modal for creating PO from selected reorder suggestions
 * Security: All operations are tenant-scoped via API
 */
export function CreatePOFromSuggestions({
  open,
  onClose,
  suggestions,
  stores,
  onSuccess,
}: CreatePOFromSuggestionsProps) {
  const notify = useNotify();
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const createPOMutation = useCreatePurchaseOrder();

  // Initialize quantities with suggested quantities
  React.useEffect(() => {
    if (open && suggestions.length > 0) {
      const initial: Record<number, number> = {};
      suggestions.forEach((suggestion) => {
        initial[suggestion.variant_id] = suggestion.suggested_qty;
      });
      setQuantities(initial);
    } else {
      setQuantities({});
    }
  }, [open, suggestions]);

  // Group suggestions by store
  const suggestionsByStore = React.useMemo(() => {
    const grouped: Record<number, ReorderSuggestion[]> = {};
    suggestions.forEach((suggestion) => {
      if (!grouped[suggestion.store_id]) {
        grouped[suggestion.store_id] = [];
      }
      grouped[suggestion.store_id].push(suggestion);
    });
    return grouped;
  }, [suggestions]);

  const handleQtyChange = (variantId: number, qty: number) => {
    setQuantities({ ...quantities, [variantId]: Math.max(1, qty) });
  };

  const handleSubmit = async () => {
    if (!vendorId) {
      notify.error("Please select a vendor");
      return;
    }

    if (suggestions.length === 0) {
      notify.error("No suggestions selected");
      return;
    }

    // Group by store and create POs
    const storeGroups = Object.entries(suggestionsByStore);
    
    try {
      // Create a PO for each store
      for (const [storeIdStr, storeSuggestions] of storeGroups) {
        const storeId = parseInt(storeIdStr, 10);
        const lines = storeSuggestions
          .filter((s) => quantities[s.variant_id] > 0)
          .map((suggestion) => ({
            variant_id: suggestion.variant_id,
            qty_ordered: quantities[suggestion.variant_id],
            unit_cost: "0", // Default cost, user can update later
          }));

        if (lines.length > 0) {
          await createPOMutation.mutateAsync({
            store_id: storeId,
            vendor_id: vendorId,
            notes: notes.trim() || undefined,
            lines,
          });
        }
      }

      notify.success("Purchase order(s) created successfully");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      notify.error(err.message || "Failed to create purchase order");
    }
  };

  const handleClose = () => {
    if (!createPOMutation.isPending) {
      setVendorId(null);
      setNotes("");
      setQuantities({});
      onClose();
    }
  };

  const totalItems = suggestions.length;
  const totalQty = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order from Suggestions</DialogTitle>
          <DialogDescription>
            Review and adjust quantities, then create purchase order(s) for selected items.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vendor Selection */}
          <VendorSelector
            value={vendorId}
            onChange={setVendorId}
            disabled={createPOMutation.isPending}
            required
          />

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={createPOMutation.isPending}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Add any notes about this purchase order..."
            />
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Items:</span>
              <span className="font-semibold text-foreground">{totalItems}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Total Quantity:</span>
              <span className="font-semibold text-foreground">{totalQty}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {Object.keys(suggestionsByStore).length > 1
                ? `Items will be split into ${Object.keys(suggestionsByStore).length} purchase orders (one per store)`
                : "All items will be in a single purchase order"}
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-2">
            <Label>Items ({suggestions.length})</Label>
            <div className="space-y-2 max-h-96 overflow-y-auto rounded-lg border border-border bg-card p-2">
              {Object.entries(suggestionsByStore).map(([storeIdStr, storeSuggestions]) => {
                const store = stores.find((s) => s.id === parseInt(storeIdStr, 10));
                return (
                  <div key={storeIdStr} className="space-y-2">
                    {Object.keys(suggestionsByStore).length > 1 && (
                      <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                        Store: {store?.name || storeIdStr}
                      </div>
                    )}
                    {storeSuggestions.map((suggestion) => (
                      <div
                        key={suggestion.variant_id}
                        className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {suggestion.product_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            SKU: {suggestion.sku || "N/A"} • Current: {suggestion.on_hand} • Reorder Point: {suggestion.threshold}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`qty-${suggestion.variant_id}`} className="text-xs whitespace-nowrap">
                            Qty:
                          </Label>
                          <Input
                            id={`qty-${suggestion.variant_id}`}
                            type="number"
                            min="1"
                            value={quantities[suggestion.variant_id] || 0}
                            onChange={(e) =>
                              handleQtyChange(
                                suggestion.variant_id,
                                parseInt(e.target.value, 10) || 1
                              )
                            }
                            disabled={createPOMutation.isPending}
                            className="w-20"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={createPOMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createPOMutation.isPending || !vendorId || suggestions.length === 0}
          >
            <Package className="h-4 w-4 mr-2" />
            {createPOMutation.isPending
              ? "Creating..."
              : `Create PO${Object.keys(suggestionsByStore).length > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

