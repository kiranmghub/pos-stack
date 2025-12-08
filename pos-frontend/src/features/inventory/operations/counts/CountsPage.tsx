// pos-frontend/src/features/inventory/operations/counts/CountsPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter, type StoreOption } from "../../components/StoreFilter";
import { CountSessionList } from "./CountSessionList";
import { CountSessionDetail } from "./CountSessionDetail";
import { CreateCountModal } from "./CreateCountModal";
import { VariancePreview } from "./VariancePreview";
import { useCountSessionsList, useCountSessionDetail, useCountVariance, useDeleteCountSession } from "../../hooks/useCounts";
import { CountSession } from "../../api/counts";
import { Plus, Package, X } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { DataTablePagination } from "../../components/DataTable";
// Using native select for now - can be replaced with a proper Select component if available
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CountsPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID filter (null for "All Stores") */
  storeId: number | null;
  /** On store change handler */
  onStoreChange: (storeId: number | null) => void;
}

/**
 * CountsPage - Main page for cycle count management
 * Security: All operations are tenant-scoped via API
 */
export function CountsPage({ stores, storeId, onStoreChange }: CountsPageProps) {
  const notify = useNotify();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVarianceModal, setShowVarianceModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch count sessions
  const { data: sessionsData, isLoading: sessionsLoading } = useCountSessionsList({
    store_id: storeId || undefined,
    status: statusFilter || undefined,
    q: searchQuery || undefined,
    page,
    page_size: pageSize,
  });

  // Fetch selected session detail
  const { data: sessionDetail, isLoading: detailLoading } = useCountSessionDetail(selectedSessionId);

  // Fetch variance for selected session
  const { data: varianceData, isLoading: varianceLoading } = useCountVariance(
    selectedSessionId && sessionDetail?.status !== "FINALIZED" ? selectedSessionId : null
  );

  const deleteMutation = useDeleteCountSession();

  // Filter sessions client-side for search (if needed)
  const filteredSessions = useMemo(() => {
    if (!sessionsData?.results) return [];
    return sessionsData.results;
  }, [sessionsData]);

  const handleSessionClick = (session: CountSession) => {
    setSelectedSessionId(session.id);
  };

  const handleCreateSuccess = () => {
    // Refetch will happen automatically via React Query
    setSelectedSessionId(null);
  };

  const handleDeleteSession = async (session: CountSession) => {
    if (session.status === "FINALIZED") {
      notify.error("Cannot delete finalized count sessions");
      return;
    }

    if (!confirm(`Are you sure you want to delete count session "${session.code || `#${session.id}`}"?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(session.id);
      notify.success("Count session deleted");
      if (selectedSessionId === session.id) {
        setSelectedSessionId(null);
      }
    } catch (err: any) {
      notify.error(err.message || "Failed to delete count session");
    }
  };

  const handleFinalize = () => {
    // Refetch will happen automatically via React Query
    setSelectedSessionId(null);
  };

  const handleShowVariance = () => {
    if (selectedSessionId && sessionDetail?.status !== "FINALIZED") {
      setShowVarianceModal(true);
    }
  };

  const activeFiltersCount = (storeId ? 1 : 0) + (statusFilter ? 1 : 0) + (searchQuery ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Cycle Counts"
        subtitle="Manage inventory cycle count sessions"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Count
          </Button>
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
            setStatusFilter("");
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
            <option value="IN_PROGRESS">In Progress</option>
            <option value="FINALIZED">Finalized</option>
          </select>
        </FilterBar>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Left Panel - Session List */}
        <div className="flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden">
            <CountSessionList
              sessions={filteredSessions}
              loading={sessionsLoading}
              onSessionClick={handleSessionClick}
              selectedSessionId={selectedSessionId}
            />
          </div>
          {sessionsData && sessionsData.count > 0 && (
            <div className="mt-4">
              <DataTablePagination
                page={page}
                lastPage={Math.ceil(sessionsData.count / pageSize)}
                pageSize={pageSize}
                count={sessionsData.count}
                onPageChange={setPage}
                onPageSizeChange={() => {}} // Not implemented for now
              />
            </div>
          )}
        </div>

        {/* Right Panel - Session Detail */}
        <div className="flex flex-col min-h-0 rounded-lg border border-border bg-card overflow-hidden">
          <CountSessionDetail
            session={sessionDetail || null}
            loading={detailLoading}
            onFinalize={handleFinalize}
          />
          {sessionDetail && sessionDetail.status !== "FINALIZED" && (
            <div className="p-4 border-t border-border">
              <Button
                onClick={handleShowVariance}
                variant="outline"
                className="w-full"
              >
                View Variance Preview
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <CreateCountModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        stores={stores}
        defaultStoreId={storeId}
      />

      {/* Variance Preview Modal */}
      <Dialog open={showVarianceModal} onOpenChange={setShowVarianceModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Variance Preview</DialogTitle>
            <DialogDescription>
              Review variances before finalizing the count session
            </DialogDescription>
          </DialogHeader>
          <VariancePreview variance={varianceData || null} loading={varianceLoading} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

