// pos-frontend/src/features/inventory/audit/LedgerTimeline.tsx
import React, { useMemo } from "react";
import { LedgerEntry } from "../api/ledger";
import { StatusBadge } from "../components/StatusBadge";
import { format, formatDistanceToNow, isSameDay, parseISO } from "date-fns";
import { ArrowUp, ArrowDown, Minus, Package, Store, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LedgerTimelineProps {
  /** Ledger entries */
  entries: LedgerEntry[];
  /** Loading state */
  loading?: boolean;
  /** On entry click handler */
  onEntryClick?: (entry: LedgerEntry) => void;
}

/**
 * LedgerTimeline - Displays ledger entries in a timeline format
 * Security: All data is tenant-scoped from the API
 */
export function LedgerTimeline({
  entries,
  loading = false,
  onEntryClick,
}: LedgerTimelineProps) {
  // Group entries by date
  const groupedEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    const groups: Array<{ date: Date; entries: LedgerEntry[] }> = [];
    let currentGroup: { date: Date; entries: LedgerEntry[] } | null = null;

    entries.forEach((entry) => {
      const entryDate = parseISO(entry.created_at);
      const entryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());

      if (!currentGroup || !isSameDay(currentGroup.date, entryDay)) {
        currentGroup = {
          date: entryDay,
          entries: [],
        };
        groups.push(currentGroup);
      }

      currentGroup.entries.push(entry);
    });

    return groups;
  }, [entries]);

  const formatRefType = (refType: string): string => {
    return refType
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  const getRefTypeVariant = (refType: string): "success" | "error" | "warning" | "info" => {
    if (refType.includes("SALE") || refType.includes("RECEIPT") || refType.includes("TRANSFER_IN")) {
      return "success";
    }
    if (refType.includes("WASTE") || refType.includes("TRANSFER_OUT")) {
      return "error";
    }
    if (refType.includes("ADJUSTMENT") || refType.includes("COUNT")) {
      return "warning";
    }
    return "info";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-32 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-20 bg-muted rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">No ledger entries found</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-8">
        {groupedEntries.map((group, groupIndex) => (
          <div key={groupIndex} className="relative">
            {/* Date header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {format(group.date, "EEEE, MMMM d, yyyy")}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            {/* Entries for this date */}
            <div className="space-y-3 ml-8">
              {group.entries.map((entry, entryIndex) => {
                const entryDate = parseISO(entry.created_at);
                const isPositive = entry.qty_delta > 0;
                const isNegative = entry.qty_delta < 0;
                const isZero = entry.qty_delta === 0;

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "relative bg-card border border-border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer",
                      "before:absolute before:left-[-2.25rem] before:top-6 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-background",
                      isPositive && "before:bg-success hover:border-success/50",
                      isNegative && "before:bg-destructive hover:border-destructive/50",
                      isZero && "before:bg-muted-foreground hover:border-muted-foreground/50"
                    )}
                    onClick={() => onEntryClick?.(entry)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left side - Time and main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-medium text-foreground">
                            {format(entryDate, "h:mm a")}
                          </span>
                          <StatusBadge
                            status={formatRefType(entry.ref_type)}
                            variant={getRefTypeVariant(entry.ref_type)}
                            size="sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          {/* Product info */}
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate">
                                {entry.product_name || "N/A"}
                              </div>
                              {entry.sku && (
                                <div className="text-xs text-muted-foreground">SKU: {entry.sku}</div>
                              )}
                            </div>
                          </div>

                          {/* Store info */}
                          {entry.store_name && (
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm text-muted-foreground">
                                {entry.store_name}
                                {entry.store_code && ` (${entry.store_code})`}
                              </span>
                            </div>
                          )}

                          {/* User info */}
                          {entry.created_by && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm text-muted-foreground">{entry.created_by}</span>
                            </div>
                          )}

                          {/* Note */}
                          {entry.note && (
                            <div className="text-sm text-muted-foreground italic mt-2">
                              "{entry.note}"
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right side - Quantity change and balance */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {/* Quantity delta */}
                        <div className="flex items-center gap-1.5">
                          {isPositive && <ArrowUp className="h-4 w-4 text-success" />}
                          {isNegative && <ArrowDown className="h-4 w-4 text-destructive" />}
                          {isZero && <Minus className="h-4 w-4 text-muted-foreground" />}
                          <span
                            className={cn(
                              "text-lg font-semibold",
                              isPositive && "text-success",
                              isNegative && "text-destructive",
                              isZero && "text-muted-foreground"
                            )}
                          >
                            {isPositive ? "+" : ""}
                            {entry.qty_delta}
                          </span>
                        </div>

                        {/* Balance after */}
                        {entry.balance_after !== null && (
                          <div className="text-sm text-muted-foreground">
                            Balance: <span className="font-medium text-foreground">{entry.balance_after}</span>
                          </div>
                        )}

                        {/* Reference ID */}
                        {entry.ref_id && (
                          <div className="text-xs text-muted-foreground">
                            Ref: #{entry.ref_id}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

