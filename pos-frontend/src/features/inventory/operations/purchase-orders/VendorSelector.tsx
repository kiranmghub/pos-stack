// pos-frontend/src/features/inventory/operations/purchase-orders/VendorSelector.tsx
import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Building2 } from "lucide-react";
import { useVendorsList, useCreateVendor } from "../../hooks/usePurchaseOrders";
import { Vendor } from "../../api/purchaseOrders";
import { useNotify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export interface VendorSelectorProps {
  /** Selected vendor ID */
  value: number | null;
  /** On vendor change handler */
  onChange: (vendorId: number | null) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
}

/**
 * VendorSelector - Component for selecting or creating vendors
 * Security: All operations are tenant-scoped via API
 */
export function VendorSelector({
  value,
  onChange,
  disabled = false,
  required = false,
}: VendorSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorCode, setNewVendorCode] = useState("");

  const notify = useNotify();
  const { data: vendorsData, isLoading: vendorsLoading } = useVendorsList({
    q: searchQuery || undefined,
    page_size: 20,
  });
  const createVendorMutation = useCreateVendor();

  const selectedVendor = vendorsData?.results.find((v) => v.id === value) || null;

  const handleCreateVendor = async () => {
    if (!newVendorName.trim()) {
      notify.error("Vendor name is required");
      return;
    }

    try {
      const result = await createVendorMutation.mutateAsync({
        name: newVendorName.trim(),
        code: newVendorCode.trim() || undefined,
      });
      notify.success("Vendor created successfully");
      setNewVendorName("");
      setNewVendorCode("");
      setShowCreateForm(false);
      onChange(result.id);
    } catch (err: any) {
      notify.error(err.message || "Failed to create vendor");
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">
        Vendor {required && <span className="text-destructive">*</span>}
      </label>

      {!showCreateForm ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={disabled}
              className="pl-9"
            />
          </div>

          {selectedVendor && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{selectedVendor.name}</div>
                {selectedVendor.code && (
                  <div className="text-xs text-muted-foreground">{selectedVendor.code}</div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                disabled={disabled}
              >
                Clear
              </Button>
            </div>
          )}

          {vendorsLoading ? (
            <div className="text-sm text-muted-foreground">Loading vendors...</div>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
              {vendorsData?.results && vendorsData.results.length > 0 ? (
                <div className="divide-y divide-border">
                  {vendorsData.results.map((vendor) => (
                    <button
                      key={vendor.id}
                      type="button"
                      onClick={() => onChange(vendor.id)}
                      disabled={disabled}
                      className={cn(
                        "w-full px-3 py-2 text-left hover:bg-accent transition-colors",
                        value === vendor.id && "bg-accent/50"
                      )}
                    >
                      <div className="text-sm font-medium text-foreground">{vendor.name}</div>
                      {vendor.code && (
                        <div className="text-xs text-muted-foreground">{vendor.code}</div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {searchQuery ? "No vendors found" : "No vendors available"}
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm(true)}
            disabled={disabled}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Vendor
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <Input
            type="text"
            placeholder="Vendor name *"
            value={newVendorName}
            onChange={(e) => setNewVendorName(e.target.value)}
            disabled={disabled || createVendorMutation.isPending}
            required
          />
          <Input
            type="text"
            placeholder="Vendor code (optional)"
            value={newVendorCode}
            onChange={(e) => setNewVendorCode(e.target.value)}
            disabled={disabled || createVendorMutation.isPending}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleCreateVendor}
              disabled={disabled || createVendorMutation.isPending || !newVendorName.trim()}
              size="sm"
            >
              {createVendorMutation.isPending ? "Creating..." : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateForm(false);
                setNewVendorName("");
                setNewVendorCode("");
              }}
              disabled={disabled || createVendorMutation.isPending}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

