// pos-frontend/src/features/inventory/operations/purchase-orders/ReceiveExternalPOModal.tsx
import React, { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, X, AlertCircle, CheckCircle2, Download, Plus, Minus, ChevronRight } from "lucide-react";
import { useReceiveExternalPO, useVendorsList } from "../../hooks/usePurchaseOrders";
import { type StoreOption } from "../../components/StoreFilter";
import { VendorSelector } from "./VendorSelector";
import { useNotify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export interface ReceiveExternalPOModalProps {
  /** Open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Available stores */
  stores: StoreOption[];
  /** Default store ID */
  defaultStoreId?: number | null;
  /** On success callback */
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3;

interface ManualLine {
  variant_id: number;
  sku: string;
  product_name: string;
  qty: number;
  unit_cost: string;
  notes?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

/**
 * ReceiveExternalPOModal - Multi-step wizard for receiving external purchase orders
 * Supports CSV upload or manual entry
 * Security: All operations are tenant-scoped via API
 */
export function ReceiveExternalPOModal({
  open,
  onClose,
  stores,
  defaultStoreId,
  onSuccess,
}: ReceiveExternalPOModalProps) {
  const notify = useNotify();
  const [step, setStep] = useState<Step>(1);
  const [storeId, setStoreId] = useState<number | null>(defaultStoreId || null);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [externalPONumber, setExternalPONumber] = useState("");
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [vendorInvoiceDate, setVendorInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  
  // File uploads
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  
  // Tab state for Step 2
  const [activeTab, setActiveTab] = useState<"csv" | "manual">("manual");
  
  // Manual entry mode
  const [manualLines, setManualLines] = useState<ManualLine[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<{ id: number; sku: string; product_name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ 
    id: number; 
    sku: string; 
    product_name: string;
    on_hand?: number;
    reorder_point?: number | null;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [qtyInput, setQtyInput] = useState("");
  const [costInput, setCostInput] = useState("");
  const [lineNotes, setLineNotes] = useState("");
  
  // Response data
  const [responseData, setResponseData] = useState<any>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const receiveMutation = useReceiveExternalPO();
  const { data: vendorsData } = useVendorsList({ page_size: 100 });

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setStoreId(defaultStoreId || null);
      setVendorId(null);
      setExternalPONumber("");
      setVendorInvoiceNumber("");
      setVendorInvoiceDate("");
      setNotes("");
      setCsvFile(null);
      setInvoiceFile(null);
      setManualLines([]);
      setSelectedVariantId(null);
      setSelectedVariant(null);
      setSearchQuery("");
      setSearchResults([]);
      setQtyInput("");
      setCostInput("");
      setLineNotes("");
      setResponseData(null);
      setErrors([]);
      setActiveTab("manual"); // Reset to manual tab
    }
  }, [open, defaultStoreId]);

  // Search variants
  React.useEffect(() => {
    if (!searchQuery.trim() || step !== 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("q", searchQuery.trim());
        params.append("limit", "20");
        // Include store_id if available to get store-specific stock
        if (storeId) {
          params.append("store_id", storeId.toString());
        }
        const { apiFetchJSON } = await import("@/lib/auth");
        const data = await apiFetchJSON(`/api/v1/catalog/variants?${params.toString()}`) as any;
        // Handle both array and paginated response formats
        const results = Array.isArray(data) ? data : (data.results || data.items || []);
        setSearchResults(results.map((v: any) => {
          // Safely extract fields with proper type checking
          const onHand = v.on_hand;
          const reorderPoint = v.reorder_point;
          
          return {
            id: v.id,
            sku: v.sku || "",
            product_name: v.product_name || v.name || "",
            on_hand: typeof onHand === "number" ? onHand : (typeof onHand === "string" ? parseInt(onHand, 10) : undefined),
            reorder_point: reorderPoint !== undefined && reorderPoint !== null 
              ? (typeof reorderPoint === "number" ? reorderPoint : parseInt(String(reorderPoint), 10))
              : undefined,
          };
        }));
      } catch (err) {
        console.error("Failed to search variants:", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, step, storeId]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: "csv" | "invoice") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      notify.error(`File size exceeds 10MB limit`);
      return;
    }

    // Validate file type
    if (type === "csv") {
      const validExtensions = [".csv", ".txt"];
      const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!validExtensions.includes(extension)) {
        notify.error("Please select a CSV file (.csv or .txt)");
        return;
      }
      setCsvFile(file);
    } else {
      const validExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".tiff", ".bmp"];
      const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!validExtensions.includes(extension)) {
        notify.error("Please select a PDF or image file for the invoice");
        return;
      }
      setInvoiceFile(file);
    }
  }, [notify]);

  const handleAddManualLine = useCallback(() => {
    if (!selectedVariantId || !selectedVariant) {
      notify.error("Please select a variant");
      return;
    }

    const qty = parseInt(qtyInput);
    const cost = parseFloat(costInput || "0");

    if (isNaN(qty) || qty <= 0) {
      notify.error("Please enter a valid positive quantity");
      return;
    }

    if (isNaN(cost) || cost < 0) {
      notify.error("Please enter a valid non-negative unit cost");
      return;
    }

    // Check if variant already added
    if (manualLines.some((l) => l.variant_id === selectedVariantId)) {
      notify.error("This variant is already in the list");
      return;
    }

    setManualLines([
      ...manualLines,
      {
        variant_id: selectedVariantId,
        sku: selectedVariant.sku,
        product_name: selectedVariant.product_name,
        qty,
        unit_cost: cost.toFixed(2),
        notes: lineNotes.trim() || undefined,
      },
    ]);

    // Reset inputs
    setSelectedVariantId(null);
    setSelectedVariant(null);
    setQtyInput("");
    setCostInput("");
    setLineNotes("");
    setSearchQuery("");
  }, [selectedVariantId, selectedVariant, qtyInput, costInput, lineNotes, manualLines, notify]);

  const handleRemoveManualLine = useCallback((variantId: number) => {
    setManualLines(manualLines.filter((l) => l.variant_id !== variantId));
  }, [manualLines]);

  const validateStep1 = (): boolean => {
    const newErrors: ValidationError[] = [];

    if (!storeId) {
      newErrors.push({ field: "store_id", message: "Store is required" });
    }
    if (!vendorId) {
      newErrors.push({ field: "vendor_id", message: "Vendor is required" });
    }
    if (csvFile && !vendorInvoiceNumber.trim()) {
      newErrors.push({ field: "vendor_invoice_number", message: "Vendor invoice number is required when uploading CSV" });
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: ValidationError[] = [];

    if (csvFile) {
      // CSV mode - file is already validated
      if (!csvFile) {
        newErrors.push({ field: "file", message: "CSV file is required" });
      }
    } else {
      // Manual mode
      if (manualLines.length === 0) {
        newErrors.push({ field: "lines", message: "At least one line item is required" });
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
        setErrors([]);
      }
    } else if (step === 2) {
      if (validateStep2()) {
        setStep(3);
        setErrors([]);
      }
    }
  };

  const handleSubmit = async () => {
    if (!storeId || !vendorId) {
      notify.error("Store and vendor are required");
      return;
    }

    if (csvFile && !vendorInvoiceNumber.trim()) {
      notify.error("Vendor invoice number is required when uploading CSV");
      return;
    }

    if (!csvFile && manualLines.length === 0) {
      notify.error("Please add at least one line item");
      return;
    }

    try {
      const payload: any = {
        store_id: storeId,
        vendor_id: vendorId,
        external_po_number: externalPONumber.trim() || undefined,
        vendor_invoice_number: vendorInvoiceNumber.trim() || undefined,
        vendor_invoice_date: vendorInvoiceDate || undefined,
        notes: notes.trim() || undefined,
      };

      if (csvFile) {
        payload.file = csvFile;
      } else {
        payload.lines = manualLines.map((l) => ({
          variant_id: l.variant_id,
          qty: l.qty,
          unit_cost: l.unit_cost,
          notes: l.notes,
        }));
      }

      if (invoiceFile) {
        payload.invoice_file = invoiceFile;
      }

      const result = await receiveMutation.mutateAsync(payload);
      setResponseData(result);
      
      if (result.errors && result.errors.length > 0) {
        notify.warning(`External PO received with ${result.errors.length} validation errors`);
      } else {
        notify.success(`External PO #${result.po_number} received successfully`);
        if (onSuccess) {
          onSuccess();
        }
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err: any) {
      notify.error(err.message || "Failed to receive external PO");
      console.error("Error receiving external PO:", err);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
      setErrors([]);
    }
  };

  const canProceedStep1 = storeId !== null && vendorId !== null && (!csvFile || vendorInvoiceNumber.trim() !== "");
  const canProceedStep2 = csvFile !== null || manualLines.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Receive External Purchase Order</DialogTitle>
          <DialogDescription>
            Record inventory received from an external order (outside the system)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 pb-4 border-b">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div className={cn("flex items-center justify-center w-8 h-8 rounded-full border-2", 
                  step >= s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border")}>
                  {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
                </div>
                {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </React.Fragment>
            ))}
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive mb-2">Please fix the following errors:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-destructive">
                    {errors.map((e, idx) => (
                      <li key={idx}>{e.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Basic Information */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store">Store *</Label>
                <select
                  id="store"
                  value={storeId || ""}
                  onChange={(e) => setStoreId(e.target.value ? parseInt(e.target.value) : null)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a store</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor *</Label>
                <VendorSelector
                  vendors={vendorsData?.results || []}
                  value={vendorId}
                  onChange={setVendorId}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="external_po_number">External PO Number</Label>
                  <Input
                    id="external_po_number"
                    value={externalPONumber}
                    onChange={(e) => setExternalPONumber(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor_invoice_number">
                    Vendor Invoice Number {csvFile && "*"}
                  </Label>
                  <Input
                    id="vendor_invoice_number"
                    value={vendorInvoiceNumber}
                    onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                    placeholder={csvFile ? "Required" : "Optional"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor_invoice_date">Vendor Invoice Date</Label>
                <Input
                  id="vendor_invoice_date"
                  type="date"
                  value={vendorInvoiceDate}
                  onChange={(e) => setVendorInvoiceDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Optional notes about this external PO"
                />
              </div>
            </div>
          )}

          {/* Step 2: Items (CSV or Manual) */}
          {step === 2 && (
            <div className="space-y-4">
              <Tabs value={activeTab} onValueChange={(v) => {
                const newTab = v as "csv" | "manual";
                setActiveTab(newTab);
                if (newTab === "csv") {
                  setManualLines([]);
                } else {
                  setCsvFile(null);
                }
              }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="csv">Upload CSV</TabsTrigger>
                  <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                </TabsList>

                <TabsContent value="csv" className="space-y-4">
                  <div className="space-y-2">
                    <Label>CSV File *</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      {csvFile ? (
                        <div className="space-y-2">
                          <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                          <div className="font-medium">{csvFile.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {(csvFile.size / 1024).toFixed(1)} KB
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCsvFile(null)}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                          <div>
                            <Label htmlFor="csv-upload" className="cursor-pointer">
                              <Button variant="outline" asChild>
                                <span>Choose CSV File</span>
                              </Button>
                            </Label>
                            <Input
                              id="csv-upload"
                              type="file"
                              accept=".csv,.txt"
                              onChange={(e) => handleFileSelect(e, "csv")}
                              className="hidden"
                            />
                          </div>
                          <div className="text-sm text-muted-foreground">
                            CSV format: sku, quantity, unit_cost (optional), notes (optional)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg text-sm">
                    <div className="font-medium mb-2">CSV Format Requirements:</div>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Required columns: <code className="bg-background px-1 rounded">sku</code>, <code className="bg-background px-1 rounded">quantity</code></li>
                      <li>Optional columns: <code className="bg-background px-1 rounded">unit_cost</code>, <code className="bg-background px-1 rounded">notes</code></li>
                      <li>First row should contain column headers</li>
                    </ul>
                  </div>
                </TabsContent>

                <TabsContent value="manual" className="space-y-4">
                  <div className="space-y-4">
                    {/* Search and add variant */}
                    <div className="space-y-2">
                      <Label>Add Variant</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Search by SKU or product name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                      {searchResults.length > 0 && (
                        <div className="border rounded-lg max-h-48 overflow-y-auto">
                          {searchResults.map((variant) => {
                            // Determine stock status
                            const hasStockData = variant.on_hand !== undefined && 
                                               variant.reorder_point !== undefined && 
                                               variant.reorder_point !== null;
                            const isLowStock = hasStockData && variant.on_hand < variant.reorder_point;
                            const isGoodStock = hasStockData && variant.on_hand >= variant.reorder_point;
                            
                            return (
                              <button
                                key={variant.id}
                                type="button"
                                onClick={() => {
                                  setSelectedVariantId(variant.id);
                                  setSelectedVariant(variant);
                                  setSearchQuery(`${variant.sku} - ${variant.product_name}`);
                                  setSearchResults([]);
                                }}
                                className={cn(
                                  "w-full text-left px-4 py-2 hover:bg-muted transition-colors relative border-l-4",
                                  selectedVariantId === variant.id && "bg-muted",
                                  isLowStock && "bg-destructive/5",
                                  isGoodStock && "bg-success/5"
                                )}
                                style={
                                  isLowStock 
                                    ? { borderLeftColor: "hsl(var(--destructive))" }
                                    : isGoodStock
                                    ? { borderLeftColor: "hsl(var(--success))" }
                                    : { borderLeftColor: "transparent" }
                                }
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{variant.sku}</div>
                                    <div className="text-sm text-muted-foreground truncate">{variant.product_name}</div>
                                  </div>
                                  <div className="flex-shrink-0 text-right text-xs space-y-0.5">
                                    {variant.on_hand !== undefined ? (
                                      <div className={cn(
                                        "font-medium",
                                        isLowStock && "text-destructive",
                                        isGoodStock && "text-success",
                                        !isLowStock && !isGoodStock && "text-muted-foreground"
                                      )}>
                                        Stock: {variant.on_hand}
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground text-xs">Stock: N/A</div>
                                    )}
                                    {variant.reorder_point !== undefined && variant.reorder_point !== null ? (
                                      <div className="text-muted-foreground">
                                        Threshold: {variant.reorder_point}
                                      </div>
                                    ) : variant.on_hand !== undefined && (
                                      <div className="text-muted-foreground text-xs opacity-50">
                                        No threshold
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {selectedVariantId && (
                      <div className="border rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Quantity *</Label>
                            <Input
                              type="number"
                              min="1"
                              value={qtyInput}
                              onChange={(e) => setQtyInput(e.target.value)}
                              placeholder="Quantity"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Unit Cost</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={costInput}
                              onChange={(e) => setCostInput(e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Input
                            value={lineNotes}
                            onChange={(e) => setLineNotes(e.target.value)}
                            placeholder="Optional notes"
                          />
                        </div>
                        <Button onClick={handleAddManualLine} type="button">
                          <Plus className="h-4 w-4 mr-2" />
                          Add to List
                        </Button>
                      </div>
                    )}

                    {/* Manual lines list */}
                    {manualLines.length > 0 && (
                      <div className="space-y-2">
                        <Label>Items ({manualLines.length})</Label>
                        <div className="border rounded-lg divide-y">
                          {manualLines.map((line) => (
                            <div key={line.variant_id} className="p-3 flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium">{line.sku}</div>
                                <div className="text-sm text-muted-foreground">{line.product_name}</div>
                                <div className="text-sm">
                                  Qty: {line.qty} × ${line.unit_cost}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveManualLine(line.variant_id)}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Invoice file upload (optional, available in both modes) */}
              <div className="space-y-2">
                <Label>Invoice Document (Optional)</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  {invoiceFile ? (
                    <div className="space-y-2">
                      <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
                      <div className="font-medium text-sm">{invoiceFile.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(invoiceFile.size / 1024).toFixed(1)} KB
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInvoiceFile(null)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                      <Label htmlFor="invoice-upload" className="cursor-pointer">
                        <Button variant="outline" size="sm" asChild>
                          <span>Upload Invoice (PDF/Image)</span>
                        </Button>
                      </Label>
                      <Input
                        id="invoice-upload"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.bmp"
                        onChange={(e) => handleFileSelect(e, "invoice")}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review & Submit */}
          {step === 3 && (
            <div className="space-y-4">
              {responseData ? (
                <div className="rounded-lg border border-success bg-success/10 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="font-medium text-foreground">
                        External PO #{responseData.po_number} received successfully!
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div>Total Value: ${responseData.total_value}</div>
                        <div>Items: {responseData.lines_count}</div>
                      </div>
                      {responseData.errors && responseData.errors.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="font-medium text-sm text-destructive mb-2">Validation Errors:</div>
                          <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                            {responseData.errors.map((e: any, idx: number) => (
                              <li key={idx}>Row {e.row}: {e.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                    <div className="font-medium">Review Details</div>
                    <div className="text-sm space-y-1">
                      <div><strong>Store:</strong> {stores.find((s) => s.id === storeId)?.name}</div>
                      <div><strong>Vendor:</strong> {vendorsData?.results.find((v) => v.id === vendorId)?.name}</div>
                      {externalPONumber && <div><strong>External PO:</strong> {externalPONumber}</div>}
                      {vendorInvoiceNumber && <div><strong>Invoice #:</strong> {vendorInvoiceNumber}</div>}
                      {csvFile && <div><strong>CSV File:</strong> {csvFile.name}</div>}
                      {!csvFile && <div><strong>Items:</strong> {manualLines.length}</div>}
                      {invoiceFile && <div><strong>Invoice Document:</strong> {invoiceFile.name}</div>}
                    </div>
                  </div>

                  {!csvFile && manualLines.length > 0 && (
                    <div className="border rounded-lg divide-y">
                      {manualLines.map((line) => (
                        <div key={line.variant_id} className="p-3">
                          <div className="font-medium">{line.sku}</div>
                          <div className="text-sm text-muted-foreground">{line.product_name}</div>
                          <div className="text-sm">Qty: {line.qty} × ${line.unit_cost}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        This will create a purchase order and immediately update inventory. Make sure all details are correct.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={step === 1 ? onClose : handleBack} disabled={receiveMutation.isPending}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 3 && (
            <Button onClick={handleNext} disabled={!canProceedStep1 && step === 1 || !canProceedStep2 && step === 2}>
              Next
            </Button>
          )}
          {step === 3 && !responseData && (
            <Button onClick={handleSubmit} disabled={receiveMutation.isPending}>
              {receiveMutation.isPending ? "Processing..." : "Submit"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

