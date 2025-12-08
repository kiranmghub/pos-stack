// pos-frontend/src/features/inventory/api/webhooks.ts
import { apiFetchJSON } from "@/lib/auth";

export type WebhookEventType =
  | "inventory.stock_changed"
  | "inventory.transfer_sent"
  | "inventory.transfer_received"
  | "inventory.count_finalized"
  | "purchase_order.received";

export interface WebhookSubscription {
  id: number;
  url: string;
  event_types: WebhookEventType[];
  is_active: boolean;
  description: string;
  max_retries: number;
  retry_backoff_seconds: number;
  last_triggered_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at?: string | null;
  secret?: string; // Only returned on creation
}

export interface WebhookSubscriptionListResponse {
  results: WebhookSubscription[];
  count: number;
}

export interface WebhookSubscriptionListParams {
  event_type?: string;
}

export interface CreateWebhookSubscriptionPayload {
  url: string;
  event_types: WebhookEventType[];
  description?: string;
  max_retries?: number;
  retry_backoff_seconds?: number;
}

export interface UpdateWebhookSubscriptionPayload {
  event_types?: WebhookEventType[];
  is_active?: boolean;
  description?: string;
  max_retries?: number;
  retry_backoff_seconds?: number;
}

export interface WebhookDelivery {
  id: number;
  event_type: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "RETRYING";
  attempt_count: number;
  max_retries: number;
  response_status_code: number | null;
  error_message: string;
  created_at: string;
  delivered_at: string | null;
  next_retry_at: string | null;
}

export interface WebhookDeliveryListResponse {
  results: WebhookDelivery[];
  count: number;
}

export interface WebhookDeliveryListParams {
  status?: string;
  page?: number;
  page_size?: number;
}

export const WEBHOOK_EVENT_TYPES: Array<{ value: WebhookEventType; label: string }> = [
  { value: "inventory.stock_changed", label: "Stock Changed" },
  { value: "inventory.transfer_sent", label: "Transfer Sent" },
  { value: "inventory.transfer_received", label: "Transfer Received" },
  { value: "inventory.count_finalized", label: "Count Finalized" },
  { value: "purchase_order.received", label: "Purchase Order Received" },
];

/**
 * Fetch webhook subscriptions list
 * Security: Tenant-scoped via API
 */
export async function getWebhookSubscriptions(
  params?: WebhookSubscriptionListParams
): Promise<WebhookSubscriptionListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.event_type) {
    searchParams.append("event_type", params.event_type);
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/webhooks/subscriptions${queryString ? `?${queryString}` : ""}`
  );
}

/**
 * Fetch webhook subscription detail
 * Security: Tenant-scoped via API
 */
export async function getWebhookSubscription(id: number): Promise<WebhookSubscription> {
  return apiFetchJSON(`/api/v1/webhooks/subscriptions/${id}`);
}

/**
 * Create a new webhook subscription
 * Security: Tenant-scoped via API
 */
export async function createWebhookSubscription(
  payload: CreateWebhookSubscriptionPayload
): Promise<WebhookSubscription & { secret: string }> {
  return apiFetchJSON("/api/v1/webhooks/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Update webhook subscription
 * Security: Tenant-scoped via API
 */
export async function updateWebhookSubscription(
  id: number,
  payload: UpdateWebhookSubscriptionPayload
): Promise<WebhookSubscription> {
  return apiFetchJSON(`/api/v1/webhooks/subscriptions/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Delete webhook subscription
 * Security: Tenant-scoped via API
 */
export async function deleteWebhookSubscription(id: number): Promise<void> {
  return apiFetchJSON(`/api/v1/webhooks/subscriptions/${id}`, {
    method: "DELETE",
  });
}

/**
 * Fetch webhook delivery logs for a subscription
 * Security: Tenant-scoped via API
 */
export async function getWebhookDeliveries(
  subscriptionId: number,
  params?: WebhookDeliveryListParams
): Promise<WebhookDeliveryListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.status) {
    searchParams.append("status", params.status);
  }
  if (params?.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params?.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/webhooks/subscriptions/${subscriptionId}/deliveries${queryString ? `?${queryString}` : ""}`
  );
}

export interface TestWebhookPayload {
  event_type?: WebhookEventType;
}

export interface TestWebhookResponse {
  success: boolean;
  delivery_id: number;
  event_type: string;
  payload: any;
  status: string;
  response_status_code: number | null;
  error_message: string;
  attempt_count: number;
  delivered_at: string | null;
}

/**
 * Test a webhook subscription by sending a sample payload
 * Security: Tenant-scoped via API
 */
export async function testWebhook(
  subscriptionId: number,
  payload?: TestWebhookPayload
): Promise<TestWebhookResponse> {
  return apiFetchJSON(`/api/v1/webhooks/subscriptions/${subscriptionId}/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });
}

