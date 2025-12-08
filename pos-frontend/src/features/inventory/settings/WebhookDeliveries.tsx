// pos-frontend/src/features/inventory/settings/WebhookDeliveries.tsx
import React from "react";
import { WebhookDelivery } from "../api/webhooks";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

export interface WebhookDeliveriesProps {
  /** Deliveries list */
  deliveries: WebhookDelivery[];
  /** Selected delivery ID */
  selectedDeliveryId?: number | null;
  /** On delivery click handler */
  onDeliveryClick?: (delivery: WebhookDelivery) => void;
  /** Loading state */
  isLoading?: boolean;
  /** On retry handler */
  onRetry?: (delivery: WebhookDelivery) => void;
}

/**
 * WebhookDeliveries - Table component for displaying webhook delivery logs
 * Security: All data is tenant-scoped from the API
 */
export function WebhookDeliveries({
  deliveries,
  selectedDeliveryId,
  onDeliveryClick,
  isLoading = false,
  onRetry,
}: WebhookDeliveriesProps) {
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

  const getStatusCodeColor = (statusCode: number | null) => {
    if (!statusCode) return "text-muted-foreground";
    if (statusCode >= 200 && statusCode < 300) return "text-badge-success-text";
    if (statusCode >= 400 && statusCode < 500) return "text-badge-error-text";
    if (statusCode >= 500) return "text-badge-error-text";
    return "text-muted-foreground";
  };

  const columns = [
    {
      key: "event_type",
      header: "Event Type",
      width: "minmax(150px, 1fr)",
      cell: (delivery: WebhookDelivery) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground truncate">
            {delivery.event_type.split(".")[1] || delivery.event_type}
          </div>
          <div className="text-xs text-muted-foreground truncate" title={delivery.event_type}>
            {delivery.event_type}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      cell: (delivery: WebhookDelivery) => (
        <StatusBadge status={delivery.status} variant={getStatusVariant(delivery.status)} />
      ),
    },
    {
      key: "attempts",
      header: "Attempts",
      width: "7rem",
      align: "center" as const,
      cell: (delivery: WebhookDelivery) => (
        <div>
          <div className="text-sm font-medium text-foreground">
            {delivery.attempt_count} / {delivery.max_retries}
          </div>
        </div>
      ),
    },
    {
      key: "response",
      header: "Response",
      width: "7rem",
      align: "center" as const,
      cell: (delivery: WebhookDelivery) => (
        <div>
          {delivery.response_status_code ? (
            <div
              className={cn(
                "text-sm font-medium",
                getStatusCodeColor(delivery.response_status_code)
              )}
            >
              {delivery.response_status_code}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">-</div>
          )}
        </div>
      ),
    },
    {
      key: "error",
      header: "Error",
      width: "minmax(150px, 1.5fr)",
      cell: (delivery: WebhookDelivery) => (
        <div className="min-w-0">
          {delivery.error_message ? (
            <div className="text-sm text-badge-error-text truncate" title={delivery.error_message}>
              {delivery.error_message}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">-</div>
          )}
        </div>
      ),
    },
    {
      key: "created",
      header: "Created",
      width: "10rem",
      cell: (delivery: WebhookDelivery) => (
        <div className="min-w-0">
          <div className="text-sm text-foreground truncate">
            {formatDistanceToNow(new Date(delivery.created_at), { addSuffix: true })}
          </div>
          <div className="text-xs text-muted-foreground truncate" title={format(new Date(delivery.created_at), "PPpp")}>
            {format(new Date(delivery.created_at), "MMM d, HH:mm")}
          </div>
        </div>
      ),
    },
    {
      key: "delivered",
      header: "Delivered",
      width: "10rem",
      cell: (delivery: WebhookDelivery) => (
        <div className="min-w-0">
          {delivery.delivered_at ? (
            <>
              <div className="text-sm text-foreground truncate">
                {formatDistanceToNow(new Date(delivery.delivered_at), { addSuffix: true })}
              </div>
              <div className="text-xs text-muted-foreground truncate" title={format(new Date(delivery.delivered_at), "PPpp")}>
                {format(new Date(delivery.delivered_at), "MMM d, HH:mm")}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">-</div>
          )}
        </div>
      ),
    },
    {
      key: "next_retry",
      header: "Next Retry",
      width: "10rem",
      cell: (delivery: WebhookDelivery) => (
        <div className="min-w-0">
          {delivery.next_retry_at ? (
            <>
              <div className="text-sm text-foreground truncate">
                {formatDistanceToNow(new Date(delivery.next_retry_at), { addSuffix: true })}
              </div>
              <div className="text-xs text-muted-foreground truncate" title={format(new Date(delivery.next_retry_at), "PPpp")}>
                {format(new Date(delivery.next_retry_at), "MMM d, HH:mm")}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">-</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "6rem",
      align: "right" as const,
      cell: (delivery: WebhookDelivery) => (
        <div className="flex justify-end items-center gap-1">
          {onRetry && delivery.status === "FAILED" && delivery.attempt_count < delivery.max_retries && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(delivery);
              }}
              title="Retry delivery"
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDeliveryClick?.(delivery);
            }}
            title="View details"
            className="h-8 w-8 p-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <DataTable
        columns={columns}
        data={deliveries}
        emptyMessage="No delivery logs found"
        isLoading={isLoading}
        onRowClick={onDeliveryClick}
        getRowClassName={(delivery) =>
          cn(
            "cursor-pointer hover:bg-accent/50",
            selectedDeliveryId === delivery.id && "bg-accent"
          )
        }
      />
    </div>
  );
}

