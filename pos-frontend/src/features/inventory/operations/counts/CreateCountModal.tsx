// pos-frontend/src/features/inventory/operations/counts/CreateCountModal.tsx
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
// Using native textarea - can be replaced with a proper Textarea component if available
// Using native select for now - can be replaced with a proper Select component if available
import { useCreateCountSession } from "../../hooks/useCounts";
import { StoreOption } from "../../components/StoreFilter";
import { useNotify } from "@/lib/notify";
import { AlertCircle } from "lucide-react";

export interface CreateCountModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** On success callback */
  onSuccess?: () => void;
  /** Available stores */
  stores: StoreOption[];
  /** Default store ID */
  defaultStoreId?: number | null;
}

/**
 * CreateCountModal - Modal for creating new count sessions
 * Security: Validates store ownership and scope rules via API
 */
export function CreateCountModal({
  open,
  onClose,
  onSuccess,
  stores,
  defaultStoreId,
}: CreateCountModalProps) {
  const [storeId, setStoreId] = useState<number | null>(defaultStoreId || null);
  const [scope, setScope] = useState<"FULL_STORE" | "ZONE">("FULL_STORE");
  const [zoneName, setZoneName] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");

  const notify = useNotify();
  const createMutation = useCreateCountSession();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!storeId) {
      notify.error("Please select a store");
      return;
    }

    if (scope === "ZONE" && !zoneName.trim()) {
      notify.error("Zone name is required for zone counts");
      return;
    }

    try {
      await createMutation.mutateAsync({
        store_id: storeId,
        scope,
        zone_name: scope === "ZONE" ? zoneName.trim() : undefined,
        code: code.trim() || undefined,
        note: note.trim() || undefined,
      });
      notify.success("Count session created successfully");
      // Reset form
      setStoreId(defaultStoreId || null);
      setScope("FULL_STORE");
      setZoneName("");
      setCode("");
      setNote("");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      notify.error(err.message || "Failed to create count session");
    }
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Count Session</DialogTitle>
          <DialogDescription>
            Create a new cycle count session. Full store counts can only have one active session per store.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Store Selection */}
          <div className="space-y-2">
            <Label htmlFor="store">Store *</Label>
            <select
              id="store"
              value={storeId?.toString() || ""}
              onChange={(e) => setStoreId(e.target.value ? parseInt(e.target.value, 10) : null)}
              disabled={createMutation.isPending}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select a store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id.toString()}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </div>

          {/* Scope Selection */}
          <div className="space-y-2">
            <Label htmlFor="scope">Scope *</Label>
            <select
              id="scope"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as "FULL_STORE" | "ZONE");
                if (e.target.value === "FULL_STORE") {
                  setZoneName("");
                }
              }}
              disabled={createMutation.isPending}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="FULL_STORE">Full Store</option>
              <option value="ZONE">Zone</option>
            </select>
            {scope === "FULL_STORE" && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Only one active full store count session can exist per store at a time.
                </span>
              </div>
            )}
          </div>

          {/* Zone Name (conditional) */}
          {scope === "ZONE" && (
            <div className="space-y-2">
              <Label htmlFor="zoneName">Zone Name *</Label>
              <Input
                id="zoneName"
                type="text"
                placeholder="e.g., Aisle 1, Back Room, etc."
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                disabled={createMutation.isPending}
                required
              />
            </div>
          )}

          {/* Code (optional) */}
          <div className="space-y-2">
            <Label htmlFor="code">Code (optional)</Label>
            <Input
              id="code"
              type="text"
              placeholder="Auto-generated if left empty"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={createMutation.isPending}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <textarea
              id="note"
              placeholder="Add any notes about this count session..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={createMutation.isPending}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !storeId}>
              {createMutation.isPending ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

