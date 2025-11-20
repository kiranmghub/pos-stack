import * as React from "react";

type StoreLite = { id: number; name: string; code?: string; is_active?: boolean };

export function ReturnsToolbar(props: {
  query: string;
  setQuery: (v: string) => void;
  storeId: string;
  setStoreId: (v: string) => void;
  stores: StoreLite[];
  status: string;
  setStatus: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
}) {
  const { query, setQuery, storeId, setStoreId, stores, status, setStatus, dateFrom, setDateFrom, dateTo, setDateTo } = props;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-[1.5fr_auto_auto_auto]">
        <input
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          placeholder="Search return #, receipt, cashier…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
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
          className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="finalized">Finalized</option>
          <option value="void">Void</option>
        </select>

        <div className="flex items-center gap-2">
          <input
            type="date"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            type="date"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
