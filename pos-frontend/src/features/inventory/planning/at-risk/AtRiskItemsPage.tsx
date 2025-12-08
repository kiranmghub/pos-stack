// pos-frontend/src/features/inventory/planning/at-risk/AtRiskItemsPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter, type StoreOption } from "../../components/StoreFilter";
import { RiskItemCard } from "./RiskItemCard";
import { StockoutTimeline } from "./StockoutTimeline";
import { ForecastDetail } from "../forecasting/ForecastDetail";
import { CreatePOFromSuggestions } from "../reorder/CreatePOFromSuggestions";
import { useAtRiskItems } from "../../hooks/useForecasting";
import { AtRiskItem } from "../../api/forecasting";
import { AlertTriangle, RefreshCw, ShoppingCart, List, Calendar } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { LoadingSkeleton, EmptyState } from "../../components";

export interface AtRiskItemsPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID filter (null for "All Stores") */
  storeId: number | null;
  /** On store change handler */
  onStoreChange: (storeId: number | null) => void;
}

/**
 * AtRiskItemsPage - Action-focused dashboard for items at risk of stockout
 * Security: All operations are tenant-scoped via API
 */
export function AtRiskItemsPage({
  stores,
  storeId,
  onStoreChange,
}: AtRiskItemsPageProps) {
  const notify = useNotify();
  const [selectedForecast, setSelectedForecast] = useState<AtRiskItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [selectedItemForPO, setSelectedItemForPO] = useState<AtRiskItem | null>(null);
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [minConfidence, setMinConfidence] = useState<number>(0.1);

  // Fetch at-risk items
  const {
    data: atRiskData,
    isLoading: atRiskLoading,
    refetch: refetchAtRisk,
  } = useAtRiskItems({
    store_id: storeId || undefined,
    limit: 200,
    min_confidence: minConfidence,
  });

  // Enrich forecasts with store names from stores list
  const enrichedItems = useMemo(() => {
    if (!atRiskData?.results) return [];

    return atRiskData.results.map((item) => {
      const store = stores.find((s) => s.id === item.store_id);
      return {
        ...item,
        store_name: store?.name || `Store ${item.store_id}`,
        store_code: store?.code || "",
      };
    });
  }, [atRiskData, stores]);

  const filteredItems = useMemo(() => {
    if (!enrichedItems) return [];

    let filtered = enrichedItems;

    // Apply risk filter
    if (riskFilter !== "all") {
      filtered = filtered.filter((item) => {
        const days = item.days_until_stockout;
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
  }, [enrichedItems, riskFilter]);

  const handleCreatePO = (item: AtRiskItem) => {
    setSelectedItemForPO(item);
    setShowCreatePOModal(true);
  };

  const handleViewDetails = (item: AtRiskItem) => {
    setSelectedForecast(item);
    setShowDetailModal(true);
  };

  const handleCloseDetail = () => {
    setShowDetailModal(false);
    setSelectedForecast(null);
  };

  const handleCreatePOSuccess = () => {
    setShowCreatePOModal(false);
    setSelectedItemForPO(null);
    refetchAtRisk();
  };

  const activeFiltersCount = (storeId ? 1 : 0) + (riskFilter !== "all" ? 1 : 0);

  const highRiskCount = filteredItems.filter(
    (item) => item.days_until_stockout !== null && item.days_until_stockout <= 7
  ).length;
  const mediumRiskCount = filteredItems.filter(
    (item) =>
      item.days_until_stockout !== null &&
      item.days_until_stockout > 7 &&
      item.days_until_stockout <= 14
  ).length;
  const lowRiskCount = filteredItems.filter(
    (item) =>
      item.days_until_stockout !== null &&
      item.days_until_stockout > 14 &&
      item.days_until_stockout <= 30
  ).length;

  // Convert selected item to suggestion format for PO creation
  const poSuggestion = selectedItemForPO
    ? {
        variant_id: selectedItemForPO.variant_id,
        product_name: selectedItemForPO.product_name || "",
        sku: selectedItemForPO.sku || null,
        store_id: selectedItemForPO.store_id,
        store_name: selectedItemForPO.store_name || `Store ${selectedItemForPO.store_id}`,
        store_code: selectedItemForPO.store_code || "",
        on_hand: selectedItemForPO.current_on_hand,
        reorder_point: null,
        threshold: 0,
        suggested_qty: selectedItemForPO.recommended_order_qty,
      }
    : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="At-Risk Items"
        subtitle="Items predicted to stock out - take action now"
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
          <div className="flex items-center gap-2 border-l border-border pl-2">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4 mr-2" />
              List
            </Button>
            <Button
              variant={viewMode === "timeline" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("timeline")}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Timeline
            </Button>
          </div>
        </FilterBar>
      </div>

      {/* Risk Summary */}
      {filteredItems.length > 0 && (
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

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {atRiskLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <LoadingSkeleton key={i} variant="card" height={300} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No at-risk items"
            description={
              storeId
                ? "No items are at risk of stockout for the selected filters"
                : "Select a store to view at-risk items"
            }
          />
        ) : viewMode === "timeline" ? (
          <div className="space-y-4">
            <StockoutTimeline items={filteredItems} days={30} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {filteredItems.map((item) => (
                <RiskItemCard
                  key={`${item.variant_id}-${item.store_id}`}
                  item={item}
                  onCreatePO={() => handleCreatePO(item)}
                  onViewDetails={() => handleViewDetails(item)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <RiskItemCard
                key={`${item.variant_id}-${item.store_id}`}
                item={item}
                onCreatePO={() => handleCreatePO(item)}
                onViewDetails={() => handleViewDetails(item)}
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

      {/* Create PO Modal */}
      {poSuggestion && (
        <CreatePOFromSuggestions
          open={showCreatePOModal}
          onClose={() => {
            setShowCreatePOModal(false);
            setSelectedItemForPO(null);
          }}
          suggestions={[poSuggestion]}
          stores={stores}
          onSuccess={handleCreatePOSuccess}
        />
      )}
    </div>
  );
}

