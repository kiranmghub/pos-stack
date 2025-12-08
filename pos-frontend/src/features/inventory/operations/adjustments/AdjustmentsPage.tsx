// pos-frontend/src/features/inventory/operations/adjustments/AdjustmentsPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter, type StoreOption } from "../../components/StoreFilter";
import { DataTable, type Column, EmptyState, LoadingSkeleton } from "../../components";
import { useAdjustmentsList } from "../../hooks/useAdjustments";
import { Adjustment } from "../../api/adjustments";
import { format } from "date-fns";
import { Package, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTablePagination } from "../../components/DataTable";
import { Button } from "@/components/ui/button";
import { AdjustmentModal } from "./AdjustmentModal";
import { AdjustmentDetailModal } from "./AdjustmentDetailModal";

export interface AdjustmentsPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID filter (null for "All Stores") */
  storeId: number | null;
  /** On store change handler */
  onStoreChange: (storeId: number | null) => void;
}

/**
 * AdjustmentsPage - Main page for viewing adjustment history
 * Security: All operations are tenant-scoped via API
 */
export function AdjustmentsPage({
  stores,
  storeId,
  onStoreChange,
}: AdjustmentsPageProps) {
  const [page, setPage] = useState(1);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<Adjustment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const pageSize = 20;

  // Fetch adjustments
  const { data: adjustmentsData, isLoading: adjustmentsLoading } = useAdjustmentsList({
    store_id: storeId || undefined,
    page,
    page_size: pageSize,
  });

  const filteredAdjustments = useMemo(() => {
    if (!adjustmentsData?.results) return [];
    return adjustmentsData.results;
  }, [adjustmentsData]);

  const activeFiltersCount = storeId ? 1 : 0;

  const columns: Column<Adjustment>[] = [
    {
      key: "id",
      header: "ID",
      width: "6rem",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">#{row.id}</div>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      width: "10rem",
      cell: (row) => (
        <div className="text-sm">
          <div className="text-foreground">
            {format(new Date(row.created_at), "MMM d, yyyy")}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(row.created_at), "h:mm a")}
          </div>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      width: "10rem",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">{row.reason.name}</div>
      ),
    },
    {
      key: "lines",
      header: "Items",
      width: "8rem",
      cell: (row) => (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Package className="h-4 w-4" />
          <span>{row.lines.length}</span>
        </div>
      ),
    },
    {
      key: "deltas",
      header: "Changes",
      width: "12rem",
      cell: (row) => {
        const totalDelta = row.lines.reduce((sum, line) => sum + line.delta, 0);
        const isPositive = totalDelta > 0;
        const isNegative = totalDelta < 0;
        const isZero = totalDelta === 0;

        return (
          <div className="flex items-center gap-1">
            {isPositive && <TrendingUp className="h-4 w-4 text-badge-success-text" />}
            {isNegative && <TrendingDown className="h-4 w-4 text-badge-error-text" />}
            {isZero && <Minus className="h-4 w-4 text-muted-foreground" />}
            <span
              className={cn(
                "text-sm font-semibold",
                isPositive && "text-badge-success-text",
                isNegative && "text-badge-error-text",
                isZero && "text-muted-foreground"
              )}
            >
              {isPositive ? "+" : ""}
              {totalDelta}
            </span>
          </div>
        );
      },
    },
    {
      key: "created_by",
      header: "User",
      width: "10rem",
      cell: (row) => (
        <div className="text-sm text-muted-foreground">
          {row.created_by || "—"}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Adjustments"
        subtitle="View inventory adjustment history"
        actions={
          storeId ? (
            <Button onClick={() => setShowAdjustModal(true)}>
              <Package className="h-4 w-4 mr-2" />
              New Adjustment
            </Button>
          ) : null
        }
      />

      {/* Filter Bar */}
      <div className="mb-4">
        <FilterBar
          searchQuery=""
          onSearchChange={() => {}}
          activeFilterCount={activeFiltersCount}
          onClear={() => {
            onStoreChange(null);
          }}
        >
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={onStoreChange}
            showAllStores={true}
          />
        </FilterBar>
      </div>

      {/* Adjustments Table */}
      <div className="flex-1 overflow-hidden">
        {adjustmentsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <LoadingSkeleton key={i} variant="card" height={60} />
            ))}
          </div>
        ) : filteredAdjustments.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No adjustments found"
            description={
              storeId
                ? "Create a new adjustment to get started"
                : "Select a store to view adjustments"
            }
          />
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <DataTable
              data={filteredAdjustments}
              columns={columns}
              emptyMessage="No adjustments found"
              onRowClick={(adjustment) => {
                setSelectedAdjustment(adjustment);
                setShowDetailModal(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      {adjustmentsData && adjustmentsData.count > 0 && (
        <div className="mt-4">
          <DataTablePagination
            page={page}
            lastPage={Math.ceil(adjustmentsData.count / pageSize)}
            pageSize={pageSize}
            count={adjustmentsData.count}
            onPageChange={setPage}
            onPageSizeChange={() => {}} // Not implemented for now
          />
        </div>
      )}

      {/* Adjustment Modal */}
      {storeId && (
        <AdjustmentModal
          open={showAdjustModal}
          onClose={() => setShowAdjustModal(false)}
          variantId={null}
          storeId={storeId}
          onSuccess={() => {
            // Refetch will happen automatically via React Query
          }}
        />
      )}

      {/* Adjustment Detail Modal */}
      <AdjustmentDetailModal
        open={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedAdjustment(null);
        }}
        adjustment={selectedAdjustment}
      />
    </div>
  );
}

