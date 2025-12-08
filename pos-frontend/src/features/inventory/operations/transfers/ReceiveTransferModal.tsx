// pos-frontend/src/features/inventory/operations/transfers/ReceiveTransferModal.tsx
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Minus } from "lucide-react";
import { useReceiveTransfer } from "../../hooks/useTransfers";
import { Transfer } from "../../api/transfers";
import { cn } from "@/lib/utils";

export interface ReceiveTransferModalProps {
  /** Transfer to receive */
  transfer: Transfer | null;
  /** Open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** On success callback */
  onSuccess?: () => void;
}

/**
 * ReceiveTransferModal - Modal for receiving transfers (partial/full)
 * Security: All operations are tenant-scoped via API
 */
export function ReceiveTransferModal({
  transfer,
  open,
  onClose,
  onSuccess,
}: ReceiveTransferModalProps) {
  const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});

  const receiveTransferMutation = useReceiveTransfer();

  // Initialize receive quantities with remaining quantities
  React.useEffect(() => {
    if (transfer && open) {
      const initial: Record<number, number> = {};
      transfer.lines.forEach((line) => {
        if (line.qty_remaining > 0) {
          initial[line.variant_id] = line.qty_remaining; // Default to full remaining
        }
      });
      setReceiveQuantities(initial);
    }
  }, [transfer, open]);

  const handleQtyChange = (variantId: number, qty: number) => {
    const line = transfer?.lines.find((l) => l.variant_id === variantId);
    if (!line) return;

    const maxQty = line.qty_remaining;
    const newQty = Math.max(0, Math.min(maxQty, qty));
    setReceiveQuantities({ ...receiveQuantities, [variantId]: newQty });
  };

  const handleQtyDelta = (variantId: number, delta: number) => {
    const current = receiveQuantities[variantId] || 0;
    handleQtyChange(variantId, current + delta);
  };

  const handleReceiveAll = () => {
    if (!transfer) return;
    const all: Record<number, number> = {};
    transfer.lines.forEach((line) => {
      if (line.qty_remaining > 0) {
        all[line.variant_id] = line.qty_remaining;
      }
    });
    setReceiveQuantities(all);
  };

  const handleReceiveNone = () => {
    setReceiveQuantities({});
  };

  const handleSubmit = async () => {
    if (!transfer) return;

    // Build receive lines (only include non-zero quantities)
    const receiveLines = Object.entries(receiveQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([variantId, qty]) => ({
        variant_id: parseInt(variantId, 10),
        qty_receive: qty,
      }));

    if (receiveLines.length === 0) {
      // If no lines specified, receive all remaining (backend default)
      try {
        await receiveTransferMutation.mutateAsync({ id: transfer.id });
      } catch (err) {
        console.error("Failed to receive transfer:", err);
        return;
      }
    } else {
      try {
        await receiveTransferMutation.mutateAsync({
          id: transfer.id,
          payload: { lines: receiveLines },
        });
      } catch (err) {
        console.error("Failed to receive transfer:", err);
        return;
      }
    }

    onSuccess?.();
    handleClose();
  };

  const handleClose = () => {
    setReceiveQuantities({});
    onClose();
  };

  if (!transfer) return null;

  const hasRemaining = transfer.lines.some((l) => l.qty_remaining > 0);
  const totalToReceive = Object.values(receiveQuantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Transfer #{transfer.id}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Transfer Info */}
          <div className="grid grid-cols-2 gap-4 p-4 border border-border rounded-md bg-muted/50">
            <div>
              <div className="text-xs text-muted-foreground mb-1">From Store</div>
              <div className="font-medium text-foreground">{transfer.from_store.name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">To Store</div>
              <div className="font-medium text-foreground">{transfer.to_store.name}</div>
            </div>
          </div>

          {!hasRemaining && (
            <div className="p-4 border border-border rounded-md bg-muted/50 text-center text-sm text-muted-foreground">
              All items have been received
            </div>
          )}

          {hasRemaining && (
            <>
              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleReceiveAll}>
                  Receive All Remaining
                </Button>
                <Button variant="outline" size="sm" onClick={handleReceiveNone}>
                  Clear All
                </Button>
                <div className="ml-auto text-sm text-muted-foreground">
                  Total to receive: <span className="font-medium text-foreground">{totalToReceive}</span>
                </div>
              </div>

              {/* Line Items */}
              <div className="border border-border rounded-md">
                <div className="px-4 py-2 bg-muted border-b border-border text-sm font-medium">
                  Items to Receive
                </div>
                <div className="divide-y divide-border">
                  {transfer.lines
                    .filter((line) => line.qty_remaining > 0)
                    .map((line) => {
                      const receiveQty = receiveQuantities[line.variant_id] || 0;
                      return (
                        <div key={line.variant_id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground truncate">
                                {line.product}
                              </div>
                              <div className="text-xs text-muted-foreground">SKU: {line.sku}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Remaining: {line.qty_remaining} / Sent: {line.qty_sent}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleQtyDelta(line.variant_id, -1)}
                                disabled={receiveQty <= 0}
                                className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <Input
                                type="number"
                                min="0"
                                max={line.qty_remaining}
                                value={receiveQty}
                                onChange={(e) =>
                                  handleQtyChange(line.variant_id, parseInt(e.target.value, 10) || 0)
                                }
                                className="w-20 text-center"
                              />
                              <button
                                type="button"
                                onClick={() => handleQtyDelta(line.variant_id, 1)}
                                disabled={receiveQty >= line.qty_remaining}
                                className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {hasRemaining && (
            <Button
              onClick={handleSubmit}
              disabled={receiveTransferMutation.isPending || totalToReceive === 0}
            >
              {receiveTransferMutation.isPending ? "Receiving..." : "Receive Transfer"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

