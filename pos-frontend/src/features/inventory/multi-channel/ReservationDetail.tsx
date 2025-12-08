// pos-frontend/src/features/inventory/multi-channel/ReservationDetail.tsx
import React from "react";
import { Reservation } from "../api/reservations";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "../components";
import {
  Package,
  Store,
  ShoppingCart,
  Globe,
  Clock,
  User,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

export interface ReservationDetailProps {
  /** Reservation data */
  reservation: Reservation | null;
  /** On commit handler */
  onCommit?: () => void;
  /** On release handler */
  onRelease?: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Is committing */
  isCommitting?: boolean;
  /** Is releasing */
  isReleasing?: boolean;
}

/**
 * ReservationDetail - Reservation detail view with actions
 * Security: All data is tenant-scoped from the API
 */
export function ReservationDetail({
  reservation,
  onCommit,
  onRelease,
  isLoading = false,
  isCommitting = false,
  isReleasing = false,
}: ReservationDetailProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <LoadingSkeleton variant="card" height={400} />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">Select a reservation to view details</p>
      </div>
    );
  }

  const getChannelIcon = (channel: string) => {
    switch (channel?.toUpperCase()) {
      case "POS":
        return <ShoppingCart className="h-4 w-4" />;
      case "WEB":
        return <Globe className="h-4 w-4" />;
      case "MARKETPLACE":
        return <Store className="h-4 w-4" />;
      default:
        return <Store className="h-4 w-4" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "success";
      case "COMMITTED":
        return "info";
      case "RELEASED":
        return "muted";
      case "EXPIRED":
        return "error";
      default:
        return "default";
    }
  };

  const isExpired = reservation.expires_at ? new Date(reservation.expires_at) < new Date() : false;
  const isExpiringSoon = reservation.expires_at
    ? (new Date(reservation.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60) <= 24
    : false;

  const canCommit = reservation.status === "ACTIVE" && !isExpired;
  const canRelease = reservation.status === "ACTIVE";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Reservation #{reservation.id}</h2>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={reservation.status} variant={getStatusVariant(reservation.status)} />
                {isExpired && (
                  <span className="text-xs text-badge-error-text font-medium">Expired</span>
                )}
                {isExpiringSoon && !isExpired && (
                  <span className="text-xs text-badge-warning-text font-medium">Expiring Soon</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        {canCommit || canRelease ? (
          <div className="flex items-center gap-2 pt-4 border-t border-border">
            {canCommit && (
              <Button
                onClick={onCommit}
                disabled={isCommitting || isReleasing}
                className="flex-1"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isCommitting ? "Committing..." : "Commit"}
              </Button>
            )}
            {canRelease && (
              <Button
                variant="outline"
                onClick={onRelease}
                disabled={isCommitting || isReleasing}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-2" />
                {isReleasing ? "Releasing..." : "Release"}
              </Button>
            )}
          </div>
        ) : (
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              This reservation cannot be modified (status: {reservation.status})
            </p>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Product Information */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Product Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Product Name</span>
              <span className="text-sm font-medium text-foreground">{reservation.product_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">SKU</span>
              <span className="text-sm font-medium text-foreground">{reservation.sku}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Quantity</span>
              <span className="text-lg font-semibold text-foreground">{reservation.quantity}</span>
            </div>
          </div>
        </div>

        {/* Store Information */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Store className="h-4 w-4" />
            Store Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Store Name</span>
              <span className="text-sm font-medium text-foreground">{reservation.store_name}</span>
            </div>
            {reservation.store_code && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Store Code</span>
                <span className="text-sm font-medium text-foreground">{reservation.store_code}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Channel</span>
              <div className="flex items-center gap-2">
                {getChannelIcon(reservation.channel)}
                <span className="text-sm font-medium text-foreground">
                  {reservation.channel || "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Reference Information */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Reference Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reference Type</span>
              <span className="text-sm font-medium text-foreground">{reservation.ref_type}</span>
            </div>
            {reservation.ref_id && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Reference ID</span>
                <span className="text-sm font-medium text-foreground">{reservation.ref_id}</span>
              </div>
            )}
          </div>
        </div>

        {/* Timestamps */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timestamps
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <div className="text-right">
                <div className="text-sm font-medium text-foreground">
                  {formatDistanceToNow(new Date(reservation.created_at), { addSuffix: true })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(reservation.created_at), "PPpp")}
                </div>
              </div>
            </div>
            {reservation.expires_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Expires</span>
                <div className="text-right">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      isExpired
                        ? "text-badge-error-text"
                        : isExpiringSoon
                        ? "text-badge-warning-text"
                        : "text-foreground"
                    )}
                  >
                    {isExpired
                      ? "Expired"
                      : formatDistanceToNow(new Date(reservation.expires_at), { addSuffix: true })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(reservation.expires_at), "PPpp")}
                  </div>
                </div>
              </div>
            )}
            {reservation.created_by && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Created By</span>
                <div className="flex items-center gap-2">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{reservation.created_by}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      {reservation.note && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Notes</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">{reservation.note}</p>
        </div>
      )}
    </div>
  );
}

