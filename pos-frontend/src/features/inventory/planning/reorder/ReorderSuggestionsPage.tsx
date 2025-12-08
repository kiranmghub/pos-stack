// pos-frontend/src/features/inventory/planning/reorder/ReorderSuggestionsPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../../components/FilterBar";
import { StoreFilter, type StoreOption } from "../../components/StoreFilter";
import { SuggestionCard } from "./SuggestionCard";
import { CreatePOFromSuggestions } from "./CreatePOFromSuggestions";
import { useReorderSuggestionsList } from "../../hooks/useReorderSuggestions";
import { ReorderSuggestion } from "../../api/reorderSuggestions";
import { Package, ShoppingCart } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { LoadingSkeleton, EmptyState } from "../../components";
import { DataTablePagination } from "../../components/DataTable";

export interface ReorderSuggestionsPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID filter (null for "All Stores") */
  storeId: number | null;
  /** On store change handler */
  onStoreChange: (storeId: number | null) => void;
}

/**
 * ReorderSuggestionsPage - Main page for viewing reorder suggestions
 * Security: All operations are tenant-scoped via API
 */
export function ReorderSuggestionsPage({
  stores,
  storeId,
  onStoreChange,
}: ReorderSuggestionsPageProps) {
  const notify = useNotify();
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 24;

  // Fetch reorder suggestions
  const { data: suggestionsData, isLoading: suggestionsLoading } = useReorderSuggestionsList({
    store_id: storeId || undefined,
    page,
    page_size: pageSize,
  });

  const filteredSuggestions = useMemo(() => {
    if (!suggestionsData?.results) return [];
    return suggestionsData.results;
  }, [suggestionsData]);

  const handleSelectSuggestion = (variantId: number, selected: boolean) => {
    const newSelected = new Set(selectedSuggestions);
    if (selected) {
      newSelected.add(variantId);
    } else {
      newSelected.delete(variantId);
    }
    setSelectedSuggestions(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSuggestions.size === filteredSuggestions.length) {
      setSelectedSuggestions(new Set());
    } else {
      setSelectedSuggestions(new Set(filteredSuggestions.map((s) => s.variant_id)));
    }
  };

  const handleCreatePO = () => {
    if (selectedSuggestions.size === 0) {
      notify.error("Please select at least one suggestion");
      return;
    }
    setShowCreatePOModal(true);
  };

  const handleCreatePOSuccess = () => {
    setSelectedSuggestions(new Set());
    setShowCreatePOModal(false);
  };

  const selectedSuggestionsList = useMemo(() => {
    return filteredSuggestions.filter((s) => selectedSuggestions.has(s.variant_id));
  }, [filteredSuggestions, selectedSuggestions]);

  const activeFiltersCount = storeId ? 1 : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Reorder Suggestions"
        subtitle="Low-stock items that need reordering"
        actions={
          selectedSuggestions.size > 0 && (
            <Button onClick={handleCreatePO}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Create PO ({selectedSuggestions.size})
            </Button>
          )
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

      {/* Selection Bar */}
      {filteredSuggestions.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
            >
              {selectedSuggestions.size === filteredSuggestions.length
                ? "Deselect All"
                : "Select All"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedSuggestions.size} of {filteredSuggestions.length} selected
            </span>
          </div>
          {selectedSuggestions.size > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSelectedSuggestions(new Set())}>
              Clear Selection
            </Button>
          )}
        </div>
      )}

      {/* Suggestions Grid */}
      <div className="flex-1 overflow-y-auto">
        {suggestionsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <LoadingSkeleton key={i} variant="card" height={200} />
            ))}
          </div>
        ) : filteredSuggestions.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No reorder suggestions"
            description={
              storeId
                ? "All items are well-stocked"
                : "Select a store to view reorder suggestions"
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuggestions.map((suggestion) => (
              <SuggestionCard
                key={`${suggestion.variant_id}-${suggestion.store_id}`}
                suggestion={suggestion}
                selected={selectedSuggestions.has(suggestion.variant_id)}
                onSelectChange={(selected) =>
                  handleSelectSuggestion(suggestion.variant_id, selected)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {suggestionsData && suggestionsData.count > 0 && (
        <div className="mt-4">
          <DataTablePagination
            page={page}
            lastPage={Math.ceil(suggestionsData.count / pageSize)}
            pageSize={pageSize}
            count={suggestionsData.count}
            onPageChange={setPage}
            onPageSizeChange={() => {}} // Not implemented for now
          />
        </div>
      )}

      {/* Create PO Modal */}
      <CreatePOFromSuggestions
        open={showCreatePOModal}
        onClose={() => setShowCreatePOModal(false)}
        suggestions={selectedSuggestionsList}
        stores={stores}
        onSuccess={handleCreatePOSuccess}
      />
    </div>
  );
}

