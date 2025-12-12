// pos-frontend/src/features/inventory/operations/purchase-orders/PODetail.tsx
import React from "react";
import { PurchaseOrder } from "../../api/purchaseOrders";
import { StatusBadge } from "../../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Package, Building2, Store, Send, CheckCircle, XCircle, FileText, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PODetailProps {
  /** Purchase order to display */
  po: PurchaseOrder | null;
  /** Loading state */
  loading?: boolean;
  /** On submit handler */
  onSubmit?: () => void;
  /** On receive handler */
  onReceive?: () => void;
  /** On delete handler */
  onDelete?: () => void;
  /** Submit mutation pending */
  submitPending?: boolean;
  /** Can submit (DRAFT status) */
  canSubmit?: boolean;
  /** Can receive (SUBMITTED or PARTIAL_RECEIVED status) */
  canReceive?: boolean;
  /** Can delete (DRAFT status) */
  canDelete?: boolean;
}

/**
 * PODetail - Displays purchase order details with line items
 * Security: All operations are tenant-scoped via API
 */
export function PODetail({
  po,
  loading = false,
  onSubmit,
  onReceive,
  onDelete,
  submitPending = false,
  canSubmit = false,
  canReceive = false,
  canDelete = false,
}: PODetailProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading purchase order details...</div>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="flex items-center justify-center h-64 rounded-lg border border-border bg-card">
        <div className="text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Select a purchase order to view details</p>
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string): "draft" | "in_progress" | "completed" | "cancelled" => {
    if (status === "DRAFT") return "draft";
    if (status === "SUBMITTED" || status === "PARTIAL_RECEIVED") return "in_progress";
    if (status === "RECEIVED") return "completed";
    if (status === "CANCELLED") return "cancelled";
    return "draft";
  };

  const totalOrdered = po.lines.reduce((sum, line) => sum + line.qty_ordered, 0);
  const totalReceived = po.lines.reduce((sum, line) => sum + line.qty_received, 0);
  const totalRemaining = po.lines.reduce((sum, line) => sum + line.qty_remaining, 0);
  const totalCost = po.lines.reduce(
    (sum, line) => sum + parseFloat(line.unit_cost) * line.qty_ordered,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-foreground">
                {po.po_number || `PO #${po.id}`}
              </h3>
              <StatusBadge
                status={po.status.replace("_", " ")}
                variant={getStatusVariant(po.status)}
                size="sm"
              />
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {po.vendor.name}
              </span>
              <span className="flex items-center gap-1">
                <Store className="h-3 w-3" />
                {po.store.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canSubmit && (
              <Button
                onClick={onSubmit}
                disabled={submitPending}
                size="sm"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitPending ? "Submitting..." : "Submit PO"}
              </Button>
            )}
            {canReceive && (
              <Button
                onClick={onReceive}
                variant="default"
                size="sm"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Receive Items
              </Button>
            )}
            {canDelete && (
              <Button
                onClick={onDelete}
                variant="destructive"
                size="sm"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {po.notes && (
          <p className="text-sm text-muted-foreground mt-2">{po.notes}</p>
        )}

        {/* External PO Information */}
        {po.is_external && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            {po.external_po_number && (
              <div className="text-xs">
                <span className="text-muted-foreground">External PO:</span>{" "}
                <span className="font-medium">{po.external_po_number}</span>
              </div>
            )}
            {po.vendor_invoice_number && (
              <div className="text-xs">
                <span className="text-muted-foreground">Vendor Invoice #:</span>{" "}
                <span className="font-medium">{po.vendor_invoice_number}</span>
              </div>
            )}
            {po.vendor_invoice_date && (
              <div className="text-xs">
                <span className="text-muted-foreground">Invoice Date:</span>{" "}
                <span className="font-medium">
                  {format(new Date(po.vendor_invoice_date + "T00:00:00"), "MMM d, yyyy")}
                </span>
              </div>
            )}
            {po.import_source && (
              <div className="text-xs">
                <span className="text-muted-foreground">Import Source:</span>{" "}
                <span className="font-medium">{po.import_source}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>Created: {format(new Date(po.created_at), "MMM d, yyyy h:mm a")}</span>
          {po.created_by && <span>By: {po.created_by}</span>}
          {po.submitted_at && (
            <span>Submitted: {format(new Date(po.submitted_at), "MMM d, yyyy h:mm a")}</span>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="border-b border-border bg-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Total Items</div>
            <div className="text-lg font-semibold text-foreground">{po.lines.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Ordered</div>
            <div className="text-lg font-semibold text-foreground">{totalOrdered}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Received</div>
            <div className="text-lg font-semibold text-foreground">{totalReceived}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Cost</div>
            <div className="text-lg font-semibold text-foreground">
              ${totalCost.toFixed(2)}
            </div>
          </div>
        </div>
        {totalRemaining > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Remaining to Receive</span>
              <span className="text-lg font-semibold text-badge-warning-text">{totalRemaining}</span>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Document */}
      {po.invoice_document_url && (
        <div className="border-b border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Invoice Document</div>
                <div className="text-xs text-muted-foreground">
                  {po.vendor_invoice_number || "External PO Invoice"}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(po.invoice_document_url!, "_blank")}
              asChild
            >
              <a href={po.invoice_document_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Document
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {po.lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Package className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No line items</p>
          </div>
        ) : (
          <div className="space-y-2">
            {po.lines.map((line) => {
              const isFullyReceived = line.qty_remaining === 0;
              const isPartiallyReceived = line.qty_received > 0 && line.qty_remaining > 0;

              return (
                <div
                  key={line.id}
                  className="rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{line.product_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">SKU: {line.sku || "N/A"}</div>
                      {line.notes && (
                        <div className="text-xs text-muted-foreground mt-1">{line.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-xs text-muted-foreground">Ordered</div>
                        <div className="text-sm font-medium text-foreground">{line.qty_ordered}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Received</div>
                        <div
                          className={cn(
                            "text-sm font-semibold",
                            isFullyReceived && "text-badge-success-text",
                            isPartiallyReceived && "text-badge-warning-text"
                          )}
                        >
                          {line.qty_received}
                        </div>
                      </div>
                      {line.qty_remaining > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground">Remaining</div>
                          <div className="text-sm font-semibold text-badge-warning-text">
                            {line.qty_remaining}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-muted-foreground">Unit Cost</div>
                        <div className="text-sm font-medium text-foreground">
                          ${parseFloat(line.unit_cost).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="text-sm font-semibold text-foreground">
                          ${(parseFloat(line.unit_cost) * line.qty_ordered).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

