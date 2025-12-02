import * as React from "react";

type Props = {
  action: string;
  setAction: (v: string) => void;
  severity: string;
  setSeverity: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
};

export function AuditFilters({
  action,
  setAction,
  severity,
  setSeverity,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: Props) {
  return (
    <div className="rounded-2xl border border-accent/20 bg-card p-4 shadow-lg shadow-accent/20">
      <div className="grid gap-3 md:grid-cols-4">
        <select
          className="rounded-xl border border-accent/40 bg-background px-3 py-2 text-sm text-accent"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All actions</option>
          <option value="SALE_COMPLETED">Sale completed</option>
          <option value="RETURN_DRAFT_CREATED">Return draft</option>
          <option value="RETURN_FINALIZED">Return finalized</option>
          <option value="RETURN_VOIDED">Return voided</option>
        </select>
        <select
          className="rounded-xl border border-accent/40 bg-background px-3 py-2 text-sm text-accent"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">Any severity</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <input
          type="date"
          className="rounded-xl border border-accent/40 bg-background px-3 py-2 text-sm text-accent"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <input
          type="date"
          className="rounded-xl border border-accent/40 bg-background px-3 py-2 text-sm text-accent"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>
    </div>
  );
}
