// pos-frontend/src/features/inventory/multi-channel/BackordersPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../components/FilterBar";
import { StoreFilter, StoreOption } from "../components/StoreFilter";
import { ReservationList } from "./ReservationList";
import { ReservationDetail } from "./ReservationDetail";
import {
  useReservationsList,
  useCommitReservation,
  useReleaseReservation,
} from "../hooks/useReservations";
import { Reservation } from "../api/reservations";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { EmptyState } from "../components";

export interface BackordersPageProps {
  /** Available stores */
  stores?: StoreOption[];
  /** Store ID filter */
  storeId?: number | null;
  /** On store change handler */
  onStoreChange?: (storeId: number | null) => void;
}

/**
 * BackordersPage - View for backorders (reservations that may need attention)
 * Security: All operations are tenant-scoped via API
 */
export function BackordersPage({
  stores = [],
  storeId,
  onStoreChange,
}: BackordersPageProps) {
  const notify = useNotify();
  const [selectedReservationId, setSelectedReservationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch active reservations (backorders are typically active reservations)
  const {
    data: reservationsData,
    isLoading: reservationsLoading,
    refetch: refetchReservations,
  } = useReservationsList({
    store_id: storeId || undefined,
    status: "ACTIVE", // Only show active reservations as backorders
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

  // Filter for backorders (active reservations, optionally expired or expiring soon)
  const backorders = useMemo(() => {
    if (!reservationsData?.results) return [];
    let filtered = reservationsData.results;

    // Client-side search filtering
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

    // Sort by expiration (expired first, then expiring soon, then by created date)
    filtered.sort((a, b) => {
      const aExpired = a.expires_at ? new Date(a.expires_at) < new Date() : false;
      const bExpired = b.expires_at ? new Date(b.expires_at) < new Date() : false;
      if (aExpired !== bExpired) return aExpired ? -1 : 1;

      const aExpiringSoon = a.expires_at
        ? (new Date(a.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60) <= 24
        : false;
      const bExpiringSoon = b.expires_at
        ? (new Date(b.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60) <= 24
        : false;
      if (aExpiringSoon !== bExpiringSoon) return aExpiringSoon ? -1 : 1;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  }, [reservationsData, searchQuery]);

  const handleReservationClick = (reservation: Reservation) => {
    setSelectedReservationId(reservation.id);
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

  const activeFiltersCount = (storeId ? 1 : 0) + (searchQuery ? 1 : 0);

  const handleClearFilters = () => {
    setSearchQuery("");
    onStoreChange?.(null);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Backorders"
        subtitle="Active reservations requiring attention"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchReservations()}
            disabled={reservationsLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${reservationsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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
        </FilterBar>
      </div>

      {/* Summary Stats */}
      {backorders.length > 0 && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">Total Backorders</div>
            <div className="text-2xl font-semibold text-foreground">{backorders.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">Expired</div>
            <div className="text-2xl font-semibold text-badge-error-text">
              {backorders.filter((r) => r.expires_at && new Date(r.expires_at) < new Date()).length}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">Expiring Soon</div>
            <div className="text-2xl font-semibold text-badge-warning-text">
              {backorders.filter(
                (r) =>
                  r.expires_at &&
                  new Date(r.expires_at) > new Date() &&
                  (new Date(r.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60) <= 24
              ).length}
            </div>
          </div>
        </div>
      )}

      {/* Split View: List and Detail */}
      {backorders.length === 0 && !reservationsLoading ? (
        <EmptyState
          icon={<AlertTriangle className="h-12 w-12 text-muted-foreground" />}
          title="No Backorders"
          description="There are no active reservations requiring attention."
        />
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          {/* Backorder List */}
          <div className="flex flex-col min-h-0">
            <ReservationList
              reservations={backorders}
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
                  backorders
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
      )}
    </div>
  );
}

