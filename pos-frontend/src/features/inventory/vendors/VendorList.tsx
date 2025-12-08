// pos-frontend/src/features/inventory/vendors/VendorList.tsx
import React from "react";
import { Vendor } from "../api/vendors";
import { DataTable } from "../components/DataTable";
import { Button } from "@/components/ui/button";
import { ExternalLink, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VendorListProps {
  /** Vendors list */
  vendors: Vendor[];
  /** Selected vendor ID */
  selectedVendorId?: number | null;
  /** On vendor click handler */
  onVendorClick?: (vendor: Vendor) => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * VendorList - Table component for displaying vendors
 * Security: All data is tenant-scoped from the API
 */
export function VendorList({
  vendors,
  selectedVendorId,
  onVendorClick,
  isLoading = false,
}: VendorListProps) {
  const columns = [
    {
      key: "name",
      header: "Vendor",
      render: (vendor: Vendor) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium text-foreground">{vendor.name}</div>
            {vendor.code && (
              <div className="text-xs text-muted-foreground">Code: {vendor.code}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (vendor: Vendor) => (
        <div>
          {vendor.contact_name && (
            <div className="text-sm text-foreground">{vendor.contact_name}</div>
          )}
          {vendor.email && (
            <div className="text-xs text-muted-foreground">{vendor.email}</div>
          )}
          {vendor.phone && (
            <div className="text-xs text-muted-foreground">{vendor.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (vendor: Vendor) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onVendorClick?.(vendor)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Details
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <DataTable
        columns={columns}
        data={vendors}
        emptyMessage="No vendors found"
        isLoading={isLoading}
        onRowClick={onVendorClick}
        getRowClassName={(vendor) =>
          cn(
            "cursor-pointer hover:bg-accent/50",
            selectedVendorId === vendor.id && "bg-accent"
          )
        }
      />
    </div>
  );
}

