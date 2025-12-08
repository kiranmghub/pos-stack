// pos-frontend/src/features/inventory/settings/WebhooksPage.tsx
import React, { useState, useMemo } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { FilterBar } from "../components/FilterBar";
import { WebhookSubscriptions } from "./WebhookSubscriptions";
import { WebhookSubscriptionModal } from "./WebhookSubscriptionModal";
import { WebhookDeliveries } from "./WebhookDeliveries";
import { WebhookDeliveryDetailModal } from "./WebhookDeliveryDetailModal";
import { WebhookTestModal } from "./WebhookTestModal";
import {
  useWebhookSubscriptions,
  useWebhookSubscription,
  useWebhookDeliveries,
  useUpdateWebhookSubscription,
  useDeleteWebhookSubscription,
} from "../hooks/useWebhooks";
import { WebhookSubscription, WebhookDelivery } from "../api/webhooks";
import { Plus, RefreshCw, ExternalLink } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTablePagination } from "../components/DataTable";

export interface WebhooksPageProps {
  /** Available stores (not used for webhooks, but kept for consistency) */
  stores?: any[];
  /** Store ID filter (not used for webhooks) */
  storeId?: number | null;
  /** On store change handler (not used for webhooks) */
  onStoreChange?: (storeId: number | null) => void;
}

/**
 * WebhooksPage - Main webhooks management page
 * Security: All operations are tenant-scoped via API
 */
export function WebhooksPage({}: WebhooksPageProps) {
  const notify = useNotify();
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [subscriptionToDelete, setSubscriptionToDelete] = useState<WebhookSubscription | null>(null);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>("");
  const [showTestModal, setShowTestModal] = useState(false);
  const [subscriptionToTest, setSubscriptionToTest] = useState<WebhookSubscription | null>(null);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<number | null>(null);
  const deliveryPageSize = 20;

  // Fetch subscriptions
  const {
    data: subscriptionsData,
    isLoading: subscriptionsLoading,
    refetch: refetchSubscriptions,
  } = useWebhookSubscriptions();

  // Fetch selected subscription detail (for viewing delivery logs)
  const { data: selectedSubscription } = useWebhookSubscription(selectedSubscriptionId);
  
  // Fetch subscription being edited
  const { data: editingSubscription } = useWebhookSubscription(editingSubscriptionId);

  // Fetch deliveries for selected subscription
  const {
    data: deliveriesData,
    isLoading: deliveriesLoading,
    refetch: refetchDeliveries,
  } = useWebhookDeliveries(selectedSubscriptionId, {
    status: deliveryStatusFilter || undefined,
    page: deliveryPage,
    page_size: deliveryPageSize,
  });

  const updateMutation = useUpdateWebhookSubscription();
  const deleteMutation = useDeleteWebhookSubscription();

  const subscriptions = subscriptionsData?.results || [];
  const deliveries = deliveriesData?.results || [];

  const handleSubscriptionClick = (subscription: WebhookSubscription) => {
    setSelectedSubscriptionId(subscription.id);
    setDeliveryPage(1);
    setDeliveryStatusFilter("");
  };

  const handleCreateSuccess = () => {
    refetchSubscriptions();
    setShowCreateModal(false);
  };

  const handleEdit = (subscription: WebhookSubscription) => {
    setEditingSubscriptionId(subscription.id);
    setShowCreateModal(true);
  };

  const handleDeleteClick = (subscription: WebhookSubscription) => {
    setSubscriptionToDelete(subscription);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (subscriptionToDelete) {
      try {
        await deleteMutation.mutateAsync(subscriptionToDelete.id);
        if (selectedSubscriptionId === subscriptionToDelete.id) {
          setSelectedSubscriptionId(null);
        }
        setShowDeleteConfirm(false);
        setSubscriptionToDelete(null);
        refetchSubscriptions();
      } catch (error: any) {
        // Error is handled by mutation
      }
    }
  };

  const handleToggleActive = async (subscription: WebhookSubscription) => {
    try {
      await updateMutation.mutateAsync({
        id: subscription.id,
        payload: {
          is_active: !subscription.is_active,
        },
      });
      refetchSubscriptions();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleRetry = (delivery: WebhookDelivery) => {
    // TODO: Implement retry functionality when backend endpoint is available
    notify.info("Retry functionality coming soon");
  };

  const handleTest = (subscription: WebhookSubscription) => {
    setSubscriptionToTest(subscription);
    setShowTestModal(true);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Webhooks"
        subtitle="Manage webhook subscriptions and view delivery logs"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchSubscriptions();
                if (selectedSubscriptionId) {
                  refetchDeliveries();
                }
              }}
              disabled={subscriptionsLoading || deliveriesLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${subscriptionsLoading || deliveriesLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingSubscriptionId(null);
                setShowCreateModal(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Webhook
            </Button>
          </>
        }
      />

      {/* Split View: Subscriptions and Deliveries */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Subscriptions List */}
        <div className="flex flex-col min-h-0">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Subscriptions</h3>
            <p className="text-sm text-muted-foreground">
              Manage your webhook subscriptions and event types
            </p>
          </div>
          <WebhookSubscriptions
            subscriptions={subscriptions}
            selectedSubscriptionId={selectedSubscriptionId}
            onSubscriptionClick={handleSubscriptionClick}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
            onToggleActive={handleToggleActive}
            onTest={handleTest}
            isLoading={subscriptionsLoading}
          />
        </div>

        {/* Deliveries List */}
        <div className="flex flex-col min-h-0">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Delivery Logs</h3>
            {selectedSubscription ? (
              <p className="text-sm text-muted-foreground">
                Delivery history for: {selectedSubscription.url}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a subscription to view delivery logs
              </p>
            )}
          </div>
          {selectedSubscriptionId ? (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Delivery Filters */}
              <div className="mb-4">
                <FilterBar
                  searchQuery=""
                  onSearchChange={() => {}}
                  activeFilterCount={deliveryStatusFilter ? 1 : 0}
                  onClear={() => setDeliveryStatusFilter("")}
                >
                  <select
                    value={deliveryStatusFilter}
                    onChange={(e) => {
                      setDeliveryStatusFilter(e.target.value);
                      setDeliveryPage(1);
                    }}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="SUCCESS">Success</option>
                    <option value="FAILED">Failed</option>
                    <option value="RETRYING">Retrying</option>
                  </select>
                </FilterBar>
              </div>

              {/* Deliveries Table */}
              <div className="flex-1 min-h-0">
                <WebhookDeliveries
                  deliveries={deliveries}
                  selectedDeliveryId={selectedDeliveryId}
                  onDeliveryClick={(delivery) => setSelectedDeliveryId(delivery.id)}
                  onRetry={handleRetry}
                  isLoading={deliveriesLoading}
                />
              </div>

              {/* Pagination */}
              {deliveriesData && deliveriesData.count > deliveryPageSize && (
                <div className="mt-4">
                  <DataTablePagination
                    page={deliveryPage}
                    lastPage={Math.ceil(deliveriesData.count / deliveryPageSize)}
                    pageSize={deliveryPageSize}
                    count={deliveriesData.count}
                    onPageChange={setDeliveryPage}
                    onPageSizeChange={() => {}}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center rounded-lg border border-border bg-card">
              <div className="text-center">
                <ExternalLink className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Select a subscription to view delivery logs
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Subscription Modal */}
      <WebhookSubscriptionModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingSubscriptionId(null);
        }}
        subscription={editingSubscriptionId ? editingSubscription : null}
        onSuccess={handleCreateSuccess}
      />

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border bg-card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Delete Webhook Subscription</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete the webhook subscription for "{subscriptionToDelete?.url}"?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Detail Modal */}
      <WebhookDeliveryDetailModal
        open={!!selectedDeliveryId}
        onClose={() => setSelectedDeliveryId(null)}
        delivery={deliveries.find((d) => d.id === selectedDeliveryId) || null}
      />

      {/* Test Webhook Modal */}
      <WebhookTestModal
        open={showTestModal}
        onClose={() => {
          setShowTestModal(false);
          setSubscriptionToTest(null);
        }}
        subscription={subscriptionToTest}
      />
    </div>
  );
}

