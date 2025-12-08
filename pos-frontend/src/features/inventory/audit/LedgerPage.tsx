// pos-frontend/src/features/inventory/audit/LedgerPage.tsx
import React, { useState, useMemo } from "react";
import { useLedgerList } from "../hooks/useLedger";
import { LedgerFilters } from "./LedgerFilters";
import { LedgerTable } from "./LedgerTable";
import { LedgerTimeline } from "./LedgerTimeline";
import { LedgerFilterPresets, type FilterPreset } from "./LedgerFilterPresets";
import { LedgerDetailModal } from "./LedgerDetailModal";
import { DataTablePagination, EmptyState, LoadingSkeleton } from "../components";
import { exportLedgerToCSV, exportLedgerToJSON, type LedgerEntry } from "../api/ledger";
import { type StoreOption } from "../components/StoreFilter";
import { Download, FileText, FileJson, List, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LedgerPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Selected store ID (null = "All Stores") */
  storeId: number | null;
  /** Store change handler */
  onStoreChange: (storeId: number | null) => void;
}

/**
 * LedgerPage - Enhanced ledger viewer with advanced filtering and export
 * Security: All operations are tenant-scoped via API
 */
export function LedgerPage({
  stores,
  storeId,
  onStoreChange,
}: LedgerPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRefTypes, setSelectedRefTypes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [refId, setRefId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");

  // Build API params
  const apiParams = useMemo(() => {
    const params: any = {
      store_id: storeId,
      page,
      page_size: pageSize,
    };

    if (searchQuery.trim()) {
      params.q = searchQuery.trim();
    }

    if (selectedRefTypes.length > 0) {
      // If multiple ref types selected, we need to handle this differently
      // For now, we'll use the first one (backend supports single ref_type)
      // TODO: Backend enhancement to support multiple ref_types
      params.ref_type = selectedRefTypes[0];
    }

    if (dateFrom) {
      params.date_from = dateFrom;
    }

    if (dateTo) {
      params.date_to = dateTo;
    }

    if (variantId) {
      params.variant_id = variantId;
    }

    if (refId) {
      params.ref_id = refId;
    }

    return params;
  }, [storeId, searchQuery, selectedRefTypes, dateFrom, dateTo, variantId, refId, page, pageSize]);

  // Fetch ledger data
  const {
    data: ledgerData,
    isLoading,
    error,
  } = useLedgerList(apiParams);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (selectedRefTypes.length > 0) count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    if (variantId) count++;
    if (refId) count++;
    return count;
  }, [searchQuery, selectedRefTypes, dateFrom, dateTo, variantId, refId]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedRefTypes([]);
    setDateFrom(null);
    setDateTo(null);
    setVariantId(null);
    setRefId(null);
    setPage(1);
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    setStoreId(preset.filters.storeId);
    setSearchQuery(preset.filters.searchQuery);
    setSelectedRefTypes(preset.filters.selectedRefTypes);
    setDateFrom(preset.filters.dateFrom);
    setDateTo(preset.filters.dateTo);
    setVariantId(preset.filters.variantId);
    setRefId(preset.filters.refId);
    setPage(1);
  };

  const handleSavePreset = (name: string, filters: FilterPreset["filters"]) => {
    // Preset is saved in localStorage by LedgerFilterPresets component
    // This handler is called for any side effects if needed
    console.log("Preset saved:", name, filters);
  };

  const handleDeletePreset = (presetId: string) => {
    // Preset is deleted from localStorage by LedgerFilterPresets component
    // This handler is called for any side effects if needed
    console.log("Preset deleted:", presetId);
  };

  const currentFilters = useMemo(() => ({
    storeId,
    searchQuery,
    selectedRefTypes,
    dateFrom,
    dateTo,
    variantId,
    refId,
  }), [storeId, searchQuery, selectedRefTypes, dateFrom, dateTo, variantId, refId]);

  const handleExport = async (format: "csv" | "json") => {
    try {
      setExporting(true);
      const blob = format === "csv"
        ? await exportLedgerToCSV(apiParams)
        : await exportLedgerToJSON(apiParams);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      a.download = `ledger-export-${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export ledger. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const lastPage = ledgerData
    ? Math.max(1, Math.ceil(ledgerData.count / pageSize))
    : 1;

  if (error) {
    return (
      <EmptyState
        variant="error"
        title="Failed to load ledger"
        description="Please try again or contact support if the problem persists."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <LedgerFilters
        stores={stores}
        storeId={storeId}
        onStoreChange={onStoreChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedRefTypes={selectedRefTypes}
        onRefTypesChange={setSelectedRefTypes}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        variantId={variantId}
        onVariantIdChange={setVariantId}
        refId={refId}
        onRefIdChange={setRefId}
        activeFilterCount={activeFilterCount}
        onClear={handleClearFilters}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {ledgerData ? (
              <>
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, ledgerData.count)} of {ledgerData.count} entries
              </>
            ) : (
              "Loading..."
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-8"
            >
              <List className="h-4 w-4 mr-1" />
              Table
            </Button>
            <Button
              variant={viewMode === "timeline" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("timeline")}
              className="h-8"
            >
              <Clock className="h-4 w-4 mr-1" />
              Timeline
            </Button>
          </div>

          {/* Filter Presets */}
          <LedgerFilterPresets
            currentFilters={currentFilters}
            onApplyPreset={handleApplyPreset}
            onSavePreset={handleSavePreset}
            onDeletePreset={handleDeletePreset}
          />

          {/* Export Buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
            disabled={exporting || isLoading}
          >
            <FileText className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("json")}
            disabled={exporting || isLoading}
          >
            <FileJson className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Table or Timeline View */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" height={60} />
          ))}
        </div>
      ) : (
        <>
          {viewMode === "table" ? (
            <>
              <LedgerTable
                entries={ledgerData?.results || []}
                loading={isLoading}
                onEntryClick={setSelectedEntry}
              />

              {/* Pagination */}
              {ledgerData && ledgerData.count > 0 && (
                <DataTablePagination
                  page={page}
                  lastPage={lastPage}
                  pageSize={pageSize}
                  count={ledgerData.count}
                  onPageChange={setPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                />
              )}
            </>
          ) : (
            <div className="rounded-lg border border-border bg-card p-6">
              <LedgerTimeline
                entries={ledgerData?.results || []}
                loading={isLoading}
                onEntryClick={setSelectedEntry}
              />
              {/* Pagination for timeline view */}
              {ledgerData && ledgerData.count > 0 && (
                <div className="mt-6 pt-6 border-t border-border">
                  <DataTablePagination
                    page={page}
                    lastPage={lastPage}
                    pageSize={pageSize}
                    count={ledgerData.count}
                    onPageChange={setPage}
                    onPageSizeChange={(newSize) => {
                      setPageSize(newSize);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      <LedgerDetailModal
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}

