// pos-frontend/src/features/documents/components/DocumentFilters.tsx
import React from "react";

interface DocumentFiltersProps {
  search: string;
  docType: string;
  ordering: string;
  availableDocTypes: string[];
  onSearchChange: (value: string) => void;
  onDocTypeChange: (value: string) => void;
  onOrderingChange: (value: string) => void;
}

export function DocumentFilters({
  search,
  docType,
  ordering,
  availableDocTypes,
  onSearchChange,
  onDocTypeChange,
  onOrderingChange,
}: DocumentFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Search
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by label or description..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Document Type Filter */}
      <div className="min-w-[180px]">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Document Type
        </label>
        <select
          value={docType}
          onChange={(e) => onDocTypeChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Types</option>
          {availableDocTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* Ordering */}
      <div className="min-w-[180px]">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Sort By
        </label>
        <select
          value={ordering}
          onChange={(e) => onOrderingChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="-created_at">Newest First</option>
          <option value="created_at">Oldest First</option>
          <option value="label">Label (A-Z)</option>
          <option value="-label">Label (Z-A)</option>
        </select>
      </div>
    </div>
  );
}

