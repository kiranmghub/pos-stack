// pos-frontend/src/features/inventory/settings/ExportModal.tsx
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExportType,
  ExportFormat,
  DeltaExportType,
  ExportSnapshotRequest,
  ExportDeltaRequest,
} from "../api/exports";
import { useExportSnapshot, useExportDelta } from "../hooks/useExports";
import { StoreFilter } from "../components/StoreFilter";
import { StoreOption } from "../components/StoreFilter";
import { ArrowRight, ArrowLeft, Download } from "lucide-react";

export interface ExportModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Available stores */
  stores: StoreOption[];
  /** On success callback */
  onSuccess?: () => void;
}

const DELTA_EXPORT_TYPES: Array<{ value: DeltaExportType; label: string }> = [
  { value: "ledger", label: "Stock Ledger" },
  { value: "transfers", label: "Transfers" },
  { value: "counts", label: "Count Sessions" },
  { value: "purchase_orders", label: "Purchase Orders" },
];

/**
 * ExportModal - Multi-step wizard for exporting inventory data
 * Security: All operations are owner-only and tenant-scoped via API
 */
export function ExportModal({ open, onClose, stores, onSuccess }: ExportModalProps) {
  const exportSnapshotMutation = useExportSnapshot();
  const exportDeltaMutation = useExportDelta();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [exportType, setExportType] = useState<ExportType>("snapshot");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [storeId, setStoreId] = useState<number | null>(null);
  const [includeLedger, setIncludeLedger] = useState(true);
  const [deltaType, setDeltaType] = useState<DeltaExportType>("ledger");
  const [resetTracking, setResetTracking] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setStep(1);
      setExportType("snapshot");
      setFormat("csv");
      setStoreId(null);
      setIncludeLedger(true);
      setDeltaType("ledger");
      setResetTracking(false);
    }
  }, [open]);

  const handleNext = () => {
    if (step < 4) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleSubmit = async () => {
    try {
      if (exportType === "snapshot") {
        const payload: ExportSnapshotRequest = {
          format,
          store_id: storeId || undefined,
          include_ledger: includeLedger,
        };
        await exportSnapshotMutation.mutateAsync(payload);
      } else {
        const payload: ExportDeltaRequest = {
          type: deltaType,
          format,
          store_id: storeId || undefined,
          reset: resetTracking,
        };
        await exportDeltaMutation.mutateAsync(payload);
      }
      onSuccess?.();
      onClose();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const isLoading = exportSnapshotMutation.isPending || exportDeltaMutation.isPending;

  const canProceed = () => {
    if (step === 1) return true; // Export type selected
    if (step === 2) {
      if (exportType === "delta") return true; // Delta type selected
      return true; // Snapshot always proceeds
    }
    if (step === 3) return true; // Format selected
    if (step === 4) return true; // Review
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Inventory Data</DialogTitle>
          <DialogDescription>
            Export your inventory data in CSV or JSON format
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6">
          {[1, 2, 3, 4].map((s) => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  step >= s
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 4 && (
                <div
                  className={`flex-1 h-0.5 ${
                    step > s ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Export Type */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Export Type</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Choose between a full snapshot or incremental delta export
              </p>
            </div>
            <RadioGroup value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
              <div className="flex items-center space-x-2 p-4 rounded-lg border border-border hover:bg-accent/50">
                <RadioGroupItem value="snapshot" id="snapshot" />
                <Label htmlFor="snapshot" className="flex-1 cursor-pointer">
                  <div className="font-medium">Full Snapshot</div>
                  <div className="text-sm text-muted-foreground">
                    Export all inventory data (items, ledger, transfers, counts, purchase orders)
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-4 rounded-lg border border-border hover:bg-accent/50">
                <RadioGroupItem value="delta" id="delta" />
                <Label htmlFor="delta" className="flex-1 cursor-pointer">
                  <div className="font-medium">Delta Export</div>
                  <div className="text-sm text-muted-foreground">
                    Export only new/changed records since last export
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Step 2: Delta Type (if delta) or Filters (if snapshot) */}
        {step === 2 && (
          <div className="space-y-4">
            {exportType === "delta" ? (
              <>
                <div>
                  <Label className="text-base font-semibold">Data Type</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select which type of data to export
                  </p>
                </div>
                <RadioGroup
                  value={deltaType}
                  onValueChange={(v) => setDeltaType(v as DeltaExportType)}
                >
                  {DELTA_EXPORT_TYPES.map((type) => (
                    <div
                      key={type.value}
                      className="flex items-center space-x-2 p-4 rounded-lg border border-border hover:bg-accent/50"
                    >
                      <RadioGroupItem value={type.value} id={type.value} />
                      <Label htmlFor={type.value} className="flex-1 cursor-pointer">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <div className="flex items-center space-x-2 p-3 rounded-lg border border-border bg-muted/50">
                  <Checkbox
                    id="reset"
                    checked={resetTracking}
                    onCheckedChange={(checked) => setResetTracking(checked === true)}
                  />
                  <Label htmlFor="reset" className="cursor-pointer">
                    Reset export tracking (start from beginning)
                  </Label>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-base font-semibold">Filters</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Optionally filter by store
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="store">Store (Optional)</Label>
                    <StoreFilter
                      stores={stores}
                      selectedStoreId={storeId}
                      onStoreChange={setStoreId}
                      showAllStores={true}
                      required={false}
                    />
                  </div>
                  <div className="flex items-center space-x-2 p-3 rounded-lg border border-border bg-muted/50">
                    <Checkbox
                      id="include-ledger"
                      checked={includeLedger}
                      onCheckedChange={(checked) => setIncludeLedger(checked === true)}
                    />
                    <Label htmlFor="include-ledger" className="cursor-pointer">
                      Include stock ledger entries
                    </Label>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Format & Store Filter */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Export Format</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Choose the file format for your export
              </p>
            </div>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <div className="flex items-center space-x-2 p-4 rounded-lg border border-border hover:bg-accent/50">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex-1 cursor-pointer">
                  <div className="font-medium">CSV</div>
                  <div className="text-sm text-muted-foreground">
                    Comma-separated values (Excel compatible)
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-4 rounded-lg border border-border hover:bg-accent/50">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="flex-1 cursor-pointer">
                  <div className="font-medium">JSON</div>
                  <div className="text-sm text-muted-foreground">
                    JavaScript Object Notation (structured data)
                  </div>
                </Label>
              </div>
            </RadioGroup>
            {exportType === "delta" && (
              <div className="mt-4">
                <Label htmlFor="store-delta">Store (Optional)</Label>
                <StoreFilter
                  stores={stores}
                  selectedStoreId={storeId}
                  onStoreChange={setStoreId}
                  showAllStores={true}
                  required={false}
                />
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Review Export Settings</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Review your export configuration before proceeding
              </p>
            </div>
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/50">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Export Type:</span>
                <span className="text-sm font-medium text-foreground">
                  {exportType === "snapshot" ? "Full Snapshot" : "Delta Export"}
                </span>
              </div>
              {exportType === "delta" && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Data Type:</span>
                  <span className="text-sm font-medium text-foreground">
                    {DELTA_EXPORT_TYPES.find((t) => t.value === deltaType)?.label}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Format:</span>
                <span className="text-sm font-medium text-foreground uppercase">{format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Store:</span>
                <span className="text-sm font-medium text-foreground">
                  {storeId
                    ? stores.find((s) => s.id === storeId)?.name || "All Stores"
                    : "All Stores"}
                </span>
              </div>
              {exportType === "snapshot" && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Include Ledger:</span>
                  <span className="text-sm font-medium text-foreground">
                    {includeLedger ? "Yes" : "No"}
                  </span>
                </div>
              )}
              {exportType === "delta" && resetTracking && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Reset Tracking:</span>
                  <span className="text-sm font-medium text-foreground">Yes</span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <div className="flex justify-between w-full">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 1 || isLoading}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              {step < 4 ? (
                <Button type="button" onClick={handleNext} disabled={!canProceed() || isLoading}>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={isLoading}>
                  <Download className="h-4 w-4 mr-2" />
                  {isLoading ? "Exporting..." : "Export"}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

