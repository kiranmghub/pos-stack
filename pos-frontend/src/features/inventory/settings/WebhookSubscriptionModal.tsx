// pos-frontend/src/features/inventory/settings/WebhookSubscriptionModal.tsx
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WebhookSubscription,
  CreateWebhookSubscriptionPayload,
  UpdateWebhookSubscriptionPayload,
  WEBHOOK_EVENT_TYPES,
} from "../api/webhooks";
import { useCreateWebhookSubscription, useUpdateWebhookSubscription } from "../hooks/useWebhooks";
import { useNotify } from "@/lib/notify";
import { Copy, Check } from "lucide-react";

export interface WebhookSubscriptionModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Existing subscription (for edit mode) */
  subscription?: WebhookSubscription | null;
  /** On success callback */
  onSuccess?: () => void;
}

/**
 * WebhookSubscriptionModal - Create/edit webhook subscription modal
 * Security: All operations are tenant-scoped via API
 */
export function WebhookSubscriptionModal({
  open,
  onClose,
  subscription,
  onSuccess,
}: WebhookSubscriptionModalProps) {
  const notify = useNotify();
  const createMutation = useCreateWebhookSubscription();
  const updateMutation = useUpdateWebhookSubscription();

  const [formData, setFormData] = useState<CreateWebhookSubscriptionPayload>({
    url: "",
    event_types: [] as WebhookEventType[],
    description: "",
    max_retries: 3,
    retry_backoff_seconds: 60,
  });

  const [secretCopied, setSecretCopied] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Reset form when modal opens/closes or subscription changes
  useEffect(() => {
    if (open) {
      if (subscription) {
        setFormData({
          url: subscription.url,
          event_types: subscription.event_types,
          description: subscription.description || "",
          max_retries: subscription.max_retries,
          retry_backoff_seconds: subscription.retry_backoff_seconds,
        });
        setNewSecret(null);
      } else {
        setFormData({
          url: "",
          event_types: [],
          description: "",
          max_retries: 3,
          retry_backoff_seconds: 60,
        });
        setNewSecret(null);
      }
      setSecretCopied(false);
    }
  }, [open, subscription]);

  const handleEventTypeToggle = (eventType: string) => {
    setFormData((prev) => {
      const current = prev.event_types || [];
      if (current.includes(eventType as any)) {
        return { ...prev, event_types: current.filter((e) => e !== eventType) };
      } else {
        return { ...prev, event_types: [...current, eventType as any] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.url.trim()) {
      notify.error("URL is required");
      return;
    }

    // Validate URL format
    try {
      new URL(formData.url);
    } catch {
      notify.error("Invalid URL format");
      return;
    }

    if (!formData.event_types || formData.event_types.length === 0) {
      notify.error("At least one event type must be selected");
      return;
    }

    try {
      if (subscription) {
        await updateMutation.mutateAsync({
          id: subscription.id,
          payload: {
            event_types: formData.event_types,
            description: formData.description,
            max_retries: formData.max_retries,
            retry_backoff_seconds: formData.retry_backoff_seconds,
          },
        });
      } else {
        const result = await createMutation.mutateAsync(formData);
        if (result.secret) {
          setNewSecret(result.secret);
        }
      }
      onSuccess?.();
      if (!newSecret) {
        onClose();
      }
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleClose = () => {
    if (!createMutation.isPending && !updateMutation.isPending) {
      onClose();
    }
  };

  const handleCopySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {subscription ? "Edit Webhook Subscription" : "Create Webhook Subscription"}
          </DialogTitle>
          <DialogDescription>
            {subscription
              ? "Update webhook subscription settings"
              : "Configure a new webhook subscription to receive real-time inventory events"}
          </DialogDescription>
        </DialogHeader>

        {/* Secret Display (only on creation) */}
        {newSecret && (
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Webhook Secret</h4>
                <p className="text-xs text-muted-foreground">
                  Save this secret securely - it won't be shown again
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopySecret}
              >
                {secretCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="font-mono text-sm bg-background p-2 rounded border border-border break-all">
              {newSecret}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNewSecret(null);
                onClose();
              }}
              className="w-full"
            >
              I've Saved the Secret
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">
              Webhook URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              disabled={isLoading || !!subscription}
              required
              placeholder="https://example.com/webhook"
            />
            {subscription && (
              <p className="text-xs text-muted-foreground">
                URL cannot be changed after creation
              </p>
            )}
          </div>

          {/* Event Types */}
          <div className="space-y-2">
            <Label>
              Event Types <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 rounded-lg border border-border bg-muted/50">
              {WEBHOOK_EVENT_TYPES.map((event) => (
                <label
                  key={event.value}
                  className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-background"
                >
                  <input
                    type="checkbox"
                    checked={(formData.event_types || []).includes(event.value)}
                    onChange={() => handleEventTypeToggle(event.value)}
                    disabled={isLoading}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-foreground">{event.label}</span>
                </label>
              ))}
            </div>
            {(!formData.event_types || formData.event_types.length === 0) && (
              <p className="text-xs text-muted-foreground">
                Select at least one event type
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={isLoading}
              placeholder="Optional description for this webhook"
              maxLength={200}
            />
          </div>

          {/* Retry Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_retries">Max Retries</Label>
              <Input
                id="max_retries"
                type="number"
                min="0"
                max="10"
                value={formData.max_retries}
                onChange={(e) =>
                  setFormData({ ...formData, max_retries: parseInt(e.target.value, 10) || 0 })
                }
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">0-10</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry_backoff_seconds">Retry Backoff (seconds)</Label>
              <Input
                id="retry_backoff_seconds"
                type="number"
                min="1"
                max="3600"
                value={formData.retry_backoff_seconds}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    retry_backoff_seconds: parseInt(e.target.value, 10) || 60,
                  })
                }
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">1-3600</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              {newSecret ? "Close" : "Cancel"}
            </Button>
            {!newSecret && (
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : subscription ? "Update" : "Create"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

