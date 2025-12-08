// pos-frontend/src/features/inventory/multi-channel/AvailabilityView.tsx
import React, { useState, useEffect } from "react";
import { PageHeading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoreFilter, StoreOption } from "../components/StoreFilter";
import { ChannelAvailability } from "./ChannelAvailability";
import { ReserveStockModal } from "./ReserveStockModal";
import { useAvailability, useChannelRelease, useChannelCommit } from "../hooks/useChannels";
import { useReservationsList } from "../hooks/useReservations";
import { RefreshCw, Search, AlertCircle } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { LoadingSkeleton, EmptyState } from "../components";
import { apiFetchJSON } from "@/lib/auth";

export interface AvailabilityViewProps {
  /** Available stores */
  stores?: StoreOption[];
  /** Store ID filter */
  storeId?: number | null;
  /** On store change handler */
  onStoreChange?: (storeId: number | null) => void;
}

interface VariantOption {
  id: number;
  sku: string;
  product_name: string;
}

/**
 * AvailabilityView - Multi-channel availability viewer
 * Security: All operations are tenant-scoped via API, rate limited
 */
export function AvailabilityView({
  stores = [],
  storeId,
  onStoreChange,
}: AvailabilityViewProps) {
  const notify = useNotify();
  const [variantSearch, setVariantSearch] = useState("");
  const [selectedVariant, setSelectedVariant] = useState<VariantOption | null>(null);
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [variantSearchLoading, setVariantSearchLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [showReserveModal, setShowReserveModal] = useState(false);

  // Fetch availability
  const {
    data: availability,
    isLoading: availabilityLoading,
    refetch: refetchAvailability,
  } = useAvailability(selectedVariant?.id || null, storeId || null);

  // Fetch reservations for this variant/store to show release/commit options
  const { data: reservationsData } = useReservationsList({
    variant_id: selectedVariant?.id || undefined,
    store_id: storeId || undefined,
    status: "ACTIVE",
  });

  const releaseMutation = useChannelRelease();
  const commitMutation = useChannelCommit();

  // Search variants
  useEffect(() => {
    if (!variantSearch || variantSearch.length < 2) {
      setVariantOptions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setVariantSearchLoading(true);
      try {
        const response = await apiFetchJSON<any>(
          `/api/v1/catalog/variants?q=${encodeURIComponent(variantSearch)}&limit=20`
        );
        setVariantOptions(
          response.results?.map((v: any) => ({
            id: v.id,
            sku: v.sku || "",
            product_name: v.product?.name || v.name || "",
          })) || []
        );
      } catch (error) {
        console.error("Failed to search variants:", error);
        setVariantOptions([]);
      } finally {
        setVariantSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [variantSearch]);

  const handleVariantSelect = (variant: VariantOption) => {
    setSelectedVariant(variant);
    setVariantSearch(variant.product_name);
    setVariantOptions([]);
  };

  const handleReserve = (channel: string) => {
    setSelectedChannel(channel);
    setShowReserveModal(true);
  };

  const handleRelease = async (reservationId: number) => {
    try {
      await releaseMutation.mutateAsync({ reservation_id: reservationId });
      refetchAvailability();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleCommit = async (reservationId: number) => {
    try {
      await commitMutation.mutateAsync({ reservation_id: reservationId });
      refetchAvailability();
    } catch (error: any) {
      // Error is handled by mutation
    }
  };

  const handleReserveSuccess = () => {
    refetchAvailability();
    setShowReserveModal(false);
    setSelectedChannel(null);
  };

  // Get active reservations for selected variant/store
  const activeReservations = reservationsData?.results || [];
  const reservationsByChannel = activeReservations.reduce((acc, r) => {
    if (!acc[r.channel]) {
      acc[r.channel] = [];
    }
    acc[r.channel].push(r);
    return acc;
  }, {} as Record<string, typeof activeReservations>);

  // Available channels
  const channels = ["POS", "WEB", "MARKETPLACE"];

  return (
    <div className="flex flex-col h-full">
      <PageHeading
        title="Multi-Channel Availability"
        subtitle="Check and manage inventory availability across channels"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAvailability()}
            disabled={availabilityLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${availabilityLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Store Filter */}
          <div className="space-y-2">
            <Label>Store</Label>
            <StoreFilter
              stores={stores}
              selectedStoreId={storeId}
              onStoreChange={onStoreChange || (() => {})}
              showAllStores={false}
              required={true}
            />
          </div>

          {/* Variant Search */}
          <div className="space-y-2">
            <Label>Product/Variant</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                placeholder="Search by product name or SKU..."
                className="pl-10"
              />
              {variantSearchLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {variantOptions.length > 0 && (
              <div className="border border-border rounded-md max-h-48 overflow-y-auto bg-card">
                {variantOptions.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => handleVariantSelect(variant)}
                    className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border last:border-b-0"
                  >
                    <div className="font-medium text-foreground">{variant.product_name}</div>
                    <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                  </button>
                ))}
              </div>
            )}
            {selectedVariant && (
              <div className="text-sm text-foreground">
                Selected: <span className="font-medium">{selectedVariant.product_name}</span> (SKU:{" "}
                {selectedVariant.sku})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Availability Display */}
      {!storeId ? (
        <EmptyState
          icon={<AlertCircle className="h-12 w-12 text-muted-foreground" />}
          title="Select a Store"
          description="Please select a store to view availability"
        />
      ) : !selectedVariant ? (
        <EmptyState
          icon={<Search className="h-12 w-12 text-muted-foreground" />}
          title="Search for a Product"
          description="Search for a product or variant to view availability across channels"
        />
      ) : availabilityLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} variant="card" height={200} />
          ))}
        </div>
      ) : availability ? (
        <div className="space-y-6">
          {/* Product Summary */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">{availability.product_name}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">SKU</div>
                <div className="font-medium text-foreground">{availability.sku}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Store ID</div>
                <div className="font-medium text-foreground">{availability.store_id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">On Hand</div>
                <div className="font-medium text-foreground">{availability.on_hand}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Available</div>
                <div className="font-medium text-foreground">{availability.available}</div>
              </div>
            </div>
          </div>

          {/* Channel Availability Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {channels.map((channel) => {
              const channelReservations = reservationsByChannel[channel] || [];
              const hasActiveReservations = channelReservations.length > 0;

              return (
                <ChannelAvailability
                  key={channel}
                  availability={availability}
                  channel={channel}
                  isLoading={availabilityLoading}
                  onReserve={() => handleReserve(channel)}
                  onRelease={
                    hasActiveReservations
                      ? () => handleRelease(channelReservations[0].id)
                      : undefined
                  }
                  onCommit={
                    hasActiveReservations
                      ? () => handleCommit(channelReservations[0].id)
                      : undefined
                  }
                  isRateLimited={false} // TODO: Track rate limiting state
                />
              );
            })}
          </div>

          {/* Active Reservations */}
          {activeReservations.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Active Reservations</h3>
              <div className="space-y-2">
                {activeReservations.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between p-2 rounded border border-border bg-muted/50"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {reservation.channel} - {reservation.quantity} units
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {reservation.ref_type} {reservation.ref_id ? `#${reservation.ref_id}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRelease(reservation.id)}
                        disabled={releaseMutation.isPending}
                      >
                        Release
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleCommit(reservation.id)}
                        disabled={commitMutation.isPending}
                      >
                        Commit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<AlertCircle className="h-12 w-12 text-muted-foreground" />}
          title="No Availability Data"
          description="Unable to load availability data for the selected variant and store"
        />
      )}

      {/* Reserve Stock Modal */}
      {selectedChannel && (
        <ReserveStockModal
          open={showReserveModal}
          onClose={() => {
            setShowReserveModal(false);
            setSelectedChannel(null);
          }}
          availability={availability}
          channel={selectedChannel}
          onSuccess={handleReserveSuccess}
        />
      )}
    </div>
  );
}

