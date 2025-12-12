// pos-frontend/src/features/inventory/vendors/VendorModal.tsx
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
import { Vendor, CreateVendorPayload } from "../api/vendors";
import { useCreateVendor, useUpdateVendor } from "../hooks/useVendors";
import { useNotify } from "@/lib/notify";

export interface VendorModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Existing vendor (for edit mode) */
  vendor?: Vendor | null;
  /** On success callback */
  onSuccess?: () => void;
}

/**
 * VendorModal - Create/edit vendor modal
 * Security: All operations are tenant-scoped via API
 */
export function VendorModal({
  open,
  onClose,
  vendor,
  onSuccess,
}: VendorModalProps) {
  const notify = useNotify();
  const createVendorMutation = useCreateVendor();
  const updateVendorMutation = useUpdateVendor();

  const [formData, setFormData] = useState<CreateVendorPayload>({
    name: "",
    code: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    lead_time_days: null,
    safety_stock_days: null,
    is_active: true,
  });

  // Reset form when modal opens/closes or vendor changes
  useEffect(() => {
    if (open) {
      if (vendor) {
        setFormData({
          name: vendor.name || "",
          code: vendor.code || "",
          contact_name: vendor.contact_name || "",
          email: vendor.email || "",
          phone: vendor.phone || "",
          address: vendor.address || "",
          notes: vendor.notes || "",
          lead_time_days: vendor.lead_time_days ?? null,
          safety_stock_days: vendor.safety_stock_days ?? null,
          is_active: vendor.is_active ?? true,
        });
      } else {
        setFormData({
          name: "",
          code: "",
          contact_name: "",
          email: "",
          phone: "",
          address: "",
          notes: "",
          lead_time_days: null,
          safety_stock_days: null,
          is_active: true,
        });
      }
    }
  }, [open, vendor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      notify.error("Vendor name is required");
      return;
    }

    try {
      if (vendor) {
        await updateVendorMutation.mutateAsync({
          id: vendor.id,
          payload: formData,
        });
      } else {
        await createVendorMutation.mutateAsync(formData);
      }
      onSuccess?.();
      onClose();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleClose = () => {
    if (!createVendorMutation.isPending && !updateVendorMutation.isPending) {
      onClose();
    }
  };

  const isLoading = createVendorMutation.isPending || updateVendorMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit Vendor" : "Create Vendor"}</DialogTitle>
          <DialogDescription>
            {vendor
              ? "Update vendor information"
              : "Add a new vendor to your system"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name (Required) */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isLoading}
              required
              placeholder="Vendor name"
            />
          </div>

          {/* Code */}
          <div className="space-y-2">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              disabled={isLoading}
              placeholder="Vendor code"
            />
          </div>

          {/* Contact Name */}
          <div className="space-y-2">
            <Label htmlFor="contact_name">Contact Name</Label>
            <Input
              id="contact_name"
              value={formData.contact_name}
              onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              disabled={isLoading}
              placeholder="Contact person name"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={isLoading}
              placeholder="vendor@example.com"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              disabled={isLoading}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              disabled={isLoading}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Vendor address"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              disabled={isLoading}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Additional notes"
            />
          </div>

          {/* Lead Time Days */}
          <div className="space-y-2">
            <Label htmlFor="lead_time_days">Lead Time (days)</Label>
            <Input
              id="lead_time_days"
              type="number"
              min="0"
              value={formData.lead_time_days ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({
                  ...formData,
                  lead_time_days: value === "" ? null : parseInt(value, 10) || null,
                });
              }}
              disabled={isLoading}
              placeholder="Average lead time in days"
            />
            <p className="text-xs text-muted-foreground">
              Average number of days for orders from this vendor to arrive
            </p>
          </div>

          {/* Safety Stock Days */}
          <div className="space-y-2">
            <Label htmlFor="safety_stock_days">Safety Stock (days)</Label>
            <Input
              id="safety_stock_days"
              type="number"
              min="0"
              value={formData.safety_stock_days ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({
                  ...formData,
                  safety_stock_days: value === "" ? null : parseInt(value, 10) || null,
                });
              }}
              disabled={isLoading}
              placeholder="Safety stock buffer in days"
            />
            <p className="text-xs text-muted-foreground">
              Safety stock buffer in days for reorder calculations
            </p>
          </div>

          {/* Is Active (only show in edit mode) */}
          {vendor && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                disabled={isLoading}
                className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
              />
              <Label htmlFor="is_active" className="text-sm font-normal">
                Active vendor
              </Label>
              <p className="text-xs text-muted-foreground">
                Inactive vendors are hidden from lists but can still be linked to existing purchase orders
              </p>
            </div>
          )}

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
              {isLoading ? "Saving..." : vendor ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

