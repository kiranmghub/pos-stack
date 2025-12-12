// pos-frontend/src/features/reports/components/ExportButton.tsx
import React, { useState } from "react";
import { Download, FileText, FileSpreadsheet, File } from "lucide-react";
import { exportReport, type ReportBaseParams } from "../api/reports";

type ReportType = "sales" | "products" | "financial" | "customers" | "employees" | "returns";
type ExportFormat = "pdf" | "excel" | "csv";

interface ExportButtonProps {
  reportType: ReportType;
  params: ReportBaseParams & {
    limit?: number;
    sort_by?: string;
    group_by?: string;
    status?: string;
    page?: number;
    page_size?: number;
  };
}

/**
 * ExportButton component for exporting reports in PDF, Excel, or CSV format.
 * Provides a dropdown menu with format options.
 */
export function ExportButton({ reportType, params }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>("");

  const handleExport = async (format: ExportFormat) => {
    try {
      setIsExporting(true);
      setError("");
      await exportReport({
        report_type: reportType,
        format,
        params,
      });
    } catch (err: any) {
      setError(err?.message || "Export failed. Please try again.");
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleExport("pdf")}
          disabled={isExporting}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
        >
          <FileText className="h-3.5 w-3.5" />
          {isExporting ? "..." : "PDF"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("excel")}
          disabled={isExporting}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {isExporting ? "..." : "Excel"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("csv")}
          disabled={isExporting}
          className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
        >
          <File className="h-3.5 w-3.5" />
          {isExporting ? "..." : "CSV"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

