// pos-frontend/src/features/inventory/planning/health/InventoryHealthPage.tsx
import React, { useState } from "react";
import { PageHeading } from "@/components/AppShell";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter, type StoreOption } from "../../components/StoreFilter";
import { HealthSummary } from "./HealthSummary";
import { ShrinkageReport } from "./ShrinkageReport";
import { AgingReport } from "./AgingReport";
import { CoverageReport } from "./CoverageReport";
import {
  useInventoryHealthSummary,
  useShrinkageReport,
  useAgingReport,
  useCoverageReport,
} from "../../hooks/useHealth";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface InventoryHealthPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID filter (null for "All Stores") */
  storeId: number | null;
  /** On store change handler */
  onStoreChange: (storeId: number | null) => void;
}

/**
 * InventoryHealthPage - Main inventory health analytics page
 * Security: All operations are tenant-scoped via API
 */
export function InventoryHealthPage({
  stores,
  storeId,
  onStoreChange,
}: InventoryHealthPageProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "shrinkage" | "aging" | "coverage">(
    "summary"
  );
  const [daysBack, setDaysBack] = useState<number>(90);
  const [agingDays, setAgingDays] = useState<number>(90);

  // Fetch health summary
  const {
    data: healthSummary,
    isLoading: healthSummaryLoading,
    refetch: refetchHealthSummary,
  } = useInventoryHealthSummary({
    store_id: storeId || undefined,
    days_back: daysBack,
    aging_days: agingDays,
  });

  // Fetch individual reports
  const {
    data: shrinkageReport,
    isLoading: shrinkageLoading,
    refetch: refetchShrinkage,
  } = useShrinkageReport({
    store_id: storeId || undefined,
    days_back: daysBack,
  });

  const {
    data: agingReport,
    isLoading: agingLoading,
    refetch: refetchAging,
  } = useAgingReport({
    store_id: storeId || undefined,
    days_no_sales: agingDays,
  });

  const {
    data: coverageReport,
    isLoading: coverageLoading,
    refetch: refetchCoverage,
  } = useCoverageReport({
    store_id: storeId || undefined,
    days_back: daysBack,
  });

  const handleRefresh = () => {
    refetchHealthSummary();
    refetchShrinkage();
    refetchAging();
    refetchCoverage();
  };

  const isLoading =
    activeTab === "summary"
      ? healthSummaryLoading
      : activeTab === "shrinkage"
      ? shrinkageLoading
      : activeTab === "aging"
      ? agingLoading
      : coverageLoading;

  const activeFiltersCount = (storeId ? 1 : 0) + (daysBack !== 90 ? 1 : 0) + (agingDays !== 90 ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Inventory Health"
        subtitle="Comprehensive inventory health analytics and reports"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
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
            setDaysBack(90);
            setAgingDays(90);
          }}
        >
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={onStoreChange}
            showAllStores={true}
          />
          <select
            value={daysBack.toString()}
            onChange={(e) => setDaysBack(parseInt(e.target.value, 10))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
            <option value="365">Last 365 days</option>
          </select>
          <select
            value={agingDays.toString()}
            onChange={(e) => setAgingDays(parseInt(e.target.value, 10))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="30">Aging: 30 days</option>
            <option value="60">Aging: 60 days</option>
            <option value="90">Aging: 90 days</option>
            <option value="180">Aging: 180 days</option>
            <option value="365">Aging: 365 days</option>
          </select>
        </FilterBar>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="mb-6">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="shrinkage">Shrinkage</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="flex-1 overflow-y-auto">
          {healthSummary ? (
            <HealthSummary summary={healthSummary} />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading health summary...</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shrinkage" className="flex-1 overflow-y-auto">
          <ShrinkageReport report={shrinkageReport || null} isLoading={shrinkageLoading} />
        </TabsContent>

        <TabsContent value="aging" className="flex-1 overflow-y-auto">
          <AgingReport report={agingReport || null} isLoading={agingLoading} />
        </TabsContent>

        <TabsContent value="coverage" className="flex-1 overflow-y-auto">
          <CoverageReport report={coverageReport || null} isLoading={coverageLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

