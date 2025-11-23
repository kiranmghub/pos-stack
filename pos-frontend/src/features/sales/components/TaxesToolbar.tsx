import * as React from "react";

type StoreLite = { id: number; name: string; code?: string; is_active?: boolean };

export function TaxesToolbar({
  storeId,
  setStoreId,
  stores,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: {
  storeId: string;
  setStoreId: (v: string) => void;
  stores: StoreLite[];
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-r from-slate-950 to-slate-900/60 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border border-cyan-500/30 bg-slate-950 px-3 py-1 text-sm text-cyan-100"
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
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="rounded-md border border-cyan-500/30 bg-slate-950 px-2 py-1 text-sm text-cyan-100"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            type="date"
            className="rounded-md border border-cyan-500/30 bg-slate-950 px-2 py-1 text-sm text-cyan-100"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
