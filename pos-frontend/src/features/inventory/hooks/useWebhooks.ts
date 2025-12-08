// pos-frontend/src/features/inventory/hooks/useWebhooks.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getWebhookSubscriptions,
  getWebhookSubscription,
  createWebhookSubscription,
  updateWebhookSubscription,
  deleteWebhookSubscription,
  getWebhookDeliveries,
  testWebhook,
  type WebhookSubscriptionListParams,
  type CreateWebhookSubscriptionPayload,
  type UpdateWebhookSubscriptionPayload,
  type WebhookDeliveryListParams,
  type TestWebhookPayload,
  type TestWebhookResponse,
} from "../api/webhooks";
import { useNotify } from "@/lib/notify";

/**
 * React Query hook for webhook subscriptions list
 * Security: Tenant-scoped via API
 */
export function useWebhookSubscriptions(params?: WebhookSubscriptionListParams) {
  return useQuery({
    queryKey: ["inventory", "webhooks", "subscriptions", params],
    queryFn: () => getWebhookSubscriptions(params),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for webhook subscription detail
 * Security: Tenant-scoped via API
 */
export function useWebhookSubscription(id: number | null) {
  return useQuery({
    queryKey: ["inventory", "webhooks", "subscriptions", id],
    queryFn: () => getWebhookSubscription(id!),
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * React Query hook for webhook deliveries
 * Security: Tenant-scoped via API
 */
export function useWebhookDeliveries(
  subscriptionId: number | null,
  params?: WebhookDeliveryListParams
) {
  return useQuery({
    queryKey: ["inventory", "webhooks", "deliveries", subscriptionId, params],
    queryFn: () => getWebhookDeliveries(subscriptionId!, params),
    enabled: !!subscriptionId,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * React Query mutation for creating webhook subscription
 * Security: Tenant-scoped via API
 */
export function useCreateWebhookSubscription() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (payload: CreateWebhookSubscriptionPayload) =>
      createWebhookSubscription(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "webhooks"] });
      notify.success("Webhook subscription created successfully");
      // Show secret in a toast or modal (important for user to save)
      if (data.secret) {
        notify.info(
          `Webhook secret: ${data.secret}. Please save this securely - it won't be shown again.`,
          10000
        );
      }
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to create webhook subscription");
    },
  });
}

/**
 * React Query mutation for updating webhook subscription
 * Security: Tenant-scoped via API
 */
export function useUpdateWebhookSubscription() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: UpdateWebhookSubscriptionPayload;
    }) => updateWebhookSubscription(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "webhooks"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory", "webhooks", "subscriptions", variables.id],
      });
      notify.success("Webhook subscription updated successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to update webhook subscription");
    },
  });
}

/**
 * React Query mutation for deleting webhook subscription
 * Security: Tenant-scoped via API
 */
export function useDeleteWebhookSubscription() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: (id: number) => deleteWebhookSubscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "webhooks"] });
      notify.success("Webhook subscription deleted successfully");
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to delete webhook subscription");
    },
  });
}

/**
 * React Query mutation for testing a webhook subscription
 * Security: Tenant-scoped via API
 */
export function useTestWebhook() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  return useMutation({
    mutationFn: ({ subscriptionId, payload }: { subscriptionId: number; payload?: TestWebhookPayload }) =>
      testWebhook(subscriptionId, payload),
    onSuccess: (data: TestWebhookResponse) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "webhooks"] });
      if (data.success) {
        notify.success("Webhook test successful");
      } else {
        notify.error(data.error_message || "Webhook test failed");
      }
    },
    onError: (error: any) => {
      notify.error(error.message || "Failed to test webhook");
    },
  });
}

