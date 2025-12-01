// pos-frontend/src/features/admin/components/DataTable.tsx
import React from "react";

type Col<T> = { key: keyof T | string; header: string; render?: (row:T)=>React.ReactNode; width?: string; align?: "left"|"right" };
type TableProps<T> = {
  title: string;
  rows: T[];
  cols: Col<T>[];
  loading?: boolean;
  total?: number;
  query: { search?: string; ordering?: string };
  onQueryChange: (q: Partial<{search:string; ordering:string}>) => void;
  renderRowAfter?: (row: T) => React.ReactNode;
  getRowKey?: (row: T, index: number) => React.Key;
};

export function DataTable<T extends object>({ title, rows, cols, loading, total, query, onQueryChange, renderRowAfter, getRowKey }: TableProps<T>) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <input
            value={query.search || ""}
            onChange={e => onQueryChange({ search: e.target.value })}
            placeholder="Search…"
            className="rounded-lg bg-muted px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <select
            value={query.ordering || ""}
            onChange={e => onQueryChange({ ordering: e.target.value })}
            className="rounded-lg bg-muted px-2 py-1.5 text-sm outline-none"
            title="Order by"
          >
            <option value="">Ordering</option>
            <option value="id">ID ↑</option>
            <option value="-id">ID ↓</option>
            <option value="name">Name ↑</option>
            <option value="-name">Name ↓</option>
            <option value="code">Code ↑</option>
            <option value="-code">Code ↓</option>
            <option value="priority">Priority ↑</option>
            <option value="-priority">Priority ↓</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
            <tr>
              {cols.map(c => (
                <th key={String(c.key)} className={`px-3 py-2 text-left text-muted-foreground ${c.align==="right"?"text-right":""}`} style={{width:c.width}}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
          {loading ? (
            <tr><td className="px-3 py-4 text-muted-foreground" colSpan={cols.length}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td className="px-3 py-4 text-muted-foreground" colSpan={cols.length}>No rows</td></tr>
          ) : rows.map((r, i) => {
            const rowKey = getRowKey ? getRowKey(r, i) : i;
            return (
              <React.Fragment key={rowKey}>
            <tr
                key={i}
                className={`border-b border-border/60 hover:bg-muted/40 transition-colors ${
                  // highlight selected rows if they contain a "selected" prop passed by AdminPage
                  (r as any).selected ? "bg-muted/70" : ""
                }`}
              >

              {cols.map(c => (
                  <td key={String(c.key)} className={`px-3 py-2 ${c.align==="right"?"text-right":""}`}>
                    {c.render ? c.render(r) : String((r as any)[c.key])}
                  </td>
                ))}
              </tr>
              {renderRowAfter ? (
                <tr className="border-b border-border/60">
                  <td colSpan={cols.length} className="px-3 py-2">
                    {renderRowAfter(r)}
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          )})}
          </tbody>
        </table>
      </div>

      <div className="p-2 text-xs text-muted-foreground">
        {typeof total === "number" ? `${total} record(s)` : null}
      </div>
    </div>
  );
}
