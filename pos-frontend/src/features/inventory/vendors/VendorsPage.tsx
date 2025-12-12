// pos-frontend/src/features/inventory/vendors/VendorsPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../components/FilterBar";
import { VendorList } from "./VendorList";
import { VendorDetail } from "./VendorDetail";
import { VendorModal } from "./VendorModal";
import {
  useVendorsList,
  useDeleteVendor,
} from "../hooks/useVendors";
import { Vendor } from "../api/vendors";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { LoadingSkeleton, EmptyState } from "../components";
import DeleteConfirmModal from "@/features/admin/components/DeleteConfirmModal";

export interface VendorsPageProps {
  /** Available stores (not used for vendors, but kept for consistency) */
  stores?: any[];
  /** Store ID filter (not used for vendors) */
  storeId?: number | null;
  /** On store change handler (not used for vendors) */
  onStoreChange?: (storeId: number | null) => void;
}

/**
 * VendorsPage - Main vendors management page
 * Security: All operations are tenant-scoped via API
 */
export function VendorsPage({}: VendorsPageProps) {
  const notify = useNotify();
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch vendors list
  const {
    data: vendorsData,
    isLoading: vendorsLoading,
    refetch: refetchVendors,
  } = useVendorsList({
    q: searchQuery || undefined,
    page,
    page_size: pageSize,
  });

  // Delete vendor mutation
  const deleteVendorMutation = useDeleteVendor();

  // Get selected vendor from list (no detail endpoint available)
  const selectedVendor = useMemo(() => {
    if (!selectedVendorId || !vendorsData?.results) return null;
    return vendorsData.results.find((v) => v.id === selectedVendorId) || null;
  }, [selectedVendorId, vendorsData]);


  const filteredVendors = useMemo(() => {
    if (!vendorsData?.results) return [];
    return vendorsData.results;
  }, [vendorsData]);

  const handleVendorClick = (vendor: Vendor) => {
    setSelectedVendorId(vendor.id);
  };

  const handleCreateSuccess = () => {
    refetchVendors();
    setShowCreateModal(false);
  };

  const handleEditSuccess = () => {
    refetchVendors();
    setEditingVendor(null);
    // Refresh selected vendor if it was the one being edited
    if (selectedVendorId && editingVendor?.id === selectedVendorId) {
      // The list will be refetched, so selectedVendor will update automatically
    }
  };

  const handleEdit = () => {
    if (selectedVendor) {
      setEditingVendor(selectedVendor);
    }
  };

  const handleDeleteClick = () => {
    if (selectedVendor) {
      setVendorToDelete(selectedVendor);
      setShowDeleteConfirm(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!vendorToDelete) return;

    try {
      await deleteVendorMutation.mutateAsync(vendorToDelete.id);
      setShowDeleteConfirm(false);
      setVendorToDelete(null);
      // Clear selection if deleted vendor was selected
      if (selectedVendorId === vendorToDelete.id) {
        setSelectedVendorId(null);
      }
      refetchVendors();
    } catch (error: any) {
      // Error is handled by mutation
      // Keep modal open on error so user can try again or cancel
    }
  };

  const activeFiltersCount = searchQuery ? 1 : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Vendors"
        subtitle="Manage vendors and view performance analytics"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchVendors()}
              disabled={vendorsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${vendorsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Vendor
            </Button>
          </>
        }
      />

      {/* Filter Bar */}
      <div className="mb-4">
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilterCount={activeFiltersCount}
          onClear={() => {
            setSearchQuery("");
          }}
        />
      </div>

      {/* Split View: List and Detail */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Vendor List */}
        <div className="flex flex-col min-h-0">
          <VendorList
            vendors={filteredVendors}
            selectedVendorId={selectedVendorId}
            onVendorClick={handleVendorClick}
            isLoading={vendorsLoading}
          />
          {/* Pagination */}
          {vendorsData && vendorsData.count > pageSize && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, vendorsData.count)} of{" "}
                {vendorsData.count} vendors
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * pageSize >= vendorsData.count}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Vendor Detail */}
        <div className="flex flex-col min-h-0 overflow-y-auto">
          <VendorDetail
            vendor={selectedVendor || null}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
            isLoading={false}
          />
        </div>
      </div>

      {/* Create Vendor Modal */}
      <VendorModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        vendor={null}
        onSuccess={handleCreateSuccess}
      />

      {/* Edit Vendor Modal */}
      <VendorModal
        open={!!editingVendor}
        onClose={() => setEditingVendor(null)}
        vendor={editingVendor}
        onSuccess={handleEditSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmModal
        open={showDeleteConfirm}
        title="Delete Vendor"
        message="Are you sure you want to delete this vendor? This action cannot be undone. If this vendor is linked to any purchase orders, you will need to remove those links first or deactivate the vendor instead."
        subject={vendorToDelete ? `${vendorToDelete.name}${vendorToDelete.code ? ` (${vendorToDelete.code})` : ""}` : undefined}
        onConfirm={handleDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setVendorToDelete(null);
        }}
      />
    </div>
  );
}

