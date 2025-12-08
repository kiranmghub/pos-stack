// pos-frontend/src/features/inventory/multi-channel/ReservationList.tsx
import React from "react";
import { Reservation } from "../api/reservations";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Clock, ShoppingCart, Globe, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export interface ReservationListProps {
  /** Reservations list */
  reservations: Reservation[];
  /** Selected reservation ID */
  selectedReservationId?: number | null;
  /** On reservation click handler */
  onReservationClick?: (reservation: Reservation) => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * ReservationList - Table component for displaying reservations
 * Security: All data is tenant-scoped from the API
 */
export function ReservationList({
  reservations,
  selectedReservationId,
  onReservationClick,
  isLoading = false,
}: ReservationListProps) {
  const getChannelIcon = (channel: string) => {
    switch (channel?.toUpperCase()) {
      case "POS":
        return <ShoppingCart className="h-3 w-3" />;
      case "WEB":
        return <Globe className="h-3 w-3" />;
      case "MARKETPLACE":
        return <Store className="h-3 w-3" />;
      default:
        return <Store className="h-3 w-3" />;
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

  const isExpiringSoon = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const expires = new Date(expiresAt);
    const now = new Date();
    const hoursUntilExpiry = (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilExpiry > 0 && hoursUntilExpiry <= 24; // Expiring within 24 hours
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const columns = [
    {
      key: "product",
      header: "Product",
      render: (reservation: Reservation) => (
        <div>
          <div className="font-medium text-foreground">{reservation.product_name}</div>
          <div className="text-xs text-muted-foreground">SKU: {reservation.sku}</div>
        </div>
      ),
    },
    {
      key: "store",
      header: "Store",
      render: (reservation: Reservation) => (
        <div>
          <div className="text-sm text-foreground">{reservation.store_name}</div>
          {reservation.store_code && (
            <div className="text-xs text-muted-foreground">{reservation.store_code}</div>
          )}
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      render: (reservation: Reservation) => (
        <div className="font-medium text-foreground">{reservation.quantity}</div>
      ),
    },
    {
      key: "channel",
      header: "Channel",
      render: (reservation: Reservation) => (
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground">{getChannelIcon(reservation.channel)}</div>
          <span className="text-sm text-foreground">{reservation.channel || "N/A"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (reservation: Reservation) => (
        <StatusBadge status={reservation.status} variant={getStatusVariant(reservation.status)} />
      ),
    },
    {
      key: "ref_type",
      header: "Reference",
      render: (reservation: Reservation) => (
        <div>
          <div className="text-sm text-foreground">{reservation.ref_type}</div>
          {reservation.ref_id && (
            <div className="text-xs text-muted-foreground">ID: {reservation.ref_id}</div>
          )}
        </div>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      render: (reservation: Reservation) => {
        if (!reservation.expires_at) {
          return <span className="text-sm text-muted-foreground">Never</span>;
        }
        const expired = isExpired(reservation.expires_at);
        const expiringSoon = isExpiringSoon(reservation.expires_at);
        return (
          <div className="flex items-center gap-1">
            {expired || expiringSoon ? (
              <Clock className={cn("h-3 w-3", expired ? "text-badge-error-text" : "text-badge-warning-text")} />
            ) : null}
            <span
              className={cn(
                "text-sm",
                expired
                  ? "text-badge-error-text font-medium"
                  : expiringSoon
                  ? "text-badge-warning-text font-medium"
                  : "text-foreground"
              )}
            >
              {expired
                ? "Expired"
                : formatDistanceToNow(new Date(reservation.expires_at), { addSuffix: true })}
            </span>
          </div>
        );
      },
    },
    {
      key: "created",
      header: "Created",
      render: (reservation: Reservation) => (
        <div>
          <div className="text-sm text-foreground">
            {formatDistanceToNow(new Date(reservation.created_at), { addSuffix: true })}
          </div>
          {reservation.created_by && (
            <div className="text-xs text-muted-foreground">{reservation.created_by}</div>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (reservation: Reservation) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onReservationClick?.(reservation);
            }}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <DataTable
        columns={columns}
        data={reservations}
        emptyMessage="No reservations found"
        isLoading={isLoading}
        onRowClick={onReservationClick}
        getRowClassName={(reservation) =>
          cn(
            "cursor-pointer hover:bg-accent/50",
            selectedReservationId === reservation.id && "bg-accent",
            isExpired(reservation.expires_at) && "opacity-60"
          )
        }
      />
    </div>
  );
}

