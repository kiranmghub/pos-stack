// pos-frontend/src/features/inventory/operations/purchase-orders/ReceivePOModal.tsx
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReceivePurchaseOrder } from "../../hooks/usePurchaseOrders";
import { PurchaseOrder } from "../../api/purchaseOrders";
import { useNotify } from "@/lib/notify";
import { CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReceivePOModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Purchase order to receive */
  po: PurchaseOrder | null;
  /** On success callback */
  onSuccess?: () => void;
}

/**
 * ReceivePOModal - Modal for receiving items for a purchase order
 * Security: All operations are tenant-scoped via API
 */
export function ReceivePOModal({
  open,
  onClose,
  po,
  onSuccess,
}: ReceivePOModalProps) {
  const notify = useNotify();
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});

  const receiveMutation = useReceivePurchaseOrder();

  // Initialize receive quantities with remaining quantities
  React.useEffect(() => {
    if (po && open) {
      const initial: Record<number, number> = {};
      po.lines.forEach((line) => {
        if (line.qty_remaining > 0) {
          initial[line.id] = line.qty_remaining;
        }
      });
      setReceiveQuantities(initial);
    } else {
      setReceiveQuantities({});
    }
  }, [po, open]);

  const handleQtyChange = (lineId: number, qty: number) => {
    const line = po?.lines.find((l) => l.id === lineId);
    if (!line) return;

    const maxQty = line.qty_remaining;
    const newQty = Math.max(0, Math.min(qty, maxQty));
    setReceiveQuantities({ ...receiveQuantities, [lineId]: newQty });
  };

  const handleReceiveAll = () => {
    if (!po) return;
    const all: Record<number, number> = {};
    po.lines.forEach((line) => {
      if (line.qty_remaining > 0) {
        all[line.id] = line.qty_remaining;
      }
    });
    setReceiveQuantities(all);
  };

  const handleClearAll = () => {
    setReceiveQuantities({});
  };

  const handleSubmit = async () => {
    if (!po) return;

    const linesToReceive = Object.entries(receiveQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([lineId, qty]) => ({
        line_id: parseInt(lineId, 10),
        qty_receive: qty,
      }));

    if (linesToReceive.length === 0) {
      notify.error("Please specify quantities to receive");
      return;
    }

    try {
      await receiveMutation.mutateAsync({
        id: po.id,
        payload: { lines: linesToReceive },
      });
      notify.success("Items received successfully");
      setReceiveQuantities({});
      onSuccess?.();
      onClose();
    } catch (err: any) {
      notify.error(err.message || "Failed to receive items");
    }
  };

  const handleClose = () => {
    if (!receiveMutation.isPending) {
      setReceiveQuantities({});
      onClose();
    }
  };

  if (!po) return null;

  const hasQuantitiesToReceive = Object.values(receiveQuantities).some((qty) => qty > 0);
  const totalToReceive = Object.values(receiveQuantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Purchase Order</DialogTitle>
          <DialogDescription>
            Enter quantities received for each line item. Leave blank to skip.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* PO Info */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-sm">
              <div className="font-medium text-foreground">{po.po_number || `PO #${po.id}`}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Vendor: {po.vendor.name} • Store: {po.store.name}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReceiveAll}
              disabled={receiveMutation.isPending}
            >
              Receive All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={receiveMutation.isPending}
            >
              Clear All
            </Button>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            {po.lines
              .filter((line) => line.qty_remaining > 0)
              .map((line) => {
                const receiveQty = receiveQuantities[line.id] || 0;
                const isValid = receiveQty >= 0 && receiveQty <= line.qty_remaining;

                return (
                  <div
                    key={line.id}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{line.product_name}</div>
                        <div className="text-xs text-muted-foreground">SKU: {line.sku || "N/A"}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-muted-foreground">Remaining</div>
                        <div className="font-semibold text-foreground">{line.qty_remaining}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`qty-${line.id}`} className="text-xs w-20">
                        Qty to Receive:
                      </Label>
                      <Input
                        id={`qty-${line.id}`}
                        type="number"
                        min="0"
                        max={line.qty_remaining}
                        value={receiveQty || ""}
                        onChange={(e) =>
                          handleQtyChange(line.id, parseInt(e.target.value, 10) || 0)
                        }
                        disabled={receiveMutation.isPending}
                        className={cn(
                          "flex-1",
                          !isValid && "border-destructive focus:ring-destructive"
                        )}
                      />
                      <div className="text-xs text-muted-foreground w-16 text-right">
                        / {line.qty_remaining}
                      </div>
                    </div>
                    {!isValid && receiveQty > 0 && (
                      <div className="text-xs text-destructive mt-1">
                        Cannot receive more than {line.qty_remaining}
                      </div>
                    )}
                  </div>
                );
              })}

            {po.lines.filter((line) => line.qty_remaining > 0).length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                All items have been received
              </div>
            )}
          </div>

          {/* Summary */}
          {hasQuantitiesToReceive && (
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Total to Receive</span>
                <span className="text-lg font-semibold text-foreground">{totalToReceive}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={receiveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={receiveMutation.isPending || !hasQuantitiesToReceive}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {receiveMutation.isPending ? "Receiving..." : "Receive Items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

