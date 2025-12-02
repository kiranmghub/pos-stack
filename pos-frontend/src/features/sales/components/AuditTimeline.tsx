import * as React from "react";
import type { AuditLogEntry } from "../api";

type Props = {
  entries: AuditLogEntry[];
  loading: boolean;
  onSelect: (entry: AuditLogEntry) => void;
};

const severityStyles: Record<string, string> = {
  info: "bg-muted border-border text-foreground",
  warning: "bg-badge-warning-bg border-warning text-badge-warning-text",
  critical: "bg-badge-error-bg border-error text-badge-error-text",
};

const severityDot: Record<string, string> = {
  info: "bg-muted-foreground",
  warning: "bg-warning",
  critical: "bg-error",
};

export function AuditTimeline({ entries, loading, onSelect }: Props) {
  return (
    <div className="rounded-2xl border border-accent/20 bg-background/70">
      <div className="border-b border-border/20 px-4 py-2 text-[11px] uppercase tracking-[0.4em] text-accent/60">
        Activity stream
      </div>
      <div className="relative px-5 py-4">
        <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-accent/40 to-transparent" aria-hidden="true" />
        {loading ? (
          <div className="py-6 text-center text-accent/70">Loading audit trail…</div>
        ) : entries.length === 0 ? (
          <div className="py-6 text-center text-accent/70">No events match the current filters.</div>
        ) : (
          <ul className="space-y-6">
            {entries.map((entry) => (
              <li key={entry.id} className="relative flex gap-4">
                <span className={`absolute left-[14px] top-2 h-3 w-3 rounded-full ${severityDot[entry.severity] || "bg-muted-foreground"}`} />
                <div
                  className={`ml-8 flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-accent/10 ${
                    severityStyles[entry.severity] || severityStyles.info
                  }`}
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide">
                    <span>{entry.action.replace(/_/g, " ")}</span>
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-base font-semibold text-foreground">
                    {entry.store_name || "Unknown store"}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-accent/80">
                    {entry.user_name ? <span>By {entry.user_name}</span> : null}
                    {entry.sale_receipt_no ? <span>Receipt {entry.sale_receipt_no}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="self-end text-xs font-semibold text-accent hover:text-foreground"
                    onClick={() => onSelect(entry)}
                  >
                    Inspect event →
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
