// pos-frontend/src/features/inventory/operations/counts/CountSessionDetail.tsx
import React, { useState } from "react";
import { CountSession, CountLine } from "../../api/counts";
import { CountScanner } from "./CountScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "../../components/StatusBadge";
import { useSetCountQty, useFinalizeCountSession } from "../../hooks/useCounts";
import { format } from "date-fns";
import { Package, MapPin, Edit2, Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotify } from "@/lib/notify";

export interface CountSessionDetailProps {
  /** Count session to display */
  session: CountSession | null;
  /** Loading state */
  loading?: boolean;
  /** On finalize callback */
  onFinalize?: () => void;
}

/**
 * CountSessionDetail - Displays count session details with line items
 * Security: All operations are tenant-scoped via API
 */
export function CountSessionDetail({
  session,
  loading = false,
  onFinalize,
}: CountSessionDetailProps) {
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editLocation, setEditLocation] = useState<string>("");

  const notify = useNotify();
  const setQtyMutation = useSetCountQty();
  const finalizeMutation = useFinalizeCountSession();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading session details...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-64 rounded-lg border border-border bg-card">
        <div className="text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Select a count session to view details</p>
        </div>
      </div>
    );
  }

  const isFinalized = session.status === "FINALIZED";
  const canEdit = !isFinalized;

  const handleEditLine = (line: CountLine) => {
    setEditingLineId(line.id);
    setEditQty(line.counted_qty);
    setEditLocation(line.location || "");
  };

  const handleSaveEdit = async () => {
    if (editingLineId === null) return;

    try {
      await setQtyMutation.mutateAsync({
        id: session.id,
        payload: {
          variant_id: session.lines.find((l) => l.id === editingLineId)!.variant_id,
          counted_qty: editQty,
          location: editLocation || undefined,
        },
      });
      setEditingLineId(null);
      notify.success("Quantity updated");
    } catch (err: any) {
      notify.error(err.message || "Failed to update quantity");
    }
  };

  const handleCancelEdit = () => {
    setEditingLineId(null);
  };

  const handleFinalize = async () => {
    if (!confirm("Are you sure you want to finalize this count? This will create inventory adjustments for any variances.")) {
      return;
    }

    try {
      await finalizeMutation.mutateAsync(session.id);
      notify.success("Count session finalized successfully");
      onFinalize?.();
    } catch (err: any) {
      notify.error(err.message || "Failed to finalize count session");
    }
  };

  const getVarianceColor = (expected: number | null, counted: number) => {
    if (expected === null) return "text-muted-foreground";
    const variance = counted - expected;
    if (variance === 0) return "text-success";
    if (variance > 0) return "text-badge-warning-text";
    return "text-badge-error-text";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-card p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-foreground">
                {session.code || `Count #${session.id}`}
              </h3>
              <StatusBadge
                status={session.status.replace("_", " ")}
                variant={isFinalized ? "completed" : session.status === "IN_PROGRESS" ? "in_progress" : "draft"}
                size="sm"
              />
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{session.store.name}</span>
              {session.scope === "ZONE" && session.zone_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {session.zone_name}
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <Button
              onClick={handleFinalize}
              disabled={finalizeMutation.isPending || session.lines.length === 0}
              size="sm"
            >
              {finalizeMutation.isPending ? "Finalizing..." : "Finalize Count"}
            </Button>
          )}
        </div>

        {session.note && (
          <p className="text-sm text-muted-foreground mt-2">{session.note}</p>
        )}

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>Created: {format(new Date(session.created_at), "MMM d, yyyy h:mm a")}</span>
          {session.started_at && (
            <span>Started: {format(new Date(session.started_at), "MMM d, yyyy h:mm a")}</span>
          )}
          {session.finalized_at && (
            <span>Finalized: {format(new Date(session.finalized_at), "MMM d, yyyy h:mm a")}</span>
          )}
        </div>
      </div>

      {/* Scanner (only for non-finalized sessions) */}
      {canEdit && (
        <div className="p-4 border-b border-border">
          <CountScanner
            sessionId={session.id}
            onScanSuccess={() => {
              // Refetch will happen automatically via React Query
            }}
          />
        </div>
      )}

      {/* Line Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {session.lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Package className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No items counted yet</p>
            {canEdit && (
              <p className="text-xs text-muted-foreground mt-1">Scan or add items to get started</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {session.lines.map((line) => {
              const isEditing = editingLineId === line.id;
              const variance = line.expected_qty !== null ? line.counted_qty - line.expected_qty : null;

              return (
                <div
                  key={line.id}
                  className="rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors"
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="font-medium text-foreground">{line.product_name}</div>
                      <div className="text-xs text-muted-foreground">SKU: {line.sku || "N/A"}</div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-20">Quantity:</label>
                        <Input
                          type="number"
                          min="0"
                          value={editQty}
                          onChange={(e) => setEditQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="flex-1"
                          autoFocus
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground w-20">Location:</label>
                        <Input
                          type="text"
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          placeholder="Optional"
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          onClick={handleSaveEdit}
                          disabled={setQtyMutation.isPending}
                          size="sm"
                          variant="default"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                        <Button
                          onClick={handleCancelEdit}
                          disabled={setQtyMutation.isPending}
                          size="sm"
                          variant="outline"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{line.product_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">SKU: {line.sku || "N/A"}</div>
                        {line.location && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            {line.location}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <div className="text-xs text-muted-foreground">Expected</div>
                          <div className="text-sm font-medium text-foreground">
                            {line.expected_qty !== null ? line.expected_qty : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Counted</div>
                          <div className={cn("text-sm font-semibold", getVarianceColor(line.expected_qty, line.counted_qty))}>
                            {line.counted_qty}
                          </div>
                        </div>
                        {variance !== null && variance !== 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">Variance</div>
                            <div className={cn("text-sm font-semibold", variance > 0 ? "text-badge-warning-text" : "text-badge-error-text")}>
                              {variance > 0 ? "+" : ""}{variance}
                            </div>
                          </div>
                        )}
                        {canEdit && (
                          <Button
                            onClick={() => handleEditLine(line)}
                            size="sm"
                            variant="ghost"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

