// pos-frontend/src/features/reports/components/ReportFilters.tsx
import React from "react";
import { DateRangePicker } from "./DateRangePicker";
import { ExportButton } from "./ExportButton";
import type { ReportBaseParams } from "../api/reports";

type StoreLite = { id: number; name: string; code?: string; is_active?: boolean };

interface ReportFiltersProps {
  storeId: string;
  setStoreId: (value: string) => void;
  stores: StoreLite[];
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onExportCSV?: () => void;
  exportLoading?: boolean;
}

/**
 * ReportFilters component for filtering reports by store and date range.
 * Includes export buttons for PDF, Excel, and CSV formats.
 */
export function ReportFilters({
  storeId,
  setStoreId,
  stores,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onExportPDF,
  onExportExcel,
  onExportCSV,
  exportLoading = false,
  reportType,
  exportParams,
}: ReportFiltersProps) {
  const hasExport = onExportPDF || onExportExcel || onExportCSV || (reportType && exportParams);

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr] lg:grid-cols-[1fr_2fr_auto]">
        {/* Store selector */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Store</label>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full rounded-md border border-border bg-background text-sm text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">All stores</option>
            {stores
              .filter((s) => s.is_active !== false)
              .map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""}
                </option>
              ))}
          </select>
        </div>

        {/* Date range picker */}
        <div>
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
        </div>

            {/* Export buttons */}
            {hasExport && (
              <div className="flex items-end gap-2">
                {reportType && exportParams ? (
                  <ExportButton reportType={reportType} params={exportParams} />
                ) : (
                  <>
                    {onExportPDF && (
                      <button
                        onClick={onExportPDF}
                        disabled={exportLoading}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {exportLoading ? "..." : "PDF"}
                      </button>
                    )}
                    {onExportExcel && (
                      <button
                        onClick={onExportExcel}
                        disabled={exportLoading}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {exportLoading ? "..." : "Excel"}
                      </button>
                    )}
                    {onExportCSV && (
                      <button
                        onClick={onExportCSV}
                        disabled={exportLoading}
                        className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {exportLoading ? "..." : "CSV"}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
      </div>
    </div>
  );
}

