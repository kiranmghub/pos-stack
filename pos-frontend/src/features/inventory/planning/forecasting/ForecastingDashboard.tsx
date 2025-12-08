// pos-frontend/src/features/inventory/planning/forecasting/ForecastingDashboard.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter, type StoreOption } from "../../components/StoreFilter";
import { ForecastCard } from "./ForecastCard";
import { ForecastDetail } from "./ForecastDetail";
import { useAtRiskItems } from "../../hooks/useForecasting";
import { AtRiskItem } from "../../api/forecasting";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { LoadingSkeleton, EmptyState } from "../../components";
// Using native select for now - can be replaced with shadcn Select component if available

export interface ForecastingDashboardProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID filter (null for "All Stores") */
  storeId: number | null;
  /** On store change handler */
  onStoreChange: (storeId: number | null) => void;
}

/**
 * ForecastingDashboard - Main forecasting dashboard page
 * Security: All operations are tenant-scoped via API
 */
export function ForecastingDashboard({
  stores,
  storeId,
  onStoreChange,
}: ForecastingDashboardProps) {
  const notify = useNotify();
  const [selectedForecast, setSelectedForecast] = useState<AtRiskItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [minConfidence, setMinConfidence] = useState<number>(0.1);

  // Fetch at-risk items (these are forecasts for items at risk)
  const {
    data: atRiskData,
    isLoading: atRiskLoading,
    refetch: refetchAtRisk,
  } = useAtRiskItems({
    store_id: storeId || undefined,
    limit: 100,
    min_confidence: minConfidence,
  });

  // Enrich forecasts with store names from stores list
  const enrichedForecasts = useMemo(() => {
    if (!atRiskData?.results) return [];
    
    return atRiskData.results.map((forecast) => {
      const store = stores.find((s) => s.id === forecast.store_id);
      return {
        ...forecast,
        store_name: store?.name || `Store ${forecast.store_id}`,
        store_code: store?.code || "",
      };
    });
  }, [atRiskData, stores]);

  const filteredForecasts = useMemo(() => {
    if (!enrichedForecasts) return [];

    let filtered = enrichedForecasts;

    // Apply risk filter
    if (riskFilter !== "all") {
      filtered = filtered.filter((forecast) => {
        const days = forecast.days_until_stockout;
        if (days === null) return false;

        if (riskFilter === "high") {
          return days <= 7;
        } else if (riskFilter === "medium") {
          return days > 7 && days <= 14;
        } else if (riskFilter === "low") {
          return days > 14 && days <= 30;
        }
        return true;
      });
    }

    // Sort by days until stockout (most urgent first)
    return filtered.sort((a, b) => {
      const daysA = a.days_until_stockout ?? 999;
      const daysB = b.days_until_stockout ?? 999;
      return daysA - daysB;
    });
  }, [enrichedForecasts, riskFilter]);

  const handleForecastClick = (forecast: AtRiskItem) => {
    setSelectedForecast(forecast);
    setShowDetailModal(true);
  };

  const handleCloseDetail = () => {
    setShowDetailModal(false);
    setSelectedForecast(null);
  };

  const activeFiltersCount = (storeId ? 1 : 0) + (riskFilter !== "all" ? 1 : 0);

  const highRiskCount = filteredForecasts.filter(
    (f) => f.days_until_stockout !== null && f.days_until_stockout <= 7
  ).length;
  const mediumRiskCount = filteredForecasts.filter(
    (f) => f.days_until_stockout !== null && f.days_until_stockout > 7 && f.days_until_stockout <= 14
  ).length;
  const lowRiskCount = filteredForecasts.filter(
    (f) => f.days_until_stockout !== null && f.days_until_stockout > 14 && f.days_until_stockout <= 30
  ).length;

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Forecasting Dashboard"
        subtitle="Stockout predictions and reorder recommendations"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAtRisk()}
            disabled={atRiskLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${atRiskLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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
            setRiskFilter("all");
          }}
        >
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={onStoreChange}
            showAllStores={true}
          />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk (≤7 days)</option>
            <option value="medium">Medium Risk (8-14 days)</option>
            <option value="low">Low Risk (15-30 days)</option>
          </select>
          <select
            value={minConfidence.toString()}
            onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="0.1">Min Confidence: 10%</option>
            <option value="0.3">Min Confidence: 30%</option>
            <option value="0.5">Min Confidence: 50%</option>
            <option value="0.7">Min Confidence: 70%</option>
          </select>
        </FilterBar>
      </div>

      {/* Risk Summary */}
      {filteredForecasts.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-badge-error-border bg-badge-error-bg/10 p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-badge-error-text" />
              <span className="text-xs font-medium text-badge-error-text">High Risk</span>
            </div>
            <div className="text-2xl font-bold text-badge-error-text">{highRiskCount}</div>
            <div className="text-xs text-muted-foreground">≤7 days until stockout</div>
          </div>
          <div className="rounded-lg border border-badge-warning-border bg-badge-warning-bg/10 p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-badge-warning-text" />
              <span className="text-xs font-medium text-badge-warning-text">Medium Risk</span>
            </div>
            <div className="text-2xl font-bold text-badge-warning-text">{mediumRiskCount}</div>
            <div className="text-xs text-muted-foreground">8-14 days until stockout</div>
          </div>
          <div className="rounded-lg border border-badge-warning-border/50 bg-badge-warning-bg/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-badge-warning-text/70" />
              <span className="text-xs font-medium text-badge-warning-text/70">Low Risk</span>
            </div>
            <div className="text-2xl font-bold text-badge-warning-text/70">{lowRiskCount}</div>
            <div className="text-xs text-muted-foreground">15-30 days until stockout</div>
          </div>
        </div>
      )}

      {/* Forecasts Grid */}
      <div className="flex-1 overflow-y-auto">
        {atRiskLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <LoadingSkeleton key={i} variant="card" height={300} />
            ))}
          </div>
        ) : filteredForecasts.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No forecasts available"
            description={
              storeId
                ? "No items are at risk of stockout for the selected filters"
                : "Select a store to view forecasts"
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredForecasts.map((forecast) => (
              <ForecastCard
                key={`${forecast.variant_id}-${forecast.store_id}`}
                forecast={forecast}
                onClick={() => handleForecastClick(forecast)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Forecast Detail Modal */}
      <ForecastDetail
        open={showDetailModal}
        onClose={handleCloseDetail}
        forecast={selectedForecast}
      />
    </div>
  );
}

