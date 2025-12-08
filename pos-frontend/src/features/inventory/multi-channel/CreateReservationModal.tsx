// pos-frontend/src/features/inventory/multi-channel/CreateReservationModal.tsx
import React, { useState, useEffect } from "react";
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
import { CreateReservationPayload } from "../api/reservations";
import { useCreateReservation } from "../hooks/useReservations";
import { useNotify } from "@/lib/notify";
import { StoreOption } from "../components/StoreFilter";
import { apiFetchJSON } from "@/lib/auth";

export interface CreateReservationModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Available stores */
  stores: StoreOption[];
  /** On success callback */
  onSuccess?: () => void;
}

interface VariantOption {
  id: number;
  sku: string;
  product_name: string;
}

/**
 * CreateReservationModal - Create reservation modal
 * Security: All operations are tenant-scoped via API
 */
export function CreateReservationModal({
  open,
  onClose,
  stores,
  onSuccess,
}: CreateReservationModalProps) {
  const notify = useNotify();
  const createReservationMutation = useCreateReservation();

  const [formData, setFormData] = useState<CreateReservationPayload>({
    store_id: 0,
    variant_id: 0,
    quantity: 1,
    ref_type: "POS_CART",
    ref_id: null,
    channel: "POS",
    note: "",
    expires_at: null,
  });

  const [variantSearch, setVariantSearch] = useState("");
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [variantSearchLoading, setVariantSearchLoading] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<VariantOption | null>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setFormData({
        store_id: stores.length > 0 ? stores[0].id : 0,
        variant_id: 0,
        quantity: 1,
        ref_type: "POS_CART",
        ref_id: null,
        channel: "POS",
        note: "",
        expires_at: null,
      });
      setVariantSearch("");
      setVariantOptions([]);
      setSelectedVariant(null);
    }
  }, [open, stores]);

  // Search variants
  useEffect(() => {
    if (!variantSearch || variantSearch.length < 2) {
      setVariantOptions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setVariantSearchLoading(true);
      try {
        const response = await apiFetchJSON<any>(
          `/api/v1/catalog/variants?q=${encodeURIComponent(variantSearch)}&limit=20`
        );
        setVariantOptions(
          response.results?.map((v: any) => ({
            id: v.id,
            sku: v.sku || "",
            product_name: v.product?.name || v.name || "",
          })) || []
        );
      } catch (error) {
        console.error("Failed to search variants:", error);
        setVariantOptions([]);
      } finally {
        setVariantSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [variantSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.store_id) {
      notify.error("Please select a store");
      return;
    }
    if (!formData.variant_id) {
      notify.error("Please select a variant");
      return;
    }
    if (formData.quantity <= 0) {
      notify.error("Quantity must be greater than 0");
      return;
    }
    if (!formData.ref_type) {
      notify.error("Reference type is required");
      return;
    }

    try {
      await createReservationMutation.mutateAsync(formData);
      onSuccess?.();
      onClose();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleClose = () => {
    if (!createReservationMutation.isPending) {
      onClose();
    }
  };

  const isLoading = createReservationMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Reservation</DialogTitle>
          <DialogDescription>
            Reserve stock for a specific channel without affecting on-hand inventory
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Store */}
          <div className="space-y-2">
            <Label htmlFor="store_id">
              Store <span className="text-destructive">*</span>
            </Label>
            <select
              id="store_id"
              value={formData.store_id}
              onChange={(e) => setFormData({ ...formData, store_id: parseInt(e.target.value, 10) })}
              disabled={isLoading}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={0}>Select a store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          {/* Variant Search */}
          <div className="space-y-2">
            <Label htmlFor="variant_search">
              Product/Variant <span className="text-destructive">*</span>
            </Label>
            <Input
              id="variant_search"
              value={variantSearch}
              onChange={(e) => setVariantSearch(e.target.value)}
              disabled={isLoading}
              placeholder="Search by product name or SKU..."
            />
            {variantSearchLoading && (
              <p className="text-xs text-muted-foreground">Searching...</p>
            )}
            {variantOptions.length > 0 && (
              <div className="border border-border rounded-md max-h-48 overflow-y-auto">
                {variantOptions.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => {
                      setSelectedVariant(variant);
                      setFormData({ ...formData, variant_id: variant.id });
                      setVariantSearch(variant.product_name);
                      setVariantOptions([]);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border last:border-b-0"
                  >
                    <div className="font-medium text-foreground">{variant.product_name}</div>
                    <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                  </button>
                ))}
              </div>
            )}
            {selectedVariant && (
              <div className="text-sm text-foreground">
                Selected: <span className="font-medium">{selectedVariant.product_name}</span> (SKU:{" "}
                {selectedVariant.sku})
              </div>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">
              Quantity <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 1 })
              }
              disabled={isLoading}
              required
            />
          </div>

          {/* Reference Type */}
          <div className="space-y-2">
            <Label htmlFor="ref_type">
              Reference Type <span className="text-destructive">*</span>
            </Label>
            <select
              id="ref_type"
              value={formData.ref_type}
              onChange={(e) => setFormData({ ...formData, ref_type: e.target.value })}
              disabled={isLoading}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="POS_CART">POS Cart</option>
              <option value="WEB_ORDER">Web Order</option>
              <option value="MARKETPLACE_ORDER">Marketplace Order</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Reference ID */}
          <div className="space-y-2">
            <Label htmlFor="ref_id">Reference ID (Optional)</Label>
            <Input
              id="ref_id"
              type="number"
              value={formData.ref_id || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  ref_id: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              disabled={isLoading}
              placeholder="e.g., Cart ID, Order ID"
            />
          </div>

          {/* Channel */}
          <div className="space-y-2">
            <Label htmlFor="channel">Channel</Label>
            <select
              id="channel"
              value={formData.channel}
              onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
              disabled={isLoading}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="POS">POS</option>
              <option value="WEB">Web</option>
              <option value="MARKETPLACE">Marketplace</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Expires At */}
          <div className="space-y-2">
            <Label htmlFor="expires_at">Expires At (Optional)</Label>
            <Input
              id="expires_at"
              type="datetime-local"
              value={
                formData.expires_at
                  ? new Date(formData.expires_at).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                setFormData({
                  ...formData,
                  expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              disabled={isLoading}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="note">Notes (Optional)</Label>
            <textarea
              id="note"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              disabled={isLoading}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Additional notes about this reservation"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Reservation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

