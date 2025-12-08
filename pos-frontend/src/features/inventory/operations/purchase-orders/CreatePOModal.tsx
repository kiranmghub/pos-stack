// pos-frontend/src/features/inventory/operations/purchase-orders/CreatePOModal.tsx
import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus, Minus, Search, ArrowRight, Check, ChevronRight } from "lucide-react";
import { useCreatePurchaseOrder } from "../../hooks/usePurchaseOrders";
import { type StoreOption } from "../../components/StoreFilter";
import { VendorSelector } from "./VendorSelector";
import { apiFetchJSON } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useNotify } from "@/lib/notify";

export interface VariantOption {
  id: number;
  sku: string;
  product_name: string;
  name?: string;
}

export interface CreatePOModalProps {
  /** Open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Available stores */
  stores: StoreOption[];
  /** Default store ID */
  defaultStoreId?: number | null;
  /** On success callback */
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3;

interface POLine {
  variant_id: number;
  variant: VariantOption;
  qty_ordered: number;
  unit_cost: string;
  notes?: string;
}

/**
 * CreatePOModal - Multi-step wizard for creating purchase orders
 * Security: All operations are tenant-scoped via API
 */
export function CreatePOModal({
  open,
  onClose,
  stores,
  defaultStoreId,
  onSuccess,
}: CreatePOModalProps) {
  const notify = useNotify();
  const [step, setStep] = useState<Step>(1);
  const [storeId, setStoreId] = useState<number | null>(defaultStoreId || null);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VariantOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [lines, setLines] = useState<POLine[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [lineNotes, setLineNotes] = useState("");

  const createPOMutation = useCreatePurchaseOrder();

  // Search variants
  useEffect(() => {
    if (!searchQuery.trim() || step !== 2) {
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
  }, [searchQuery, step]);

  const handleAddLine = () => {
    if (!selectedVariantId || !qtyInput || !costInput) return;
    const qty = parseInt(qtyInput, 10);
    const cost = parseFloat(costInput);
    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) return;

    const variant = searchResults.find((v) => v.id === selectedVariantId);
    if (!variant) return;

    // Check if variant already exists in lines
    const existingIndex = lines.findIndex((l) => l.variant_id === selectedVariantId);
    if (existingIndex >= 0) {
      // Update existing line
      const updated = [...lines];
      updated[existingIndex] = {
        ...updated[existingIndex],
        qty_ordered: updated[existingIndex].qty_ordered + qty,
        unit_cost: cost.toString(),
        notes: lineNotes.trim() || undefined,
      };
      setLines(updated);
    } else {
      // Add new line
      setLines([
        ...lines,
        {
          variant_id: selectedVariantId,
          variant,
          qty_ordered: qty,
          unit_cost: cost.toString(),
          notes: lineNotes.trim() || undefined,
        },
      ]);
    }

    // Reset inputs
    setSelectedVariantId(null);
    setQtyInput("");
    setCostInput("");
    setLineNotes("");
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleUpdateLineQty = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    const updated = [...lines];
    updated[index].qty_ordered = newQty;
    setLines(updated);
  };

  const handleUpdateLineCost = (index: number, newCost: string) => {
    const cost = parseFloat(newCost);
    if (isNaN(cost) || cost < 0) return;
    const updated = [...lines];
    updated[index].unit_cost = cost.toString();
    setLines(updated);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!storeId) {
        notify.error("Please select a store");
        return;
      }
      if (!vendorId) {
        notify.error("Please select a vendor");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (lines.length === 0) {
        notify.error("Please add at least one line item");
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const handleSubmit = async () => {
    if (!storeId || !vendorId || lines.length === 0) {
      notify.error("Please complete all required fields");
      return;
    }

    try {
      await createPOMutation.mutateAsync({
        store_id: storeId,
        vendor_id: vendorId,
        notes: notes.trim() || undefined,
        lines: lines.map((line) => ({
          variant_id: line.variant_id,
          qty_ordered: line.qty_ordered,
          unit_cost: line.unit_cost,
          notes: line.notes,
        })),
      });
      notify.success("Purchase order created successfully");
      // Reset form
      setStep(1);
      setStoreId(defaultStoreId || null);
      setVendorId(null);
      setNotes("");
      setLines([]);
      setSearchQuery("");
      setSearchResults([]);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      notify.error(err.message || "Failed to create purchase order");
    }
  };

  const handleClose = () => {
    if (!createPOMutation.isPending) {
      setStep(1);
      setStoreId(defaultStoreId || null);
      setVendorId(null);
      setNotes("");
      setLines([]);
      setSearchQuery("");
      setSearchResults([]);
      onClose();
    }
  };

  const totalCost = useMemo(() => {
    return lines.reduce((sum, line) => {
      return sum + parseFloat(line.unit_cost) * line.qty_ordered;
    }, 0);
  }, [lines]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div className="flex items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                    step >= s
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground text-muted-foreground"
                  )}
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </div>
                <span className="ml-2 text-sm font-medium">
                  {s === 1 ? "Store & Vendor" : s === 2 ? "Items" : "Review"}
                </span>
              </div>
              {s < 3 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground mx-2" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Store & Vendor */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store">Store *</Label>
              <select
                id="store"
                value={storeId || ""}
                onChange={(e) => setStoreId(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={createPOMutation.isPending}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="">Select a store</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.code})
                  </option>
                ))}
              </select>
            </div>

            <VendorSelector
              value={vendorId}
              onChange={setVendorId}
              disabled={createPOMutation.isPending}
              required
            />

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
          </div>
        )}

        {/* Step 2: Items */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search Products</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by SKU or product name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={createPOMutation.isPending}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Search Results */}
            {searchQuery && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
                {searchLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
                ) : searchResults.length > 0 ? (
                  <div className="divide-y divide-border">
                    {searchResults.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setSelectedVariantId(variant.id)}
                        disabled={createPOMutation.isPending}
                        className={cn(
                          "w-full px-3 py-2 text-left hover:bg-accent transition-colors",
                          selectedVariantId === variant.id && "bg-accent/50"
                        )}
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

            {/* Add Line Form */}
            {selectedVariantId && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="font-medium text-foreground">
                  {searchResults.find((v) => v.id === selectedVariantId)?.product_name}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="qty">Quantity *</Label>
                    <Input
                      id="qty"
                      type="number"
                      min="1"
                      value={qtyInput}
                      onChange={(e) => setQtyInput(e.target.value)}
                      disabled={createPOMutation.isPending}
                      placeholder="Qty"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cost">Unit Cost *</Label>
                    <Input
                      id="cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={costInput}
                      onChange={(e) => setCostInput(e.target.value)}
                      disabled={createPOMutation.isPending}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={handleAddLine}
                      disabled={createPOMutation.isPending || !qtyInput || !costInput}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="line-notes">Line Notes (optional)</Label>
                  <Input
                    id="line-notes"
                    type="text"
                    value={lineNotes}
                    onChange={(e) => setLineNotes(e.target.value)}
                    disabled={createPOMutation.isPending}
                    placeholder="Optional notes for this line"
                  />
                </div>
              </div>
            )}

            {/* Lines List */}
            {lines.length > 0 && (
              <div className="space-y-2">
                <Label>Line Items ({lines.length})</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-2">
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {line.variant.product_name}
                        </div>
                        <div className="text-xs text-muted-foreground">SKU: {line.variant.sku}</div>
                      </div>
                      <Input
                        type="number"
                        min="1"
                        value={line.qty_ordered}
                        onChange={(e) =>
                          handleUpdateLineQty(index, parseInt(e.target.value, 10) || 1)
                        }
                        disabled={createPOMutation.isPending}
                        className="w-20"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_cost}
                        onChange={(e) => handleUpdateLineCost(index, e.target.value)}
                        disabled={createPOMutation.isPending}
                        className="w-24"
                      />
                      <div className="text-sm font-medium text-foreground w-20 text-right">
                        ${(parseFloat(line.unit_cost) * line.qty_ordered).toFixed(2)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLine(index)}
                        disabled={createPOMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Store</div>
                <div className="text-sm font-medium text-foreground">
                  {stores.find((s) => s.id === storeId)?.name}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Vendor</div>
                <div className="text-sm font-medium text-foreground">
                  {vendorId ? "Selected" : "Not selected"}
                </div>
              </div>
              {notes && (
                <div>
                  <div className="text-xs text-muted-foreground">Notes</div>
                  <div className="text-sm text-foreground">{notes}</div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Line Items ({lines.length})</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-2">
                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-md border border-border bg-background p-2"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {line.variant.product_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        SKU: {line.variant.sku} • Qty: {line.qty_ordered} • Cost: $
                        {parseFloat(line.unit_cost).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      ${(parseFloat(line.unit_cost) * line.qty_ordered).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-foreground">Total Cost</span>
                <span className="text-lg font-semibold text-foreground">
                  ${totalCost.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={step === 1 ? handleClose : handleBack}
            disabled={createPOMutation.isPending}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={createPOMutation.isPending}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createPOMutation.isPending}
            >
              {createPOMutation.isPending ? "Creating..." : "Create Purchase Order"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

