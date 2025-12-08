// pos-frontend/src/features/inventory/operations/transfers/TransfersPage.tsx
import React, { useState, useMemo } from "react";
import { useTransfersList, useSendTransfer, useCancelTransfer } from "../../hooks/useTransfers";
import { TransferList } from "./TransferList";
import { TransferDetail } from "./TransferDetail";
import { CreateTransferModal } from "./CreateTransferModal";
import { ReceiveTransferModal } from "./ReceiveTransferModal";
import { FilterBar, EmptyState, LoadingSkeleton, StoreFilter, type StoreOption } from "../../components";
import { Transfer } from "../../api/transfers";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "../../components/DataTable";

export interface TransfersPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Selected store ID (null = "All Stores") */
  storeId: number | null;
  /** Store change handler */
  onStoreChange: (storeId: number | null) => void;
}

type StatusFilter = "all" | "DRAFT" | "IN_TRANSIT" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";

/**
 * TransfersPage - Main transfers management page with list and detail view
 * Security: All operations are tenant-scoped via API
 */
export function TransfersPage({
  stores,
  storeId,
  onStoreChange,
}: TransfersPageProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [selectedTransferId, setSelectedTransferId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  const sendTransferMutation = useSendTransfer();
  const cancelTransferMutation = useCancelTransfer();

  // Build API params
  const apiParams = useMemo(() => {
    const params: any = {
      page,
      page_size: pageSize,
    };

    if (storeId) {
      params.store_id = storeId;
    }

    if (statusFilter !== "all") {
      params.status = statusFilter;
    }

    return params;
  }, [storeId, statusFilter, page, pageSize]);

  // Fetch transfers
  const {
    data: transfersData,
    isLoading,
    error,
  } = useTransfersList(apiParams);

  // Filter transfers by search query (client-side filtering)
  const filteredTransfers = useMemo(() => {
    if (!transfersData?.results) return [];
    if (!searchQuery.trim()) return transfersData.results;

    const query = searchQuery.toLowerCase().trim();
    return transfersData.results.filter((transfer) => {
      // Search by transfer ID
      if (transfer.id.toString().includes(query)) return true;
      
      // Search by store names
      if (transfer.from_store.name.toLowerCase().includes(query)) return true;
      if (transfer.from_store.code.toLowerCase().includes(query)) return true;
      if (transfer.to_store.name.toLowerCase().includes(query)) return true;
      if (transfer.to_store.code.toLowerCase().includes(query)) return true;
      
      // Search by product names in lines
      if (transfer.lines.some((line) => 
        line.product.toLowerCase().includes(query) || 
        line.sku.toLowerCase().includes(query)
      )) return true;
      
      // Search by notes
      if (transfer.notes.toLowerCase().includes(query)) return true;
      
      return false;
    });
  }, [transfersData?.results, searchQuery]);

  // Get selected transfer
  const selectedTransfer = useMemo(() => {
    if (!selectedTransferId || !transfersData) return null;
    return transfersData.results.find((t) => t.id === selectedTransferId) || null;
  }, [selectedTransferId, transfersData]);

  const handleTransferClick = (transfer: Transfer) => {
    setSelectedTransferId(transfer.id);
  };

  const handleSend = async () => {
    if (!selectedTransferId) return;
    try {
      await sendTransferMutation.mutateAsync(selectedTransferId);
      // Refresh selected transfer
      setSelectedTransferId(selectedTransferId);
    } catch (err) {
      console.error("Failed to send transfer:", err);
    }
  };

  const handleReceive = () => {
    if (selectedTransfer) {
      setShowReceiveModal(true);
    }
  };

  const handleCancel = async () => {
    if (!selectedTransferId) return;
    if (!confirm("Are you sure you want to cancel this transfer?")) return;
    try {
      await cancelTransferMutation.mutateAsync(selectedTransferId);
      setSelectedTransferId(null);
    } catch (err) {
      console.error("Failed to cancel transfer:", err);
    }
  };

  const handleCreateSuccess = () => {
    setSelectedTransferId(null);
  };

  const handleReceiveSuccess = () => {
    setShowReceiveModal(false);
    // Refresh selected transfer
    if (selectedTransferId) {
      setSelectedTransferId(selectedTransferId);
    }
  };

  const lastPage = transfersData
    ? Math.max(1, Math.ceil(transfersData.count / pageSize))
    : 1;

  if (error) {
    return (
      <EmptyState
        variant="error"
        title="Failed to load transfers"
        description="Please try again or contact support if the problem persists."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Transfers</h2>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Transfer
        </Button>
      </div>

      {/* Filters */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by ID, store, product, SKU, or notes..."
        activeFilterCount={searchQuery.trim() ? 1 : 0}
        onClear={() => {
          setSearchQuery("");
        }}
      >
        <StoreFilter
          stores={stores}
          selectedStoreId={storeId}
          onStoreChange={onStoreChange}
          showAllStores={true}
          required={false}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(1);
          }}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="PARTIAL_RECEIVED">Partial Received</option>
          <option value="RECEIVED">Received</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </FilterBar>

      {/* Split View: List and Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Transfer List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <LoadingSkeleton key={i} variant="card" height={60} />
              ))}
            </div>
          ) : (
            <>
              <TransferList
                transfers={filteredTransfers}
                loading={isLoading}
                onTransferClick={handleTransferClick}
                selectedTransferId={selectedTransferId}
              />
              {transfersData && (
                <div className="text-sm text-muted-foreground">
                  {searchQuery.trim() ? (
                    <>Showing {filteredTransfers.length} of {transfersData.count} transfers</>
                  ) : (
                    <>Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, transfersData.count)} of {transfersData.count} transfers</>
                  )}
                </div>
              )}
              {transfersData && !searchQuery.trim() && transfersData.count > 0 && (
                <DataTablePagination
                  page={page}
                  lastPage={lastPage}
                  pageSize={pageSize}
                  count={transfersData.count}
                  onPageChange={setPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Right: Transfer Detail */}
        <div>
          <TransferDetail
            transfer={selectedTransfer}
            loading={false}
            onSend={handleSend}
            onReceive={handleReceive}
            onCancel={handleCancel}
            sending={sendTransferMutation.isPending}
            receiving={false}
            cancelling={cancelTransferMutation.isPending}
          />
        </div>
      </div>

      {/* Modals */}
      <CreateTransferModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        stores={stores}
        onSuccess={handleCreateSuccess}
      />
      <ReceiveTransferModal
        transfer={selectedTransfer}
        open={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        onSuccess={handleReceiveSuccess}
      />
    </div>
  );
}

