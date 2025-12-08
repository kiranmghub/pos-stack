// pos-frontend/src/features/inventory/operations/counts/CountSessionList.tsx
import React from "react";
import { DataTable, type Column, EmptyState, LoadingSkeleton } from "../../components";
import { StatusBadge } from "../../components/StatusBadge";
import { CountSession } from "../../api/counts";
import { format } from "date-fns";
import { Package, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CountSessionListProps {
  /** Count sessions to display */
  sessions: CountSession[];
  /** Loading state */
  loading?: boolean;
  /** On session click handler */
  onSessionClick?: (session: CountSession) => void;
  /** Selected session ID */
  selectedSessionId?: number | null;
}

/**
 * CountSessionList - Displays list of count sessions in a table
 * Security: All data is tenant-scoped from the API
 */
export function CountSessionList({
  sessions,
  loading = false,
  onSessionClick,
  selectedSessionId,
}: CountSessionListProps) {
  const getStatusVariant = (status: string): "draft" | "in_progress" | "completed" => {
    if (status === "DRAFT") return "draft";
    if (status === "IN_PROGRESS") return "in_progress";
    if (status === "FINALIZED") return "completed";
    return "draft";
  };

  const columns: Column<CountSession>[] = [
    {
      key: "code",
      header: "Code",
      width: "8rem",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">{row.code || `#${row.id}`}</div>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      width: "8rem",
      cell: (row) => (
        <div className="text-sm text-muted-foreground">
          {format(new Date(row.created_at), "MMM d, yyyy")}
        </div>
      ),
    },
    {
      key: "store",
      header: "Store",
      width: "10rem",
      cell: (row) => (
        <div className="text-sm">
          <div className="font-medium text-foreground">{row.store.name}</div>
          <div className="text-xs text-muted-foreground">{row.store.code}</div>
        </div>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      width: "10rem",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className="text-sm">
            <div className="font-medium text-foreground">
              {row.scope === "FULL_STORE" ? "Full Store" : "Zone"}
            </div>
            {row.scope === "ZONE" && row.zone_name && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {row.zone_name}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "lines",
      header: "Items",
      width: "6rem",
      align: "center",
      cell: (row) => (
        <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
          <Package className="h-4 w-4" />
          <span>{row.lines.length}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "10rem",
      cell: (row) => (
        <StatusBadge
          status={row.status.replace("_", " ")}
          variant={getStatusVariant(row.status)}
          size="sm"
        />
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <LoadingSkeleton key={i} variant="card" height={60} />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="No count sessions found"
        description="Create a new count session to get started"
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <DataTable
        data={sessions}
        columns={columns}
        onRowClick={onSessionClick}
        getRowClassName={(row) =>
          selectedSessionId === row.id ? "bg-accent/50" : ""
        }
        emptyMessage="No count sessions found"
      />
    </div>
  );
}

