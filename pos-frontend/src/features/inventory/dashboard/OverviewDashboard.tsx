// pos-frontend/src/features/inventory/dashboard/OverviewDashboard.tsx
import React from "react";
import { useInventoryOverview, useAtRiskItems } from "../hooks/useInventory";
import { KpiSection } from "./KpiSection";
import { ChartsSection } from "./ChartsSection";
import { AlertsSection } from "./AlertsSection";
import { ActivityFeed } from "./ActivityFeed";
import { QuickActions } from "./QuickActions";
import { LoadingSkeleton, StoreFilter, type StoreOption } from "../components";
import { ErrorBoundary } from "../components";

export interface OverviewDashboardProps {
  /** Available stores */
  stores: StoreOption[];
  /** Selected store ID (null = "All Stores") */
  storeId?: number | null;
  /** Store change handler */
  onStoreChange?: (storeId: number | null) => void;
  onKpiClick?: (kpi: string) => void;
  onCreateTransfer?: () => void;
  onStartCount?: () => void;
  onCreatePO?: () => void;
  onBulkAdjust?: () => void;
  onViewLowStock?: () => void;
  onViewAtRisk?: () => void;
  onItemClick?: (item: any) => void;
  onMovementClick?: (movement: any) => void;
}

/**
 * OverviewDashboard - Main inventory overview dashboard
 */
export function OverviewDashboard({
  stores,
  storeId,
  onStoreChange,
  onKpiClick,
  onCreateTransfer,
  onStartCount,
  onCreatePO,
  onBulkAdjust,
  onViewLowStock,
  onViewAtRisk,
  onItemClick,
  onMovementClick,
}: OverviewDashboardProps) {
  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
  } = useInventoryOverview(storeId ? { store_id: storeId } : undefined);

  const {
    data: atRiskData,
    isLoading: atRiskLoading,
  } = useAtRiskItems({ limit: 10, store_id: storeId || undefined });

  if (overviewLoading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" height={200} />
        <LoadingSkeleton variant="card" height={300} />
        <LoadingSkeleton variant="card" height={300} />
      </div>
    );
  }

  if (overviewError) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-destructive">
          Failed to load inventory overview. Please try again.
        </p>
      </div>
    );
  }

  if (!overviewData) {
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Store Filter */}
        {stores.length > 0 && onStoreChange && (
          <div className="rounded-lg border border-border bg-card p-4">
            <StoreFilter
              stores={stores}
              selectedStoreId={storeId ?? null}
              onStoreChange={onStoreChange}
              showAllStores={true}
              required={false}
            />
          </div>
        )}

        {/* KPI Cards */}
        <KpiSection data={overviewData} onKpiClick={onKpiClick} />

        {/* Charts Section */}
        <ChartsSection
          storeId={storeId}
          currency={overviewData.currency}
        />

        {/* Quick Actions */}
        <QuickActions
          onCreateTransfer={onCreateTransfer}
          onStartCount={onStartCount}
          onCreatePO={onCreatePO}
          onBulkAdjust={onBulkAdjust}
        />

        {/* Alerts and Activity */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Alerts Section */}
          <AlertsSection
            lowStockCount={overviewData.low_stock_count}
            atRiskItems={atRiskData?.results || []}
            loading={atRiskLoading}
            onViewLowStock={onViewLowStock}
            onViewAtRisk={onViewAtRisk}
            onItemClick={onItemClick}
          />

          {/* Activity Feed */}
          <ActivityFeed
            movements={overviewData.recent || []}
            loading={overviewLoading}
            onMovementClick={onMovementClick}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}

