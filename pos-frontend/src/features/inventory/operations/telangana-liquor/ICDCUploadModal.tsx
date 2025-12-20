// pos-frontend/src/features/inventory/operations/telangana-liquor/ICDCUploadModal.tsx
import React, { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, X, AlertCircle, CheckCircle2, ChevronRight, Loader2, Plus } from "lucide-react";
import { useParseICDCPDF, useSaveICDCDraft, useSubmitICDCInvoice } from "../../hooks/useICDC";
import { useVendorsList } from "../../hooks/usePurchaseOrders";
import { type StoreOption } from "../../components/StoreFilter";
import { VendorSelector } from "../purchase-orders/VendorSelector";
import { useNotify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { uploadDocument } from "@/features/documents/api/documents";
import { ICDCProductCreateModal } from "./ICDCProductCreateModal";

export interface ICDCUploadModalProps {
  open: boolean;
  onClose: () => void;
  stores: StoreOption[];
  defaultStoreId?: number | null;
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3 | 4;

interface ICDCLine {
  line_number: number;
  brand_number: string;
  brand_name: string;
  product_type: string;
  pack_type?: string;
  pack_qty: number;
  size_ml: number;
  cases_delivered: number;
  bottles_delivered: number;
  unit_rate: string;
  btl_rate: string;
  total: string;
  calculated_total: string;
  has_discrepancy: boolean;
  discrepancy_reason?: string;
  product_id?: number;
  variant_id?: number;
  product?: { id: number; name: string };
  variant?: { id: number; name: string; sku: string };
  raw_data?: Record<string, any>;
}

/**
 * ICDCUploadModal - Multi-step wizard for uploading and processing ICDC invoices
 */
export function ICDCUploadModal({
  open,
  onClose,
  stores,
  defaultStoreId,
  onSuccess,
}: ICDCUploadModalProps) {
  const notify = useNotify();
  const [step, setStep] = useState<Step>(1);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [storeId, setStoreId] = useState<number | null>(defaultStoreId || null);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [lines, setLines] = useState<ICDCLine[]>([]);
  const [updateVariantCost, setUpdateVariantCost] = useState(false);
  const [showProductCreateModal, setShowProductCreateModal] = useState(false);
  const [selectedLineForProduct, setSelectedLineForProduct] = useState<ICDCLine | null>(null);

  const parseMutation = useParseICDCPDF();
  const saveDraftMutation = useSaveICDCDraft();
  const submitMutation = useSubmitICDCInvoice();
  const { data: vendorsData } = useVendorsList({ page_size: 100 });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setPdfFile(null);
      setParsing(false);
      setParsedData(null);
      setStoreId(defaultStoreId || null);
      setVendorId(null);
      setInvoiceId(null);
      setLines([]);
      setUpdateVariantCost(false);
    }
  }, [open, defaultStoreId]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      notify.error("Please select a PDF file");
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      notify.error("File size exceeds 10MB limit");
      return;
    }

    setPdfFile(file);
  }, [notify]);

  const handleParse = async () => {
    if (!pdfFile) {
      notify.error("Please select a PDF file");
      return;
    }

    setParsing(true);
    try {
      const result = await parseMutation.mutateAsync(pdfFile);
      setParsedData(result);
      
      // Check for critical errors first
      const metadata = result.metadata || {};
      const errors = metadata.errors || [];
      const warnings = metadata.warnings || [];
      const parsingMethod = metadata.parsing_method;
      
      // Check if parsing failed or has critical errors
      if (!result.success || parsingMethod === "failed" || (errors.length > 0 && (!result.data || !result.data.lines || result.data.lines.length === 0))) {
        const errorMessage = result.error || errors[0] || "Failed to parse PDF. Please check the file format and try again.";
        notify.error(errorMessage);
        // Don't proceed to next step
        return;
      }
      
      // Check if we have valid data
      if (!result.data || !result.data.lines || result.data.lines.length === 0) {
        notify.error("No data extracted from PDF. Please verify the file format.");
        return;
      }
      
      // Extract lines from parsed data
      const parsedLines = result.data.lines || [];
      setLines(parsedLines.map((line: any, idx: number) => ({
        line_number: line.line_number || idx + 1,
        brand_number: line.brand_number || "",
        brand_name: line.brand_name || "",
        product_type: line.product_type || "",
        pack_type: line.pack_type || "",
        pack_qty: line.pack_qty || 0,
        size_ml: line.size_ml || 0,
        cases_delivered: line.cases_delivered || 0,
        bottles_delivered: line.bottles_delivered || 0,
        unit_rate: String(line.unit_rate || 0),
        btl_rate: String(line.btl_rate || 0),
        total: String(line.total || 0),
        calculated_total: String(line.calculated_total || line.total || 0),
        has_discrepancy: line.has_discrepancy || false,
        discrepancy_reason: line.discrepancy_reason,
        raw_data: line.raw_data || {},
      })));

      // Extract header info
      if (result.data.header) {
        const header = result.data.header;
        // Pre-fill vendor if we can match it
        // For now, user will select manually
      }
      
      // Show warnings if any (but still allow proceeding)
      if (warnings.length > 0) {
        notify.warning(`PDF parsed with ${warnings.length} warning(s). Please review the data.`);
      } else {
        notify.success("PDF parsed successfully");
      }
      
      // Only proceed to next step if parsing was successful
      setStep(2);
    } catch (err: any) {
      const errorMessage = err.message || err.error || "Failed to parse PDF. Please check the file format and try again.";
      notify.error(errorMessage);
      console.error("Parse error:", err);
      // Don't proceed to next step on error
    } finally {
      setParsing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!parsedData?.data?.header) {
      notify.error("No parsed data available");
      return;
    }

    if (!storeId || !vendorId) {
      notify.error("Store and vendor are required");
      return;
    }

    if (!pdfFile) {
      notify.error("PDF file is required");
      return;
    }

    try {
      // First, upload the PDF file to get a TenantDoc ID
      const icdcNumber = parsedData.data.header.icdc_number || "ICDC Invoice";
      const document = await uploadDocument({
        file: pdfFile,
        label: `ICDC Invoice ${icdcNumber}`,
        doc_type: "ICDC_INVOICE",
        description: `ICDC Invoice ${icdcNumber} uploaded on ${new Date().toLocaleDateString()}`,
        metadata: {
          source: "icdc_upload",
          icdc_number: icdcNumber,
        },
      });

      const pdfFileId = document.id;

      const payload = {
        icdc_number: parsedData.data.header.icdc_number || "",
        invoice_date: parsedData.data.header.invoice_date || new Date().toISOString().split('T')[0],
        store_id: storeId,
        vendor_id: vendorId,
        pdf_file_id: pdfFileId,
        raw_extraction: parsedData.data,
        canonical_data: parsedData.data,
        parsing_errors: parsedData.metadata?.errors || [],
        calculation_discrepancies: [],
        parsing_metadata: parsedData.metadata || {},
        lines: lines.map(line => ({
          line_number: line.line_number,
          brand_number: line.brand_number,
          brand_name: line.brand_name,
          product_type: line.product_type,
          pack_type: line.pack_type || "",
          pack_qty: line.pack_qty,
          size_ml: line.size_ml,
          cases_delivered: line.cases_delivered,
          bottles_delivered: line.bottles_delivered,
          unit_rate: line.unit_rate,
          btl_rate: line.btl_rate,
          total: line.total,
          calculated_total: line.calculated_total,
          has_discrepancy: line.has_discrepancy,
          discrepancy_reason: line.discrepancy_reason,
          raw_data: line.raw_data || {},
        })),
      };

      const result = await saveDraftMutation.mutateAsync(payload);
      setInvoiceId(result.id);

      if (result.duplicate_info) {
        notify.warning(result.duplicate_info.message || "Duplicate invoice detected");
        if (result.duplicate_info.action === "auto_open") {
          // Handle auto-open case
          notify.info("Opening existing invoice");
        }
      } else {
        notify.success("Draft saved successfully");
        setStep(3);
      }
    } catch (err: any) {
      notify.error(err.message || "Failed to save draft");
      console.error("Save draft error:", err);
    }
  };

  const handleSubmit = async () => {
    if (!invoiceId) {
      notify.error("No invoice to submit");
      return;
    }

    try {
      const result = await submitMutation.mutateAsync({
        id: invoiceId,
        update_variant_cost: updateVariantCost,
      });

      if (result.warnings && result.warnings.length > 0) {
        notify.warning(`Invoice submitted with ${result.warnings.length} warnings`);
      } else {
        notify.success("Invoice submitted successfully");
      }

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      notify.error(err.message || "Failed to submit invoice");
      console.error("Submit error:", err);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!pdfFile) {
        notify.error("Please select a PDF file");
        return;
      }
      handleParse();
    } else if (step === 2) {
      handleSaveDraft();
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
    }
  };

  const canProceedStep1 = pdfFile !== null;
  const canProceedStep2 = storeId !== null && vendorId !== null;
  const canProceedStep3 = invoiceId !== null;
  const discrepancies = lines.filter(l => l.has_discrepancy);
  const unmatchedProducts = lines.filter(l => !l.product_id || !l.variant_id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-hidden flex flex-col bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">Receive ICDC Invoice</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Upload and process Telangana Liquor ICDC (Invoice-cum-Delivery Challan) PDF
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 pb-4 border-b">
            {[1, 2, 3, 4].map((s) => (
              <React.Fragment key={s}>
                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full border-2",
                  step >= s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground"
                )}>
                  {step > s ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-foreground">{s}</span>}
                </div>
                {s < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Upload PDF */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-foreground">PDF File</Label>
                <div className="mt-2 flex items-center gap-4">
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="flex-1 bg-background text-foreground"
                  />
                  {pdfFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      <span className="text-foreground">{pdfFile.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {parsing && (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                  <span className="text-foreground">Parsing PDF...</span>
                </div>
              )}

              {(parsedData?.metadata?.errors && parsedData.metadata.errors.length > 0) && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-destructive">Parsing Errors:</p>
                      <ul className="list-disc list-inside mt-1 text-sm space-y-1">
                        {parsedData.metadata.errors.map((err: string, idx: number) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        Please check the PDF file format and ensure it's a valid ICDC invoice.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review & Edit */}
          {step === 2 && parsedData?.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Store</Label>
                  <select
                    className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-foreground"
                    value={storeId || ""}
                    onChange={(e) => setStoreId(Number(e.target.value) || null)}
                  >
                    <option value="">Select store</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-foreground">Vendor</Label>
                  <VendorSelector
                    value={vendorId}
                    onChange={setVendorId}
                    vendors={vendorsData?.results || []}
                  />
                </div>
              </div>

              <div>
                <Label className="text-foreground">ICDC Number</Label>
                <Input
                  value={parsedData.data.header?.icdc_number || ""}
                  readOnly
                  className="mt-1 bg-muted text-foreground"
                />
              </div>

              <div>
                <Label className="text-foreground">Invoice Date</Label>
                <Input
                  type="date"
                  value={parsedData.data.header?.invoice_date || ""}
                  readOnly
                  className="mt-1 bg-muted text-foreground"
                />
              </div>

              {/* Line Items Table */}
              <div>
                <Label className="text-foreground">Line Items</Label>
                <div className="mt-2 border rounded-md overflow-auto max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left text-foreground">SL.No</th>
                        <th className="p-2 text-left text-foreground">Brand Number</th>
                        <th className="p-2 text-left text-foreground">Brand Name</th>
                        <th className="p-2 text-left text-foreground">Product Type</th>
                        <th className="p-2 text-left text-foreground">Pack Type</th>
                        <th className="p-2 text-left text-foreground">Pack Qty-SizeML</th>
                        <th className="p-2 text-right text-foreground">Cases Delivered</th>
                        <th className="p-2 text-right text-foreground">Bottles Delivered</th>
                        <th className="p-2 text-right text-foreground">Unit Rate</th>
                        <th className="p-2 text-right text-foreground">Bottle Rate</th>
                        <th className="p-2 text-right text-foreground">Total Cost</th>
                        <th className="p-2 text-center text-foreground">Match</th>
                        <th className="p-2 text-center text-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.line_number} className={cn(
                          "border-t",
                          line.has_discrepancy && "bg-destructive/5",
                          (!line.product_id || !line.variant_id) && "bg-yellow-50 dark:bg-yellow-950"
                        )}>
                          <td className="p-2 text-foreground">{line.line_number}</td>
                          <td className="p-2 text-foreground font-mono">{line.brand_number}</td>
                          <td className="p-2 text-foreground">{line.brand_name}</td>
                          <td className="p-2 text-foreground">{line.product_type}</td>
                          <td className="p-2 text-foreground">{line.pack_type || "-"}</td>
                          <td className="p-2 text-foreground">{line.pack_qty > 0 ? `${line.pack_qty}/${line.size_ml}ml` : (line.size_ml > 0 ? `${line.size_ml}ml` : "-")}</td>
                          <td className="p-2 text-right text-foreground">{line.cases_delivered}</td>
                          <td className="p-2 text-right text-foreground">{line.bottles_delivered}</td>
                          <td className="p-2 text-right text-foreground">{line.unit_rate || "-"}</td>
                          <td className="p-2 text-right text-foreground">{line.btl_rate || "-"}</td>
                          <td className="p-2 text-right text-foreground font-medium">{line.total || "-"}</td>
                          <td className="p-2 text-center">
                            {line.product_id && line.variant_id ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-600 mx-auto" />
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {(!line.product_id || !line.variant_id) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedLineForProduct(line);
                                  setShowProductCreateModal(true);
                                }}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Create
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {discrepancies.length > 0 && (
                <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-900">
                        {discrepancies.length} line(s) have calculation discrepancies
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {unmatchedProducts.length > 0 && (
                <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-900">
                        {unmatchedProducts.length} line(s) need product/variant matching
                      </p>
                      <p className="text-sm text-yellow-800 mt-1">
                        Click "Create Product" on unmatched lines to create products and variants.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Validate & Resolve */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-medium mb-2 text-foreground">Validation Summary</h3>
                <ul className="space-y-2 text-sm text-foreground">
                  <li className="flex items-center gap-2">
                    {discrepancies.length === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span className="text-foreground">Calculation discrepancies: {discrepancies.length}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {unmatchedProducts.length === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                    )}
                    <span className="text-foreground">Unmatched products/variants: {unmatchedProducts.length}</span>
                  </li>
                </ul>
              </div>

              <div>
                <Label className="flex items-center gap-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={updateVariantCost}
                    onChange={(e) => setUpdateVariantCost(e.target.checked)}
                    className="text-foreground"
                  />
                  <span className="text-foreground">Update variant costs if different from PDF</span>
                </Label>
              </div>
            </div>
          )}

          {/* Step 4: Confirm & Submit */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-medium mb-2 text-foreground">Ready to Submit</h3>
                <p className="text-sm text-muted-foreground">
                  The invoice will be processed and inventory will be updated.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleBack} disabled={step === 1}>
            Back
          </Button>
          {step < 4 ? (
            <Button
              onClick={handleNext}
              disabled={
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3) ||
                parsing ||
                saveDraftMutation.isPending
              }
            >
              {step === 1 && parsing
                ? "Parsing..."
                : step === 2 && saveDraftMutation.isPending
                ? "Saving..."
                : step === 1
                ? "Parse PDF"
                : step === 2
                ? "Save Draft"
                : "Next"}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Invoice"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

