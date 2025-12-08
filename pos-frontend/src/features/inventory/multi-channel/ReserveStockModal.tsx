// pos-frontend/src/features/inventory/multi-channel/ReserveStockModal.tsx
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
import { ChannelReservePayload } from "../api/channels";
import { useChannelReserve } from "../hooks/useChannels";
import { useNotify } from "@/lib/notify";
import { AvailabilityResponse } from "../api/channels";

export interface ReserveStockModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Availability data */
  availability: AvailabilityResponse | null;
  /** Channel name */
  channel: string;
  /** On success callback */
  onSuccess?: () => void;
}

/**
 * ReserveStockModal - Reserve stock for a channel
 * Security: All operations are tenant-scoped via API, channel validated, rate limited
 */
export function ReserveStockModal({
  open,
  onClose,
  availability,
  channel,
  onSuccess,
}: ReserveStockModalProps) {
  const notify = useNotify();
  const reserveMutation = useChannelReserve();

  const [formData, setFormData] = useState<Partial<ChannelReservePayload>>({
    quantity: 1,
    ref_type: "POS_CART",
    ref_id: null,
    note: "",
    expires_at: null,
  });

  // Reset form when modal opens/closes or availability changes
  useEffect(() => {
    if (open && availability) {
      setFormData({
        quantity: 1,
        ref_type: channel === "POS" ? "POS_CART" : channel === "WEB" ? "WEB_ORDER" : "MARKETPLACE_ORDER",
        ref_id: null,
        note: "",
        expires_at: null,
      });
    }
  }, [open, availability, channel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!availability) {
      notify.error("Availability data is required");
      return;
    }

    if (!formData.quantity || formData.quantity <= 0) {
      notify.error("Quantity must be greater than 0");
      return;
    }

    if (formData.quantity > availability.available) {
      notify.error(`Cannot reserve more than available (${availability.available})`);
      return;
    }

    if (!formData.ref_type) {
      notify.error("Reference type is required");
      return;
    }

    try {
      await reserveMutation.mutateAsync({
        store_id: availability.store_id,
        variant_id: availability.variant_id,
        quantity: formData.quantity!,
        ref_type: formData.ref_type,
        ref_id: formData.ref_id || null,
        channel: channel,
        note: formData.note || "",
        expires_at: formData.expires_at || null,
      });
      onSuccess?.();
      onClose();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleClose = () => {
    if (!reserveMutation.isPending) {
      onClose();
    }
  };

  const isLoading = reserveMutation.isPending;
  const maxQuantity = availability?.available || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reserve Stock for {channel}</DialogTitle>
          <DialogDescription>
            Reserve stock for {channel} channel. Available: {maxQuantity} units
          </DialogDescription>
        </DialogHeader>

        {availability && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Product Info */}
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <div className="text-sm font-medium text-foreground">{availability.product_name}</div>
              <div className="text-xs text-muted-foreground">SKU: {availability.sku}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Store: {availability.store_id}
              </div>
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
                max={maxQuantity}
                value={formData.quantity || ""}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 1 })
                }
                disabled={isLoading}
                required
              />
              <p className="text-xs text-muted-foreground">
                Maximum: {maxQuantity} units available
              </p>
            </div>

            {/* Reference Type */}
            <div className="space-y-2">
              <Label htmlFor="ref_type">
                Reference Type <span className="text-destructive">*</span>
              </Label>
              <select
                id="ref_type"
                value={formData.ref_type || ""}
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
                value={formData.note || ""}
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
              <Button type="submit" disabled={isLoading || maxQuantity <= 0}>
                {isLoading ? "Reserving..." : "Reserve Stock"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

