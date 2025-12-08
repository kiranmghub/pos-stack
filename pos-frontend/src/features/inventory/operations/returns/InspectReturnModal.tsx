// pos-frontend/src/features/inventory/operations/returns/InspectReturnModal.tsx
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
import { Return, ReturnItem, ReturnItemDisposition, ReturnItemCondition } from "../../api/returns";
import { ReturnDisposition } from "./ReturnDisposition";
import { StatusBadge } from "../../components/StatusBadge";
import { useInspectReturn, useAcceptReturn, useRejectReturn, useFinalizeReturn } from "../../hooks/useReturns";
import { useNotify } from "@/lib/notify";
import { CheckCircle2, XCircle, Package, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export interface InspectReturnModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Return data */
  returnData: Return | null;
  /** On success callback */
  onSuccess?: () => void;
}

interface ItemInspectionState {
  disposition: ReturnItemDisposition;
  condition: ReturnItemCondition;
  notes: string;
}

/**
 * InspectReturnModal - Modal for inspecting return items and setting dispositions
 * Security: All operations are tenant-scoped via API
 */
export function InspectReturnModal({
  open,
  onClose,
  returnData,
  onSuccess,
}: InspectReturnModalProps) {
  const notify = useNotify();
  const inspectMutation = useInspectReturn();
  const acceptMutation = useAcceptReturn();
  const rejectMutation = useRejectReturn();
  const finalizeMutation = useFinalizeReturn();

  const [itemStates, setItemStates] = useState<Record<number, ItemInspectionState>>({});

  // Initialize item states when return data changes
  useEffect(() => {
    if (returnData && open) {
      const states: Record<number, ItemInspectionState> = {};
      returnData.items.forEach((item) => {
        states[item.id] = {
          disposition: item.disposition === "PENDING" ? "RESTOCK" : item.disposition,
          condition: item.condition || "RESALEABLE",
          notes: "",
        };
      });
      setItemStates(states);
    }
  }, [returnData, open]);

  if (!returnData) return null;

  const handleDispositionChange = (itemId: number, disposition: ReturnItemDisposition) => {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        disposition,
      },
    }));
  };

  const handleConditionChange = (itemId: number, condition: ReturnItemCondition) => {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        condition,
      },
    }));
  };

  const handleNotesChange = (itemId: number, notes: string) => {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        notes,
      },
    }));
  };

  const handleInspect = async () => {
    if (!returnData) return;

    // Build inspection payload
    const items = returnData.items
      .filter((item) => {
        const state = itemStates[item.id];
        return state && state.disposition !== "PENDING";
      })
      .map((item) => {
        const state = itemStates[item.id];
        return {
          return_item_id: item.id,
          disposition: state.disposition,
          condition: state.disposition === "RESTOCK" ? state.condition : undefined,
          notes: state.notes || undefined,
        };
      });

    if (items.length === 0) {
      notify.error("Please set disposition for at least one item");
      return;
    }

    try {
      await inspectMutation.mutateAsync({
        returnId: returnData.id,
        payload: { items },
      });
      onSuccess?.();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleAccept = async () => {
    if (!returnData) return;
    try {
      await acceptMutation.mutateAsync(returnData.id);
      onSuccess?.();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleReject = async () => {
    if (!returnData) return;
    try {
      await rejectMutation.mutateAsync(returnData.id);
      onSuccess?.();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleFinalize = async () => {
    if (!returnData) return;
    try {
      await finalizeMutation.mutateAsync(returnData.id);
      onSuccess?.();
      onClose();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const isLoading =
    inspectMutation.isPending ||
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    finalizeMutation.isPending;

  const pendingItems = returnData.items.filter((item) => item.disposition === "PENDING");
  const inspectedItems = returnData.items.filter(
    (item) => item.disposition === "RESTOCK" || item.disposition === "WASTE"
  );
  const allInspected = pendingItems.length === 0;

  const canInspect = returnData.items.some((item) => {
    const state = itemStates[item.id];
    return state && state.disposition !== "PENDING";
  });

  const canAccept = allInspected && returnData.status === "awaiting_inspection";
  const canReject = returnData.status === "awaiting_inspection" || returnData.status === "accepted";
  const canFinalize = returnData.status === "accepted";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inspect Return</DialogTitle>
          <DialogDescription>
            Return #{returnData.return_no || returnData.id} • {returnData.store_name || `Store #${returnData.store}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Return Summary */}
          <div className="p-4 rounded-lg border border-border bg-muted/50">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <StatusBadge
                  status={returnData.status.replace("_", " ")}
                  variant={
                    returnData.status === "awaiting_inspection"
                      ? "warning"
                      : returnData.status === "accepted"
                      ? "success"
                      : "default"
                  }
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Refund Total</div>
                <div className="text-lg font-semibold text-foreground">
                  ${parseFloat(returnData.refund_total || "0").toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Items</div>
                <div className="text-sm font-medium text-foreground">
                  {returnData.items.length} total • {inspectedItems.length} inspected • {pendingItems.length} pending
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="text-sm text-foreground">
                  {format(new Date(returnData.created_at), "PPp")}
                </div>
              </div>
            </div>
          </div>

          {/* Inspection Status Alert */}
          {!allInspected && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-badge-warning-bg bg-badge-warning-bg/20">
              <AlertCircle className="h-5 w-5 text-badge-warning-text mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-badge-warning-text">
                  {pendingItems.length} item{pendingItems.length !== 1 ? "s" : ""} pending inspection
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Set disposition (Restock or Waste) for each item below
                </div>
              </div>
            </div>
          )}

          {allInspected && returnData.status === "awaiting_inspection" && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-badge-success-bg bg-badge-success-bg/20">
              <CheckCircle2 className="h-5 w-5 text-badge-success-text mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-badge-success-text">
                  All items inspected
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  You can now accept or reject this return
                </div>
              </div>
            </div>
          )}

          {/* Return Items */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">Items to Inspect</div>
            {returnData.items.map((item) => {
              const state = itemStates[item.id] || {
                disposition: item.disposition === "PENDING" ? "RESTOCK" : item.disposition,
                condition: item.condition || "RESALEABLE",
                notes: "",
              };
              const isInspected = item.disposition !== "PENDING";

              return (
                <ReturnDisposition
                  key={item.id}
                  item={item}
                  disposition={state.disposition}
                  condition={state.condition}
                  notes={state.notes}
                  onDispositionChange={(disp) => handleDispositionChange(item.id, disp)}
                  onConditionChange={(cond) => handleConditionChange(item.id, cond)}
                  onNotesChange={(notes) => handleNotesChange(item.id, notes)}
                  isInspected={isInspected}
                />
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex gap-2">
            {canAccept && (
              <Button
                variant="outline"
                onClick={handleAccept}
                disabled={isLoading}
                className="text-badge-success-text border-badge-success-bg hover:bg-badge-success-bg/20"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Accept
              </Button>
            )}
            {canReject && (
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={isLoading}
                className="text-badge-error-text border-badge-error-bg hover:bg-badge-error-bg/20"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            )}
            {canFinalize && (
              <Button
                onClick={handleFinalize}
                disabled={isLoading}
                className="bg-primary text-primary-foreground"
              >
                <Package className="h-4 w-4 mr-2" />
                Finalize Return
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Close
            </Button>
            {!allInspected && (
              <Button onClick={handleInspect} disabled={!canInspect || isLoading}>
                {isLoading ? "Inspecting..." : "Save Inspection"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

