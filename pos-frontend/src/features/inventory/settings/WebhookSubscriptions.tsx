// pos-frontend/src/features/inventory/settings/WebhookSubscriptions.tsx
import React from "react";
import { WebhookSubscription } from "../api/webhooks";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Edit, Trash2, Eye, EyeOff, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export interface WebhookSubscriptionsProps {
  /** Subscriptions list */
  subscriptions: WebhookSubscription[];
  /** Selected subscription ID */
  selectedSubscriptionId?: number | null;
  /** On subscription click handler */
  onSubscriptionClick?: (subscription: WebhookSubscription) => void;
  /** On edit handler */
  onEdit?: (subscription: WebhookSubscription) => void;
  /** On delete handler */
  onDelete?: (subscription: WebhookSubscription) => void;
  /** On toggle active handler */
  onToggleActive?: (subscription: WebhookSubscription) => void;
  /** On test handler */
  onTest?: (subscription: WebhookSubscription) => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * WebhookSubscriptions - Table component for displaying webhook subscriptions
 * Security: All data is tenant-scoped from the API
 */
export function WebhookSubscriptions({
  subscriptions,
  selectedSubscriptionId,
  onSubscriptionClick,
  onEdit,
  onDelete,
  onToggleActive,
  onTest,
  isLoading = false,
}: WebhookSubscriptionsProps) {
  const getStatusVariant = (isActive: boolean) => {
    return isActive ? "success" : "muted";
  };

  const columns = [
    {
      key: "url",
      header: "URL",
      width: "minmax(300px, 2fr)",
      cell: (subscription: WebhookSubscription) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground truncate" title={subscription.url}>
            {subscription.url}
          </div>
          {subscription.description && (
            <div className="text-xs text-muted-foreground truncate">
              {subscription.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "event_types",
      header: "Event Types",
      width: "minmax(150px, 1fr)",
      cell: (subscription: WebhookSubscription) => (
        <div className="flex flex-wrap gap-1">
          {subscription.event_types.slice(0, 2).map((eventType) => (
            <span
              key={eventType}
              className="text-xs px-2 py-1 rounded bg-muted text-foreground whitespace-nowrap"
            >
              {eventType.split(".")[1] || eventType}
            </span>
          ))}
          {subscription.event_types.length > 2 && (
            <span className="text-xs px-2 py-1 rounded bg-muted text-foreground whitespace-nowrap">
              +{subscription.event_types.length - 2} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      cell: (subscription: WebhookSubscription) => (
        <StatusBadge
          status={subscription.is_active ? "Active" : "Inactive"}
          variant={getStatusVariant(subscription.is_active)}
        />
      ),
    },
    {
      key: "last_triggered",
      header: "Last Triggered",
      width: "10rem",
      cell: (subscription: WebhookSubscription) => (
        <div>
          {subscription.last_triggered_at ? (
            <div className="text-sm text-foreground">
              {formatDistanceToNow(new Date(subscription.last_triggered_at), { addSuffix: true })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Never</div>
          )}
        </div>
      ),
    },
    {
      key: "failure_count",
      header: "Failures",
      width: "6rem",
      align: "center" as const,
      cell: (subscription: WebhookSubscription) => (
        <div>
          {subscription.failure_count > 0 ? (
            <div className="text-sm font-medium text-badge-error-text">
              {subscription.failure_count}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">0</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "12rem",
      align: "right" as const,
      cell: (subscription: WebhookSubscription) => (
        <div className="flex justify-end items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onTest?.(subscription);
            }}
            title="Test webhook"
            className="h-8 w-8 p-0"
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive?.(subscription);
            }}
            title={subscription.is_active ? "Deactivate" : "Activate"}
            className="h-8 w-8 p-0"
          >
            {subscription.is_active ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(subscription);
            }}
            title="Edit subscription"
            className="h-8 w-8 p-0"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(subscription);
            }}
            title="Delete subscription"
            className="h-8 w-8 p-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <DataTable
        columns={columns}
        data={subscriptions}
        emptyMessage="No webhook subscriptions found"
        isLoading={isLoading}
        onRowClick={onSubscriptionClick}
        getRowClassName={(subscription) =>
          cn(
            "cursor-pointer hover:bg-accent/50",
            selectedSubscriptionId === subscription.id && "bg-accent",
            !subscription.is_active && "opacity-60"
          )
        }
      />
    </div>
  );
}

