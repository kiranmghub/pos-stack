// pos-frontend/src/features/inventory/operations/purchase-orders/PurchaseOrdersPage.tsx
import React, { useState, useMemo, useEffect } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter, type StoreOption } from "../../components/StoreFilter";
import { POList } from "./POList";
import { PODetail } from "./PODetail";
import { CreatePOModal } from "./CreatePOModal";
import { ReceivePOModal } from "./ReceivePOModal";
import { ReceiveExternalPOModal } from "./ReceiveExternalPOModal";
import {
  usePurchaseOrdersList,
  usePurchaseOrderDetail,
  useSubmitPurchaseOrder,
  useDeletePurchaseOrder,
} from "../../hooks/usePurchaseOrders";
import { PurchaseOrder } from "../../api/purchaseOrders";
import { Plus, Upload } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { DataTablePagination } from "../../components/DataTable";

export interface PurchaseOrdersPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID filter (null for "All Stores") */
  storeId: number | null;
  /** On store change handler */
  onStoreChange: (storeId: number | null) => void;
  /** Initial PO ID to select (for deep linking) */
  initialSelectedPOId?: number | null;
  /** Callback when PO is selected (for cleanup) */
  onPOSelected?: () => void;
}

/**
 * PurchaseOrdersPage - Main page for purchase order management
 * Security: All operations are tenant-scoped via API
 */
export function PurchaseOrdersPage({
  stores,
  storeId,
  onStoreChange,
  initialSelectedPOId = null,
  onPOSelected,
}: PurchaseOrdersPageProps) {
  const notify = useNotify();
  const [selectedPOId, setSelectedPOId] = useState<number | null>(initialSelectedPOId);
  
  // Handle initial PO selection from URL params
  React.useEffect(() => {
    if (initialSelectedPOId && initialSelectedPOId !== selectedPOId) {
      setSelectedPOId(initialSelectedPOId);
      if (onPOSelected) {
        // Call after a small delay to ensure state is set
        setTimeout(() => onPOSelected(), 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedPOId]); // Only run when initialSelectedPOId changes
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showExternalReceiveModal, setShowExternalReceiveModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [vendorFilter, setVendorFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch purchase orders
  const { data: poData, isLoading: poLoading } = usePurchaseOrdersList({
    store_id: storeId || undefined,
    status: statusFilter || undefined,
    vendor_id: vendorFilter || undefined,
    page,
    page_size: pageSize,
  });

  // Fetch selected PO detail
  const { data: poDetail, isLoading: detailLoading } = usePurchaseOrderDetail(selectedPOId);

  const submitMutation = useSubmitPurchaseOrder();
  const deleteMutation = useDeletePurchaseOrder();

  const filteredPOs = useMemo(() => {
    if (!poData?.results) return [];
    return poData.results;
  }, [poData]);

  const handlePOClick = (po: PurchaseOrder) => {
    setSelectedPOId(po.id);
  };

  const handleCreateSuccess = () => {
    setSelectedPOId(null);
  };

  const handleSubmit = async () => {
    if (!selectedPOId) return;

    if (!confirm("Are you sure you want to submit this purchase order? It cannot be edited after submission.")) {
      return;
    }

    try {
      await submitMutation.mutateAsync(selectedPOId);
      notify.success("Purchase order submitted successfully");
    } catch (err: any) {
      notify.error(err.message || "Failed to submit purchase order");
    }
  };

  const handleReceive = () => {
    if (poDetail) {
      setShowReceiveModal(true);
    }
  };

  const handleReceiveSuccess = () => {
    setShowReceiveModal(false);
    // Refetch will happen automatically via React Query
  };

  const handleDelete = async () => {
    if (!selectedPOId || !poDetail) return;

    if (!confirm(`Are you sure you want to delete purchase order "${poDetail.po_number || `#${poDetail.id}`}"?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(selectedPOId);
      notify.success("Purchase order deleted");
      setSelectedPOId(null);
    } catch (err: any) {
      notify.error(err.message || "Failed to delete purchase order");
    }
  };

  const canSubmit = poDetail?.status === "DRAFT";
  const canReceive =
    poDetail?.status === "SUBMITTED" || poDetail?.status === "PARTIAL_RECEIVED";
  const canDelete = poDetail?.status === "DRAFT";

  const activeFiltersCount =
    (storeId ? 1 : 0) + (statusFilter ? 1 : 0) + (vendorFilter ? 1 : 0);

  // Get unique vendors from PO list for filter
  const availableVendors = useMemo(() => {
    if (!poData?.results) return [];
    const vendorMap = new Map<number, { id: number; name: string; code: string }>();
    poData.results.forEach((po) => {
      if (!vendorMap.has(po.vendor.id)) {
        vendorMap.set(po.vendor.id, po.vendor);
      }
    });
    return Array.from(vendorMap.values());
  }, [poData]);

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Purchase Orders"
        subtitle="Manage purchase orders and receiving"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowExternalReceiveModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Receive External PO
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create PO
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="mb-4">
        <FilterBar
          searchQuery=""
          onSearchChange={() => {}}
          activeFilterCount={activeFiltersCount}
          onClear={() => {
            setStatusFilter("");
            setVendorFilter(null);
            onStoreChange(null);
          }}
        >
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={onStoreChange}
            showAllStores={true}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="PARTIAL_RECEIVED">Partial Received</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          {availableVendors.length > 0 && (
            <select
              value={vendorFilter || ""}
              onChange={(e) => setVendorFilter(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Vendors</option>
              {availableVendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          )}
        </FilterBar>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Left Panel - PO List */}
        <div className="flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden">
            <POList
              purchaseOrders={filteredPOs}
              loading={poLoading}
              onPOClick={handlePOClick}
              selectedPOId={selectedPOId}
            />
          </div>
          {poData && poData.count > 0 && (
            <div className="mt-4">
              <DataTablePagination
                page={page}
                lastPage={Math.ceil(poData.count / pageSize)}
                pageSize={pageSize}
                count={poData.count}
                onPageChange={setPage}
                onPageSizeChange={() => {}} // Not implemented for now
              />
            </div>
          )}
        </div>

        {/* Right Panel - PO Detail */}
        <div className="flex flex-col min-h-0 rounded-lg border border-border bg-card overflow-hidden">
          <PODetail
            po={poDetail || null}
            loading={detailLoading}
            onSubmit={handleSubmit}
            onReceive={handleReceive}
            onDelete={handleDelete}
            submitPending={submitMutation.isPending}
            canSubmit={canSubmit}
            canReceive={canReceive}
            canDelete={canDelete}
          />
        </div>
      </div>

      {/* Create Modal */}
      <CreatePOModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        stores={stores}
        defaultStoreId={storeId}
      />

      {/* Receive Modal */}
      <ReceivePOModal
        open={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        po={poDetail || null}
        onSuccess={handleReceiveSuccess}
      />

      {/* External Receive Modal */}
      <ReceiveExternalPOModal
        open={showExternalReceiveModal}
        onClose={() => setShowExternalReceiveModal(false)}
        onSuccess={handleCreateSuccess}
        stores={stores}
        defaultStoreId={storeId}
      />
    </div>
  );
}

