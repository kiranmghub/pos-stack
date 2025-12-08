// pos-frontend/src/features/inventory/settings/ExportSettings.tsx
import React, { useState } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ExportModal } from "./ExportModal";
import { ExportHistory } from "./ExportHistory";
import { useExportTracking } from "../hooks/useExports";
import { StoreOption } from "../components/StoreFilter";
import { Download } from "lucide-react";

export interface ExportSettingsProps {
  /** Available stores */
  stores?: StoreOption[];
  /** Store ID filter (not used for exports, but kept for consistency) */
  storeId?: number | null;
  /** On store change handler (not used for exports) */
  onStoreChange?: (storeId: number | null) => void;
}

/**
 * ExportSettings - Main page for inventory data exports
 * Security: All operations are owner-only and tenant-scoped via API
 */
export function ExportSettings({ stores = [] }: ExportSettingsProps) {
  const [showExportModal, setShowExportModal] = useState(false);

  const {
    data: trackingData,
    isLoading: trackingLoading,
    refetch: refetchTracking,
  } = useExportTracking();

  const tracking = trackingData?.results || [];

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Data Exports"
        subtitle="Export your inventory data in CSV or JSON format"
        actions={
          <Button size="sm" onClick={() => setShowExportModal(true)}>
            <Download className="h-4 w-4 mr-2" />
            New Export
          </Button>
        }
      />

      <div className="flex-1 space-y-6 mt-6">
        {/* Export History */}
        <ExportHistory
          tracking={tracking}
          isLoading={trackingLoading}
          onRefresh={() => refetchTracking()}
        />
      </div>

      {/* Export Modal */}
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        stores={stores}
        onSuccess={() => {
          refetchTracking();
        }}
      />
    </div>
  );
}

