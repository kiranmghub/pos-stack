// pos-frontend/src/features/inventory/settings/WebhookDeliveryDetailModal.tsx
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WebhookDelivery } from "../api/webhooks";
import { StatusBadge } from "../components/StatusBadge";
import { format } from "date-fns";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

export interface WebhookDeliveryDetailModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Delivery data */
  delivery: WebhookDelivery | null;
}

/**
 * WebhookDeliveryDetailModal - Display detailed webhook delivery information
 * Security: All data is tenant-scoped from the API
 */
export function WebhookDeliveryDetailModal({
  open,
  onClose,
  delivery,
}: WebhookDeliveryDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!delivery) return null;

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return "success";
      case "FAILED":
        return "error";
      case "RETRYING":
        return "warning";
      case "PENDING":
        return "info";
      default:
        return "default";
    }
  };

  const handleCopyPayload = () => {
    if (delivery) {
      // Note: payload is not in the delivery object from the API
      // This would need to be fetched separately or included in the detail endpoint
      navigator.clipboard.writeText(JSON.stringify({}, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhook Delivery Details</DialogTitle>
          <DialogDescription>Delivery ID: {delivery.id}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/50">
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <StatusBadge status={delivery.status} variant={getStatusVariant(delivery.status)} />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Attempts</div>
              <div className="text-lg font-semibold text-foreground">
                {delivery.attempt_count} / {delivery.max_retries}
              </div>
            </div>
          </div>

          {/* Event Type */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">Event Type</div>
            <div className="p-3 rounded-lg border border-border bg-muted/50">
              <div className="font-medium text-foreground">{delivery.event_type}</div>
            </div>
          </div>

          {/* Response */}
          {delivery.response_status_code && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">Response Status Code</div>
              <div className="p-3 rounded-lg border border-border bg-muted/50">
                <div className="font-medium text-foreground">{delivery.response_status_code}</div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {delivery.error_message && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">Error Message</div>
              <div className="p-3 rounded-lg border border-border bg-badge-error-bg/50">
                <div className="text-sm text-badge-error-text whitespace-pre-wrap">
                  {delivery.error_message}
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">Created At</div>
              <div className="p-3 rounded-lg border border-border bg-muted/50">
                <div className="text-sm text-foreground">
                  {format(new Date(delivery.created_at), "PPpp")}
                </div>
              </div>
            </div>
            {delivery.delivered_at && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Delivered At</div>
                <div className="p-3 rounded-lg border border-border bg-muted/50">
                  <div className="text-sm text-foreground">
                    {format(new Date(delivery.delivered_at), "PPpp")}
                  </div>
                </div>
              </div>
            )}
            {delivery.next_retry_at && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Next Retry At</div>
                <div className="p-3 rounded-lg border border-border bg-muted/50">
                  <div className="text-sm text-foreground">
                    {format(new Date(delivery.next_retry_at), "PPpp")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

