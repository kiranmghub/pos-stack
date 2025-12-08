// pos-frontend/src/features/inventory/operations/returns/ReturnsInspectionPage.tsx
import React, { useState } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter } from "../../components/StoreFilter";
import { InspectionQueue } from "./InspectionQueue";
import { InspectReturnModal } from "./InspectReturnModal";
import { useInspectionQueue, useReturnDetail } from "../../hooks/useReturns";
import { Return } from "../../api/returns";
import { StoreOption } from "../../components/StoreFilter";
import { RefreshCw, Package } from "lucide-react";
import { useNotify } from "@/lib/notify";

export interface ReturnsInspectionPageProps {
  /** Available stores */
  stores?: StoreOption[];
  /** Store ID filter */
  storeId?: number | null;
  /** On store change handler */
  onStoreChange?: (storeId: number | null) => void;
}

/**
 * ReturnsInspectionPage - Main page for returns inspection workflow
 * Security: All operations are tenant-scoped via API
 */
export function ReturnsInspectionPage({
  stores = [],
  storeId,
  onStoreChange,
}: ReturnsInspectionPageProps) {
  const notify = useNotify();
  const [selectedReturnId, setSelectedReturnId] = useState<number | null>(null);
  const [showInspectModal, setShowInspectModal] = useState(false);

  const {
    data: queueData,
    isLoading: queueLoading,
    refetch: refetchQueue,
  } = useInspectionQueue({
    store_id: storeId || undefined,
  });

  const returns = queueData?.results || [];
  
  // Fetch selected return detail to get full item data
  const { data: selectedReturnDetail } = useReturnDetail(selectedReturnId);
  const selectedReturn = selectedReturnDetail || returns.find((r) => r.id === selectedReturnId) || null;

  const handleReturnClick = (returnItem: Return) => {
    setSelectedReturnId(returnItem.id);
    setShowInspectModal(true);
  };

  const handleInspectSuccess = () => {
    refetchQueue();
    // Keep modal open if return is still in queue
    if (selectedReturn) {
      const updatedReturn = returns.find((r) => r.id === selectedReturn.id);
      if (updatedReturn && updatedReturn.status === "awaiting_inspection") {
        // Still in queue, keep modal open
        return;
      }
    }
    setShowInspectModal(false);
    setSelectedReturnId(null);
  };

  const pendingCount = returns.filter((r) => {
    // Queue items may not have full item details, so check items_count or items
    if (r.items && r.items.length > 0) {
      return r.items.some((item) => item.disposition === "PENDING");
    }
    // If no items in queue response, assume pending (will be loaded in detail)
    return true;
  }).length;

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Returns Inspection"
        subtitle="Inspect returned items and set dispositions"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchQueue()}
              disabled={queueLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${queueLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Total Returns</div>
          <div className="text-2xl font-semibold text-foreground mt-1">{returns.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Pending Inspection</div>
          <div className="text-2xl font-semibold text-badge-warning-text mt-1">
            {pendingCount}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Ready to Finalize</div>
          <div className="text-2xl font-semibold text-badge-success-text mt-1">
            {returns.filter((r) => r.status === "accepted").length}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6">
        <FilterBar
          searchQuery=""
          onSearchChange={() => {}}
          activeFilterCount={storeId ? 1 : 0}
          onClear={() => onStoreChange?.(null)}
        >
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={onStoreChange || (() => {})}
            showAllStores={true}
            required={false}
          />
        </FilterBar>
      </div>

      {/* Inspection Queue */}
      <div className="flex-1 mt-6 min-h-0">
        <InspectionQueue
          returns={returns}
          selectedReturnId={selectedReturnId}
          onReturnClick={handleReturnClick}
          isLoading={queueLoading}
        />
      </div>

      {/* Inspect Modal */}
      <InspectReturnModal
        open={showInspectModal}
        onClose={() => {
          setShowInspectModal(false);
          setSelectedReturnId(null);
        }}
        returnData={selectedReturn}
        onSuccess={handleInspectSuccess}
      />
    </div>
  );
}

