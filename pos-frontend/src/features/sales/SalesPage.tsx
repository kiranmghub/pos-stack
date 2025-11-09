// src/features/sales/SalesPage.tsx
import * as React from "react";
import { startReturnForSale, listReturnsForSale, listSales, getSale, listInventoryStores, type SaleRow, type SaleDetail } from "./api";

export default function SalesPage() {
    const [query, setQuery] = React.useState("");
    const [storeId, setStoreId] = React.useState<string>("");
    const [stores, setStores] = React.useState<Array<{ id: number; name: string; code?: string; is_active?: boolean }>>([]);
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
    const [showBreakdown, setShowBreakdown] = React.useState(false);
    const [showReceiptBreakdown, setShowReceiptBreakdown] = React.useState(false);

    const fmtMoney = React.useMemo(
        () => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }),
        []
    );
    const safeMoney = (v: any) => {
        if (v === null || v === undefined || v === "") return fmtMoney.format(0);
        const n = typeof v === "number" ? v : Number(v);
        return isFinite(n) ? fmtMoney.format(n) : String(v);
    };

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


    // Hydrate store dropdown from /api/v1/stores/stores-lite (tenant-scoped, active-only by default)
    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const data = await listInventoryStores();
                if (!alive) return;
                // ensure array shape even if backend paginates
                const items = Array.isArray(data) ? data : [];
                setStores(items);
                // If a previously selected storeId is no longer present (e.g. got deactivated), clear it
                if (storeId && !items.some(s => String(s.id) === String(storeId))) {
                    setStoreId("");
                }
            } catch (e) {
                // keep dropdown usable (All stores)
                console.error("Failed to load stores for Sales page:", e);
            }
        })();
        return () => { alive = false; };
    }, []); // run once on mount

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
                    <select
                        className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
                        value={storeId}
                        onChange={(e) => { setStoreId(e.target.value); setPage(1); }}
                    >
                        <option value="">All stores</option>
                        {stores.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                                {s.name}{s.code ? ` (${s.code})` : ""}
                            </option>
                        ))}
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
                        {count === 0 ? "No results" : `Showing ${Math.min((page - 1) * pageSize + 1, count)}–${Math.min(page * pageSize, count)} of ${count}`}
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-zinc-300">
                            Rows:&nbsp;
                            <select className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
                                value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <div className="flex items-center gap-1">
                            <button className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
                            <div className="min-w-[7rem] text-center text-xs text-zinc-300">Page {page} of {lastPage}</div>
                            <button className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40" onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}>Next</button>
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

                                    {/* Start Return */}
                                    <div className="mt-3">
                                        <button
                                            className="rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white"
                                            onClick={async () => {
                                                try {
                                                    const ret = await startReturnForSale(detail.id);
                                                    console.log("Return created:", ret);
                                                    // TODO: navigate to or open Return Builder UI with ret.id
                                                } catch (e) {
                                                    console.error(e);
                                                    alert("Unable to start return");
                                                }
                                            }}
                                        >
                                            Start return
                                        </button>
                                    </div>


                                    {/* Lines (prefer receipt_data.lines; fallback to detail.lines) */}
                                    <div className="rounded-xl border border-zinc-800">
                                        <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                                            <div className="text-sm text-zinc-300">Lines</div>
                                            <button
                                                className="text-xs text-zinc-300 rounded px-2 py-1 hover:bg-white/5"
                                                onClick={() => setShowBreakdown(v => !v)}
                                                aria-pressed={showBreakdown}
                                                title={showBreakdown ? "Hide breakdown" : "Show breakdown"}
                                            >
                                                {showBreakdown ? "Hide breakdown" : "Show breakdown"}
                                            </button>
                                        </div>
                                        <div className="p-3 space-y-2">
                                            {/* Column headers */}
                                            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-xs text-zinc-400 uppercase pb-1 border-b border-zinc-800">
                                                <div>Item</div>
                                                <div className="justify-self-end">Subtotal</div>
                                                <div className="justify-self-end">Discount</div>
                                                <div className="justify-self-end">Tax</div>
                                                <div className="justify-self-end">Total</div>
                                            </div>
                                            {(Array.isArray((detail as any)?.receipt_data?.lines) && (detail as any).receipt_data.lines.length > 0
                                                ? (detail as any).receipt_data.lines.map((ln: any, idx: number) => (
                                                    <div key={`${ln.sku ?? idx}`} className="rounded-lg border border-zinc-800 p-2.5 bg-zinc-900/40">
                                                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-start text-[13px]">
                                                            {/* <div className="grid grid-cols-[1fr_minmax(4rem,auto)_minmax(4rem,auto)_minmax(4rem,auto)_minmax(5rem,auto)] gap-4 items-start text-[13px]">     */}
                                                            <div className="min-w-0">
                                                                <div className="text-zinc-100 truncate">{ln.name ?? "Product"}</div>
                                                                <div className="text-xs text-zinc-400 truncate">
                                                                    SKU: {ln.sku ?? "—"} • Qty: {ln.qty ?? "—"} • Unit: {safeMoney(ln.unit_price)}
                                                                </div>
                                                            </div>
                                                            <div className="justify-self-end text-zinc-200">{safeMoney(ln.line_subtotal ?? 0)}</div>
                                                            <div className="justify-self-end text-amber-300">-{safeMoney(ln.line_discount ?? 0)}</div>
                                                            <div className="justify-self-end text-blue-300">{safeMoney(ln.tax ?? 0)}</div>
                                                            <div className="justify-self-end font-medium text-zinc-100">{safeMoney(ln.line_gross_after_tax ?? ln.line_total ?? 0)}</div>
                                                        </div>
                                                        {showBreakdown && (
                                                            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-zinc-400">
                                                                <div className="whitespace-nowrap leading-5">
                                                                    Subtotal: <span className="text-zinc-200 tabular-nums">{safeMoney(ln.line_subtotal ?? 0)}</span>
                                                                </div>
                                                                <div className="whitespace-nowrap leading-5">
                                                                    Discount: <span className="text-amber-300 tabular-nums">-{safeMoney(ln.line_discount ?? 0)}</span>
                                                                </div>
                                                                <div className="whitespace-nowrap leading-5">
                                                                    Tax: <span className="text-blue-300 tabular-nums">{safeMoney(ln.tax ?? 0)}</span>
                                                                </div>
                                                                <div className="whitespace-nowrap leading-5">
                                                                    Fee: <span className="text-zinc-200 tabular-nums">{safeMoney(ln.fee ?? 0)}</span>
                                                                </div>
                                                                <div className="whitespace-nowrap leading-5">
                                                                    Net (pre-tax): <span className="text-zinc-200 tabular-nums">{safeMoney(ln.line_net ?? 0)}</span>
                                                                </div>
                                                                <div className="whitespace-nowrap leading-5">
                                                                    Gross after tax: <span className="text-zinc-100 tabular-nums">{safeMoney(ln.line_gross_after_tax ?? ln.line_total ?? 0)}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                                : // Fallback: use existing detail.lines
                                                detail.lines.map(it => (
                                                    <div key={it.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-sm">
                                                        <div className="truncate">
                                                            <div className="text-zinc-100">{it.product_name || "Product"}</div>
                                                            <div className="text-xs text-zinc-400">{it.variant_name || it.sku}</div>
                                                        </div>
                                                        <div className="justify-self-end">{it.quantity}</div>
                                                        <div className="justify-self-end">{safeMoney(it.unit_price)}</div>
                                                        <div className="justify-self-end">{safeMoney(it.tax || 0)}</div>
                                                        <div className="justify-self-end font-medium">{safeMoney(it.line_total)}</div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-zinc-800">
                                        <div className="px-3 py-2 border-b border-zinc-800 text-sm text-zinc-300">Payments</div>
                                        <div className="p-3 space-y-2">
                                            {detail.payments.length === 0 && <div className="text-sm text-zinc-500">No payments recorded.</div>}
                                            {detail.payments.map(p => (
                                                <div key={p.id} className="grid grid-cols-[auto_auto_1fr] gap-3 text-sm">
                                                    <div className="text-zinc-200">{p.tender_type}</div>
                                                    <div className="text-zinc-200">{safeMoney(p.amount)}</div>
                                                    <div className="text-zinc-500 text-xs">
                                                        {p.txn_ref ? `Ref: ${p.txn_ref}` : ""}
                                                    </div>
                                                </div>
                                            ))}
                                            {/* If POS receipt_data has a single payment snapshot, show it too */}
                                            {(detail as any)?.receipt_data?.payment && (
                                                <div className="mt-2 rounded border border-zinc-800 p-3 text-xs text-zinc-300">
                                                    <div className="font-medium text-zinc-200 mb-1">Payment (Receipt)</div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>Type: {(detail as any).receipt_data.payment.type}</div>
                                                        <div>Amount: {safeMoney((detail as any).receipt_data.payment.amount)}</div>
                                                        <div>Received: {safeMoney((detail as any).receipt_data.payment.received)}</div>
                                                        <div>Change: {safeMoney((detail as any).receipt_data.payment.change)}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Summary + receipt-level breakdown */}
                                    <div className="grid gap-2 text-sm justify-end">
                                        <div className="justify-self-end text-zinc-300">
                                            Subtotal: <span className="text-zinc-100">{safeMoney(detail.subtotal)}</span>
                                        </div>
                                        <div className="justify-self-end text-zinc-300">
                                            Discounts: <span className="text-amber-300">-{safeMoney(detail.discount_total)}</span>
                                        </div>
                                        <div className="justify-self-end text-zinc-300">
                                            Fees: <span className="text-zinc-100">{safeMoney(detail.fee_total)}</span>
                                        </div>
                                        <div className="justify-self-end text-zinc-300">
                                            Tax: <span className="text-blue-300">{safeMoney(detail.tax_total)}</span>
                                        </div>
                                        <div className="justify-self-end text-lg font-semibold">
                                            Total: <span>{safeMoney(detail.total)}</span>
                                        </div>
                                    </div>

                                    {(detail as any)?.receipt_data?.totals && (
                                        <div className="rounded-xl border border-zinc-800">
                                            <div className="px-3 py-2 border-b border-zinc-800 text-sm text-zinc-300">Receipt breakdown</div>
                                            <div className="p-3 space-y-3 text-sm">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <div><span className="text-zinc-400">Subtotal:</span> <span className="text-zinc-100">{safeMoney((detail as any).receipt_data.totals?.subtotal)}</span></div>
                                                    <div><span className="text-zinc-400">Discount:</span> <span className="text-amber-300">-{safeMoney((detail as any).receipt_data.totals?.discount)}</span></div>
                                                    <div><span className="text-zinc-400">Fees:</span> <span className="text-zinc-100">{safeMoney((detail as any).receipt_data.totals?.fees)}</span></div>
                                                    <div><span className="text-zinc-400">Tax:</span> <span className="text-blue-300">{safeMoney((detail as any).receipt_data.totals?.tax)}</span></div>
                                                    <div className="col-span-2 md:col-span-4 justify-self-end font-medium">
                                                        Grand total: <span className="text-zinc-100">{safeMoney((detail as any).receipt_data.totals?.grand_total)}</span>
                                                    </div>
                                                </div>

                                                {/* Discount by rule */}
                                                {Array.isArray((detail as any).receipt_data.totals?.discount_by_rule) && (detail as any).receipt_data.totals.discount_by_rule.length > 0 && (
                                                    <div>
                                                        <div className="text-sm text-zinc-300 mb-1">Discounts by rule</div>
                                                        <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                                                            {(detail as any).receipt_data.totals.discount_by_rule.map((d: any, i: number) => (
                                                                <div key={`disc-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                                                                    <div className="truncate">
                                                                        <span className="font-medium">{d.name}</span>
                                                                        {d.code ? <span className="text-xs text-zinc-500 ml-2">({d.code})</span> : null}
                                                                    </div>
                                                                    <div className="text-amber-300">-{safeMoney(d.amount)}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Tax by rule */}
                                                {Array.isArray((detail as any).receipt_data?.totalling) /* support legacy keys */ ? null : (
                                                    <>
                                                        {Array.isArray((detail as any).receipt_data.totals?.tax_by_rule) && (detail as any).receipt_data.totals.tax_by_rule.length > 0 && (
                                                            <div>
                                                                <div className="text-sm text-zinc-300 mb-1">Taxes by rule</div>
                                                                <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                                                                    {(detail as any).receipt_data.totals.tax_by_rule.map((t: any, i: number) => (
                                                                        <div key={`tax-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                                                                            <div className="truncate">
                                                                                <span className="font-medium">{t.name}</span>
                                                                                {t.code ? <span className="text-xs text-zinc-500 ml-2">({t.code})</span> : null}
                                                                            </div>
                                                                            <div className="text-blue-300">{safeMoney(t.amount)}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
