import * as React from "react";
import type { AuditLogEntry } from "../api";

type Props = {
  entry: AuditLogEntry | null;
  onClose: () => void;
  onOpenSale: (saleId: number) => void;
};

export function AuditDrawer({ entry, onClose, onOpenSale }: Props) {
  if (!entry) return null;
  const meta = entry.metadata || {};
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 backdrop-blur">
      <div className="h-full w-full max-w-md overflow-auto bg-background text-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-fuchsia-200/70">Audit event</div>
            <div className="text-lg font-semibold">{entry.action.replace(/_/g, " ")}</div>
          </div>
          <button className="text-sm text-fuchsia-200 hover:text-white" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-fuchsia-200/70">
            <span className="rounded-full bg-muted px-2 py-0.5 text-white">{entry.severity}</span>
            <span>{new Date(entry.created_at).toLocaleString()}</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-muted/60 p-3">
            <div className="text-xs text-fuchsia-200/70">Actor</div>
            <div className="text-base">{entry.user_name || "System"}</div>
          </div>
          {entry.sale_id ? (
            <div className="rounded-xl border border-white/5 bg-muted/60 p-3">
              <div className="text-xs text-fuchsia-200/70">Related sale</div>
              <div className="flex items-center justify-between text-base">
                <span>{entry.sale_receipt_no || `#${entry.sale_id}`}</span>
                <button
                  className="text-xs text-fuchsia-200 hover:text-white"
                  onClick={() => onOpenSale(entry.sale_id!)}
                >
                  Open sale
                </button>
              </div>
            </div>
          ) : null}
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-fuchsia-200/70 mb-2">Payload</div>
            <pre className="rounded-xl border border-white/5 bg-muted/80 p-3 text-xs text-fuchsia-100 overflow-auto">
              {JSON.stringify(meta, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
