// pos-frontend/src/features/inventory/settings/WebhookTestModal.tsx
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
import { Label } from "@/components/ui/label";
import {
  WebhookSubscription,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from "../api/webhooks";
import { useTestWebhook, type TestWebhookResponse } from "../hooks/useWebhooks";
import { useNotify } from "@/lib/notify";
import { Play, Copy, Check, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface WebhookTestModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Webhook subscription to test */
  subscription: WebhookSubscription | null;
}

/**
 * WebhookTestModal - Test webhook subscription modal
 * Security: All operations are tenant-scoped via API
 */
export function WebhookTestModal({
  open,
  onClose,
  subscription,
}: WebhookTestModalProps) {
  const notify = useNotify();
  const testMutation = useTestWebhook();

  const [selectedEventType, setSelectedEventType] = useState<WebhookEventType | "">("");
  const [testResult, setTestResult] = useState<TestWebhookResponse | null>(null);
  const [payloadCopied, setPayloadCopied] = useState(false);
  const [responseCopied, setResponseCopied] = useState(false);

  // Reset state when modal opens/closes or subscription changes
  useEffect(() => {
    if (open && subscription) {
      // Set default to first event type
      if (subscription.event_types && subscription.event_types.length > 0) {
        setSelectedEventType(subscription.event_types[0]);
      } else {
        setSelectedEventType("");
      }
      setTestResult(null);
      setPayloadCopied(false);
      setResponseCopied(false);
    }
  }, [open, subscription]);

  // Filter event types to only those configured for this subscription
  const availableEventTypes = WEBHOOK_EVENT_TYPES.filter((event) =>
    subscription?.event_types?.includes(event.value)
  );

  const handleTest = async () => {
    if (!subscription || !selectedEventType) {
      notify.error("Please select an event type to test");
      return;
    }

    try {
      const result = await testMutation.mutateAsync({
        subscriptionId: subscription.id,
        payload: { event_type: selectedEventType },
      });
      setTestResult(result);
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleCopyPayload = () => {
    if (testResult?.payload) {
      navigator.clipboard.writeText(JSON.stringify(testResult.payload, null, 2));
      setPayloadCopied(true);
      setTimeout(() => setPayloadCopied(false), 2000);
      notify.success("Payload copied to clipboard");
    }
  };

  const handleCopyResponse = () => {
    if (testResult) {
      navigator.clipboard.writeText(JSON.stringify(testResult, null, 2));
      setResponseCopied(true);
      setTimeout(() => setResponseCopied(false), 2000);
      notify.success("Response copied to clipboard");
    }
  };

  const handleClose = () => {
    if (!testMutation.isPending) {
      setTestResult(null);
      onClose();
    }
  };

  const isLoading = testMutation.isPending;
  const hasResult = !!testResult;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test Webhook</DialogTitle>
          <DialogDescription>
            Send a test webhook to verify your endpoint is receiving events correctly
          </DialogDescription>
        </DialogHeader>

        {subscription && (
          <div className="space-y-4">
            {/* Subscription Info */}
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Webhook URL</p>
                <p className="text-sm text-muted-foreground font-mono break-all">
                  {subscription.url}
                </p>
              </div>
            </div>

            {/* Event Type Selection */}
            <div className="space-y-2">
              <Label htmlFor="event_type">
                Event Type <span className="text-destructive">*</span>
              </Label>
              <select
                id="event_type"
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value as WebhookEventType)}
                disabled={isLoading || availableEventTypes.length === 0}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-full"
              >
                <option value="">Select an event type</option>
                {availableEventTypes.map((event) => (
                  <option key={event.value} value={event.value}>
                    {event.label}
                  </option>
                ))}
              </select>
              {availableEventTypes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No event types configured for this subscription
                </p>
              )}
            </div>

            {/* Test Button */}
            <Button
              onClick={handleTest}
              disabled={isLoading || !selectedEventType || availableEventTypes.length === 0}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Test...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Send Test Webhook
                </>
              )}
            </Button>

            {/* Test Result */}
            {hasResult && (
              <div className="space-y-4">
                {/* Status Indicator */}
                <div
                  className={`rounded-lg border p-4 ${
                    testResult.success
                      ? "border-success bg-success/10"
                      : "border-destructive bg-destructive/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-success" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Webhook Delivered Successfully
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Status: {testResult.status} | Response Code:{" "}
                            {testResult.response_status_code || "N/A"}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Webhook Delivery Failed
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Status: {testResult.status} | Response Code:{" "}
                            {testResult.response_status_code || "N/A"}
                          </p>
                          {testResult.error_message && (
                            <p className="text-xs text-destructive mt-1">
                              {testResult.error_message}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payload and Response Tabs */}
                <Tabs defaultValue="payload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="payload">Payload</TabsTrigger>
                    <TabsTrigger value="response">Response</TabsTrigger>
                  </TabsList>
                  <TabsContent value="payload" className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Payload Sent</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyPayload}
                      >
                        {payloadCopied ? (
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
                    <div className="rounded-lg border border-border bg-muted/50 p-4 max-h-[300px] overflow-auto">
                      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words">
                        {JSON.stringify(testResult.payload, null, 2)}
                      </pre>
                    </div>
                  </TabsContent>
                  <TabsContent value="response" className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Response Details</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyResponse}
                      >
                        {responseCopied ? (
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
                    <div className="rounded-lg border border-border bg-muted/50 p-4 max-h-[300px] overflow-auto">
                      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words">
                        {JSON.stringify(
                          {
                            success: testResult.success,
                            status: testResult.status,
                            delivery_id: testResult.delivery_id,
                            response_status_code: testResult.response_status_code,
                            error_message: testResult.error_message,
                            attempt_count: testResult.attempt_count,
                            delivered_at: testResult.delivered_at,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

