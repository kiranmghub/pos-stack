// pos-frontend/src/features/inventory/multi-channel/ReservationsPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../components/FilterBar";
import { StoreFilter, StoreOption } from "../components/StoreFilter";
import { ReservationList } from "./ReservationList";
import { ReservationDetail } from "./ReservationDetail";
import { CreateReservationModal } from "./CreateReservationModal";
import {
  useReservationsList,
  useCommitReservation,
  useReleaseReservation,
} from "../hooks/useReservations";
import { Reservation } from "../api/reservations";
import { Plus, RefreshCw } from "lucide-react";
import { useNotify } from "@/lib/notify";

export interface ReservationsPageProps {
  /** Available stores */
  stores?: StoreOption[];
  /** Store ID filter */
  storeId?: number | null;
  /** On store change handler */
  onStoreChange?: (storeId: number | null) => void;
}

/**
 * ReservationsPage - Main reservations management page
 * Security: All operations are tenant-scoped via API
 */
export function ReservationsPage({
  stores = [],
  storeId,
  onStoreChange,
}: ReservationsPageProps) {
  const notify = useNotify();
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch reservations list
  const {
    data: reservationsData,
    isLoading: reservationsLoading,
    refetch: refetchReservations,
  } = useReservationsList({
    store_id: storeId || undefined,
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    page,
    page_size: pageSize,
  });

  const commitReservationMutation = useCommitReservation();
  const releaseReservationMutation = useReleaseReservation();

  // Get selected reservation
  const selectedReservation = useMemo(() => {
    if (!selectedReservationId || !reservationsData?.results) return null;
    return reservationsData.results.find((r) => r.id === selectedReservationId) || null;
  }, [selectedReservationId, reservationsData]);

  // Client-side search filtering
  const filteredReservations = useMemo(() => {
    if (!reservationsData?.results) return [];
    let filtered = reservationsData.results;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.product_name.toLowerCase().includes(query) ||
          r.sku.toLowerCase().includes(query) ||
          r.store_name.toLowerCase().includes(query) ||
          r.channel.toLowerCase().includes(query) ||
          r.ref_type.toLowerCase().includes(query) ||
          (r.note && r.note.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [reservationsData, searchQuery]);

  const handleReservationClick = (reservation: Reservation) => {
    setSelectedReservationId(reservation.id);
  };

  const handleCreateSuccess = () => {
    refetchReservations();
    setShowCreateModal(false);
  };

  const handleCommit = async () => {
    if (!selectedReservation) return;
    try {
      await commitReservationMutation.mutateAsync(selectedReservation.id);
      setSelectedReservationId(null);
      refetchReservations();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleRelease = async () => {
    if (!selectedReservation) return;
    try {
      await releaseReservationMutation.mutateAsync(selectedReservation.id);
      setSelectedReservationId(null);
      refetchReservations();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const activeFiltersCount =
    (storeId ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (channelFilter ? 1 : 0) +
    (searchQuery ? 1 : 0);

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
    setChannelFilter("");
    onStoreChange?.(null);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Reservations"
        subtitle="Manage stock reservations across channels"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchReservations()}
              disabled={reservationsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${reservationsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Reservation
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
          onClear={handleClearFilters}
        >
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={onStoreChange || (() => {})}
            showAllStores={true}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="COMMITTED">Committed</option>
            <option value="RELEASED">Released</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Channels</option>
            <option value="POS">POS</option>
            <option value="WEB">Web</option>
            <option value="MARKETPLACE">Marketplace</option>
            <option value="OTHER">Other</option>
          </select>
        </FilterBar>
      </div>

      {/* Split View: List and Detail */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Reservation List */}
        <div className="flex flex-col min-h-0">
          <ReservationList
            reservations={filteredReservations}
            selectedReservationId={selectedReservationId}
            onReservationClick={handleReservationClick}
            isLoading={reservationsLoading}
          />
          {/* Pagination */}
          {reservationsData && reservationsData.count > pageSize && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, reservationsData.count)} of {reservationsData.count}{" "}
                reservations
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
                  disabled={page * pageSize >= reservationsData.count}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Reservation Detail */}
        <div className="flex flex-col min-h-0 overflow-y-auto">
          <ReservationDetail
            reservation={selectedReservation}
            onCommit={handleCommit}
            onRelease={handleRelease}
            isCommitting={commitReservationMutation.isPending}
            isReleasing={releaseReservationMutation.isPending}
          />
        </div>
      </div>

      {/* Create Reservation Modal */}
      <CreateReservationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        stores={stores}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

