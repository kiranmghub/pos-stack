// pos-frontend/src/features/inventory/operations/transfers/CreateTransferModal.tsx
import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Minus, Search, ArrowRight, Check, ChevronRight } from "lucide-react";
import { useCreateTransfer } from "../../hooks/useTransfers";
import { type StoreOption } from "../../components/StoreFilter";
import { apiFetchJSON } from "@/lib/auth";
import { cn } from "@/lib/utils";

export interface VariantOption {
  id: number;
  sku: string;
  product_name: string;
  name?: string;
}

export interface CreateTransferModalProps {
  /** Open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Available stores */
  stores: StoreOption[];
  /** On success callback */
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3;

interface TransferLine {
  variant_id: number;
  variant: VariantOption;
  qty: number;
}

/**
 * CreateTransferModal - Multi-step wizard for creating transfers
 * Security: All operations are tenant-scoped via API
 */
export function CreateTransferModal({
  open,
  onClose,
  stores,
  onSuccess,
}: CreateTransferModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [fromStoreId, setFromStoreId] = useState<number | null>(null);
  const [toStoreId, setToStoreId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VariantOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [qtyInput, setQtyInput] = useState("");

  const createTransferMutation = useCreateTransfer();

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
    if (!selectedVariantId || !qtyInput) return;
    const qty = parseInt(qtyInput, 10);
    if (isNaN(qty) || qty <= 0) return;

    const variant = searchResults.find((v) => v.id === selectedVariantId);
    if (!variant) return;

    // Check if variant already in lines
    const existingIndex = lines.findIndex((l) => l.variant_id === selectedVariantId);
    if (existingIndex >= 0) {
      // Update quantity
      const newLines = [...lines];
      newLines[existingIndex].qty += qty;
      setLines(newLines);
    } else {
      // Add new line
      setLines([...lines, { variant_id: selectedVariantId, variant, qty }]);
    }

    setSelectedVariantId(null);
    setQtyInput("");
    setSearchQuery("");
  };

  const handleRemoveLine = (variantId: number) => {
    setLines(lines.filter((l) => l.variant_id !== variantId));
  };

  const handleUpdateQty = (variantId: number, delta: number) => {
    setLines(
      lines.map((l) =>
        l.variant_id === variantId ? { ...l, qty: Math.max(1, l.qty + delta) } : l
      )
    );
  };

  const handleNext = () => {
    if (step === 1) {
      if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) return;
      setStep(2);
    } else if (step === 2) {
      if (lines.length === 0) return;
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    if (!fromStoreId || !toStoreId || lines.length === 0) return;

    try {
      await createTransferMutation.mutateAsync({
        from_store_id: fromStoreId,
        to_store_id: toStoreId,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          variant_id: l.variant_id,
          qty: l.qty,
        })),
      });
      onSuccess?.();
      handleClose();
    } catch (err) {
      console.error("Failed to create transfer:", err);
    }
  };

  const handleClose = () => {
    setStep(1);
    setFromStoreId(null);
    setToStoreId(null);
    setNotes("");
    setSearchQuery("");
    setSearchResults([]);
    setLines([]);
    setSelectedVariantId(null);
    setQtyInput("");
    onClose();
  };

  const canProceedStep1 = fromStoreId && toStoreId && fromStoreId !== toStoreId;
  const canProceedStep2 = lines.length > 0;
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Transfer</DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className={cn("flex items-center gap-2", step >= 1 && "text-primary")}>
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium", step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {step > 1 ? <Check className="h-4 w-4" /> : "1"}
            </div>
            <span className="text-sm font-medium">Select Stores</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className={cn("flex items-center gap-2", step >= 2 && "text-primary")}>
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium", step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {step > 2 ? <Check className="h-4 w-4" /> : "2"}
            </div>
            <span className="text-sm font-medium">Add Items</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className={cn("flex items-center gap-2", step >= 3 && "text-primary")}>
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium", step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              3
            </div>
            <span className="text-sm font-medium">Review</span>
          </div>
        </div>

        {/* Step 1: Select Stores */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  From Store *
                </label>
                <select
                  value={fromStoreId || ""}
                  onChange={(e) => setFromStoreId(Number(e.target.value) || null)}
                  className="w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">Select store...</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} {store.code ? `(${store.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  To Store *
                </label>
                <select
                  value={toStoreId || ""}
                  onChange={(e) => setToStoreId(Number(e.target.value) || null)}
                  className="w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">Select store...</option>
                  {stores
                    .filter((s) => s.id !== fromStoreId)
                    .map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} {store.code ? `(${store.code})` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {fromStoreId && toStoreId && fromStoreId === toStoreId && (
              <div className="text-sm text-destructive">
                From store and to store must be different
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this transfer..."
                className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {/* Step 2: Add Items */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search products by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Search Results */}
            {searchLoading && (
              <div className="text-sm text-muted-foreground text-center py-4">
                Searching...
              </div>
            )}
            {!searchLoading && searchQuery && searchResults.length > 0 && (
              <div className="border border-border rounded-md max-h-48 overflow-y-auto">
                {searchResults.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => {
                      setSelectedVariantId(variant.id);
                      setQtyInput("1");
                    }}
                    className={cn(
                      "w-full px-4 py-2 text-left hover:bg-muted transition-colors border-b border-border last:border-b-0",
                      selectedVariantId === variant.id && "bg-accent"
                    )}
                  >
                    <div className="font-medium text-foreground">{variant.product_name}</div>
                    <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Add Selected Variant */}
            {selectedVariantId && (
              <div className="flex items-center gap-2 p-3 border border-border rounded-md bg-muted/50">
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {searchResults.find((v) => v.id === selectedVariantId)?.product_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    SKU: {searchResults.find((v) => v.id === selectedVariantId)?.sku}
                  </div>
                </div>
                <Input
                  type="number"
                  min="1"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  placeholder="Qty"
                  className="w-20"
                />
                <Button onClick={handleAddLine} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
            )}

            {/* Selected Lines */}
            {lines.length > 0 && (
              <div className="border border-border rounded-md">
                <div className="px-4 py-2 bg-muted border-b border-border text-sm font-medium">
                  Selected Items ({lines.length})
                </div>
                <div className="divide-y divide-border">
                  {lines.map((line) => (
                    <div key={line.variant_id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{line.variant.product_name}</div>
                        <div className="text-xs text-muted-foreground">SKU: {line.variant.sku}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(line.variant_id, -1)}
                          className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-12 text-center font-medium">{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(line.variant_id, 1)}
                          className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.variant_id)}
                          className="ml-2 w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-destructive/10 hover:border-destructive text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
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
            <div className="grid grid-cols-2 gap-4 p-4 border border-border rounded-md">
              <div>
                <div className="text-xs text-muted-foreground mb-1">From Store</div>
                <div className="font-medium text-foreground">
                  {stores.find((s) => s.id === fromStoreId)?.name}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">To Store</div>
                <div className="font-medium text-foreground">
                  {stores.find((s) => s.id === toStoreId)?.name}
                </div>
              </div>
            </div>
            {notes && (
              <div className="p-4 border border-border rounded-md">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="text-sm text-foreground">{notes}</div>
              </div>
            )}
            <div className="border border-border rounded-md">
              <div className="px-4 py-2 bg-muted border-b border-border text-sm font-medium">
                Items ({lines.length}) - Total Quantity: {totalQty}
              </div>
              <div className="divide-y divide-border">
                {lines.map((line) => (
                  <div key={line.variant_id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">{line.variant.product_name}</div>
                        <div className="text-xs text-muted-foreground">SKU: {line.variant.sku}</div>
                      </div>
                      <div className="font-medium text-foreground">Qty: {line.qty}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {step < 3 ? (
              <Button
                onClick={handleNext}
                disabled={
                  (step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)
                }
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={createTransferMutation.isPending}
              >
                {createTransferMutation.isPending ? "Creating..." : "Create Transfer"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

