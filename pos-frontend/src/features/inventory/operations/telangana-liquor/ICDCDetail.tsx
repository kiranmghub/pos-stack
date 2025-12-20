// pos-frontend/src/features/inventory/operations/telangana-liquor/ICDCDetail.tsx
import React, { useState } from "react";
import { useICDCInvoiceDetail, useReverseICDCInvoice, useDeleteICDCInvoice } from "../../hooks/useICDC";
import { useNotify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../../components/StatusBadge";
import { AlertCircle, CheckCircle2, X, RotateCcw, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface ICDCDetailProps {
  invoiceId: number;
  onClose?: () => void;
  onSuccess?: () => void;
}

/**
 * ICDCDetail - Display and manage ICDC invoice details
 */
export function ICDCDetail({ invoiceId, onClose, onSuccess }: ICDCDetailProps) {
  const notify = useNotify();
  const { data: invoice, isLoading } = useICDCInvoiceDetail(invoiceId);
  const reverseMutation = useReverseICDCInvoice();
  const deleteMutation = useDeleteICDCInvoice();
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [reverseReason, setReverseReason] = useState("");

  const getStatusVariant = (status: string): "draft" | "in_progress" | "completed" | "cancelled" => {
    if (status === "DRAFT" || status === "REVIEW") return "draft";
    if (status === "RECEIVED") return "completed";
    if (status === "REVERSED" || status === "CANCELLED") return "cancelled";
    return "draft";
  };

  const handleReverse = async () => {
    if (!reverseReason.trim()) {
      notify.error("Please provide a reason for reversal");
      return;
    }

    try {
      await reverseMutation.mutateAsync({ id: invoiceId, reason: reverseReason });
      notify.success("Invoice reversed successfully");
      setShowReverseDialog(false);
      setReverseReason("");
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      notify.error(err.message || "Failed to reverse invoice");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this invoice?")) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(invoiceId);
      notify.success("Invoice deleted successfully");
      if (onClose) {
        onClose();
      }
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      notify.error(err.message || "Failed to delete invoice");
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!invoice) {
    return <div className="p-4">Invoice not found</div>;
  }

  const canReverse = invoice.status === "RECEIVED";
  const canDelete = invoice.status === "DRAFT" || invoice.status === "REVIEW";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">ICDC Invoice {invoice.icdc_number}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span>Date: {format(new Date(invoice.invoice_date), "MMM d, yyyy")}</span>
              <StatusBadge status={invoice.status} variant={getStatusVariant(invoice.status)} />
            </div>
          </div>
          <div className="flex gap-2">
            {canReverse && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReverseDialog(true)}
                disabled={reverseMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reverse
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Store</label>
            <div className="mt-1">{invoice.store.name}</div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Vendor</label>
            <div className="mt-1">{invoice.vendor.name}</div>
          </div>
          {invoice.purchase_order && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Purchase Order</label>
              <div className="mt-1">{invoice.purchase_order.po_number}</div>
            </div>
          )}
        </div>

        {/* Discrepancies */}
        {invoice.calculation_discrepancies && invoice.calculation_discrepancies.length > 0 && (
          <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-yellow-900">Calculation Discrepancies</h3>
                <ul className="mt-2 space-y-1 text-sm text-yellow-800">
                  {invoice.calculation_discrepancies.map((disc: string, idx: number) => (
                    <li key={idx}>• {disc}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Line Items */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Line Items</h3>
          <div className="border rounded-md overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left">Line</th>
                  <th className="p-3 text-left">Brand #</th>
                  <th className="p-3 text-left">Brand Name</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-right">Cases</th>
                  <th className="p-3 text-right">Bottles</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-center">Match</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr
                    key={line.id}
                    className={cn(
                      "border-t",
                      line.has_discrepancy && "bg-destructive/5"
                    )}
                  >
                    <td className="p-3">{line.line_number}</td>
                    <td className="p-3">{line.brand_number}</td>
                    <td className="p-3">{line.brand_name}</td>
                    <td className="p-3">{line.product_type}</td>
                    <td className="p-3 text-right">{line.cases_delivered}</td>
                    <td className="p-3 text-right">{line.bottles_delivered}</td>
                    <td className="p-3 text-right">{line.total}</td>
                    <td className="p-3 text-center">
                      {line.product_id && line.variant_id ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-yellow-600 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reverse Dialog */}
      {showReverseDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Reverse Invoice</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Reason</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md"
                  rows={4}
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="Enter reason for reversal..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowReverseDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleReverse} disabled={reverseMutation.isPending}>
                  {reverseMutation.isPending ? "Reversing..." : "Confirm Reversal"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

