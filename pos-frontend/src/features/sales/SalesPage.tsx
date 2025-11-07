// src/features/sales/SalesPage.tsx
import * as React from "react";
import { listSales, getSale, type SaleRow, type SaleDetail } from "./api";

export default function SalesPage() {
  const [query, setQuery] = React.useState("");
  const [storeId, setStoreId] = React.useState<string>("");
  const [status, setStatus] = React.useState<string>("");
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");

  const [rows, setRows] = React.useState<SaleRow[]>([]);
  const [count, setCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [loading, setLoading] = React.useState(false);

  const [openId, setOpenId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listSales({
        page, page_size: pageSize, query,
        store_id: storeId || undefined,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setRows(res.results || []);
      setCount(Number(res.count || 0));
      const last = Math.max(1, Math.ceil(Number(res.count || 0) / pageSize));
      if (page > last) setPage(last);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, storeId, status, dateFrom, dateTo]);
  React.useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [query]);

  async function openDetail(id: number) {
    setOpenId(id);
    setLoadingDetail(true);
    try { setDetail(await getSale(id)); } finally { setLoadingDetail(false); }
  }

  const lastPage = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
            placeholder="Search receipt #, cashier, product, SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1" value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }}>
            <option value="">All stores</option>
            {/* you can hydrate from /api/v1/stores/stores-lite similar to Catalog */}
          </select>
          <select className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="void">Void</option>
          </select>
          <div className="flex items-center gap-2">
            <input type="date" className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            <input type="date" className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-visible rounded-2xl border border-zinc-800">
        <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto_auto] gap-3 bg-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-300">
          <div>#</div>
          <div>Date</div>
          <div>Store / Cashier</div>
          <div className="justify-self-end">Lines</div>
          <div className="justify-self-end">Subtotal</div>
          <div className="justify-self-end">Discount</div>
          <div className="justify-self-end">Tax</div>
          <div className="justify-self-end">Total</div>
        </div>

        <div className="divide-y divide-zinc-800">
          {loading && <div className="p-6 text-sm text-zinc-500">Loading…</div>}
          {!loading && rows.map(r => (
            <button
              key={r.id}
              className="w-full text-left grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-3 py-3 text-sm hover:bg-white/5"
              onClick={() => openDetail(r.id)}
            >
              <div className="font-medium text-zinc-100">{r.receipt_no || r.id}</div>
              <div className="text-zinc-400">{new Date(r.created_at).toLocaleString()}</div>
              <div className="truncate text-zinc-300">
                <span className="text-zinc-100">{r.store_name || "—"}</span>
                <span className="mx-2 text-zinc-600">•</span>
                <span className="text-zinc-400">{r.cashier_name || "—"}</span>
              </div>
              <div className="justify-self-end text-zinc-300">{r.lines_count}</div>
              <div className="justify-self-end text-zinc-200">{r.subtotal}</div>
              <div className="justify-self-end text-zinc-200">{r.discount_total}</div>
              <div className="justify-self-end text-zinc-200">{r.tax_total}</div>
              <div className="justify-self-end text-zinc-100">{r.total}</div>
            </button>
          ))}
          {!loading && rows.length === 0 && <div className="p-6 text-sm text-zinc-500">No sales found.</div>}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800 bg-zinc-900/40">
          <div className="text-xs text-zinc-400">
            {count === 0 ? "No results" : `Showing ${Math.min((page-1)*pageSize+1, count)}–${Math.min(page*pageSize, count)} of ${count}`}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-300">
              Rows:&nbsp;
              <select className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
                value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>Prev</button>
              <div className="min-w-[7rem] text-center text-xs text-zinc-300">Page {page} of {lastPage}</div>
              <button className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40" onClick={()=>setPage(p=>Math.min(lastPage,p+1))} disabled={page>=lastPage}>Next</button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {openId !== null && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setOpenId(null); setDetail(null); }} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-lg font-semibold">Sale {detail?.receipt_no || openId}</div>
              <button className="rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"
                onClick={() => { setOpenId(null); setDetail(null); }}>Close</button>
            </div>
            <div className="p-5 space-y-4 overflow-auto h-full">
              {loadingDetail && <div className="text-sm text-zinc-500">Loading…</div>}
              {detail && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-zinc-400">Store:</span> {detail.store_name || "—"}</div>
                    <div><span className="text-zinc-400">Cashier:</span> {detail.cashier_name || "—"}</div>
                    <div><span className="text-zinc-400">Created:</span> {new Date(detail.created_at).toLocaleString()}</div>
                    <div><span className="text-zinc-400">Updated:</span> {new Date(detail.updated_at).toLocaleString()}</div>
                    <div><span className="text-zinc-400">Status:</span> {detail.status}</div>
                  </div>

                  <div className="rounded-xl border border-zinc-800">
                    <div className="px-3 py-2 border-b border-zinc-800 text-sm text-zinc-300">Lines</div>
                    <div className="p-3 space-y-2">
                      {detail.lines.map(it => (
                        <div key={it.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-sm">
                          <div className="truncate">
                            <div className="text-zinc-100">{it.product_name || "Product"}</div>
                            <div className="text-xs text-zinc-400">{it.variant_name || it.sku}</div>
                          </div>
                          <div className="justify-self-end">{it.quantity}</div>
                          <div className="justify-self-end">{it.unit_price}</div>
                          <div className="justify-self-end">{it.tax || "0.00"}</div>
                          <div className="justify-self-end font-medium">{it.line_total}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800">
                    <div className="px-3 py-2 border-b border-zinc-800 text-sm text-zinc-300">Payments</div>
                    <div className="p-3 space-y-2">
                      {detail.payments.length === 0 && <div className="text-sm text-zinc-500">No payments recorded.</div>}
                      {detail.payments.map(p => (
                        <div key={p.id} className="grid grid-cols-[auto_auto_1fr] gap-3 text-sm">
                          <div className="text-zinc-200">{p.tender_type}</div>
                          <div className="text-zinc-200">{p.amount}</div>
                          <div className="text-zinc-500 text-xs">
                            {p.txn_ref ? `Ref: ${p.txn_ref}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm justify-end">
                    <div className="justify-self-end text-zinc-300">Subtotal: <span className="text-zinc-100">{detail.subtotal}</span></div>
                    <div className="justify-self-end text-zinc-300">Discounts: <span className="text-zinc-100">{detail.discount_total}</span></div>
                    <div className="justify-self-end text-zinc-300">Fees: <span className="text-zinc-100">{detail.fee_total}</span></div>
                    <div className="justify-self-end text-zinc-300">Tax: <span className="text-zinc-100">{detail.tax_total}</span></div>
                    <div className="justify-self-end text-lg font-semibold">Total: <span>{detail.total}</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
