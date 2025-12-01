import * as React from "react";

type StoreLite = { id: number; name: string; code?: string; is_active?: boolean };

type Props = {
  title?: string;
  storeId: string;
  setStoreId: (v: string) => void;
  stores: StoreLite[];
  method: string;
  setMethod: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
};

export function PaymentsToolbar({
  title,
  storeId,
  setStoreId,
  stores,
  method,
  setMethod,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3 space-y-2">
      {title ? <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div> : null}
      <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
        <select
          className="rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
              {s.code ? ` (${s.code})` : ""}
            </option>
          ))}
        </select>

        <select
          className="rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option value="">Any method</option>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="STORE_CREDIT">Store Credit</option>
          <option value="OTHER">Other</option>
        </select>

        <div className="flex items-center gap-2">
          <input
            type="date"
            className="w-full rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            type="date"
            className="w-full rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
