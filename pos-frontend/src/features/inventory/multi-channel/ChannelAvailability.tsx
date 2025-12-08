// pos-frontend/src/features/inventory/multi-channel/ChannelAvailability.tsx
import React from "react";
import { AvailabilityResponse } from "../api/channels";
import { StockBadge } from "../components/StockBadge";
import { Button } from "@/components/ui/button";
import { Package, ShoppingCart, Globe, Store, Truck, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChannelAvailabilityProps {
  /** Availability data */
  availability: AvailabilityResponse | null;
  /** Channel name */
  channel: string;
  /** Loading state */
  isLoading?: boolean;
  /** On reserve handler */
  onReserve?: () => void;
  /** On release handler */
  onRelease?: () => void;
  /** On commit handler */
  onCommit?: () => void;
  /** Is rate limited */
  isRateLimited?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * ChannelAvailability - Per-channel availability display card
 * Security: All data is tenant-scoped from the API
 */
export function ChannelAvailability({
  availability,
  channel,
  isLoading = false,
  onReserve,
  onRelease,
  onCommit,
  isRateLimited = false,
  className,
}: ChannelAvailabilityProps) {
  const getChannelIcon = (channelName: string) => {
    switch (channelName?.toUpperCase()) {
      case "POS":
        return <ShoppingCart className="h-5 w-5" />;
      case "WEB":
        return <Globe className="h-5 w-5" />;
      case "MARKETPLACE":
        return <Store className="h-5 w-5" />;
      default:
        return <Store className="h-5 w-5" />;
    }
  };

  const getChannelColor = (channelName: string) => {
    switch (channelName?.toUpperCase()) {
      case "POS":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "WEB":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "MARKETPLACE":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
    }
  };

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="h-8 bg-muted rounded w-1/2"></div>
          <div className="h-4 bg-muted rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!availability) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">No availability data</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 space-y-4", className)}>
      {/* Channel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-lg", getChannelColor(channel))}>
            {getChannelIcon(channel)}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{channel}</h3>
            <p className="text-xs text-muted-foreground">Channel Availability</p>
          </div>
        </div>
        {isRateLimited && (
          <div className="flex items-center gap-1 text-xs text-badge-warning-text">
            <Lock className="h-3 w-3" />
            <span>Rate Limited</span>
          </div>
        )}
      </div>

      {/* Availability Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Available</div>
          <div className="text-2xl font-bold text-foreground">{availability.available}</div>
          <StockBadge quantity={availability.available} lowStockThreshold={10} />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">On Hand</div>
          <div className="text-lg font-semibold text-foreground">{availability.on_hand}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Reserved</div>
          <div className="text-lg font-semibold text-foreground">{availability.reserved}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Truck className="h-3 w-3" />
            In Transit
          </div>
          <div className="text-lg font-semibold text-foreground">{availability.in_transit}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border">
        {onReserve && (
          <Button
            size="sm"
            onClick={onReserve}
            disabled={isRateLimited || availability.available <= 0}
            className="w-full"
          >
            <Package className="h-4 w-4 mr-2" />
            Reserve Stock
          </Button>
        )}
        {onRelease && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRelease}
            disabled={isRateLimited || availability.reserved <= 0}
            className="w-full"
          >
            Release Reservation
          </Button>
        )}
        {onCommit && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCommit}
            disabled={isRateLimited || availability.reserved <= 0}
            className="w-full"
          >
            Commit Reservation
          </Button>
        )}
      </div>
    </div>
  );
}

