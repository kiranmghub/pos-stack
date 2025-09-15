// src/features/inventory/CountsPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { listStores, listCountSessions, createCountSession, getCountSession, scanIntoCount, setCountQty, finalizeCount, type CountSession, type StoreLite } from "./countsApi";
import { Barcode, CheckCircle2, FilePlus2, QrCode, Upload, ScanLine, Search, Boxes, SendHorizonal, ClipboardList, Check, ChevronRight } from "lucide-react";

function toInt(n: any, d = 0) {
  const x = parseInt(String(n ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export default function CountsPage() {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "DRAFT" | "IN_PROGRESS" | "FINALIZED">("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [rows, setRows] = useState<CountSession[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // right pane
  const [openId, setOpenId] = useState<number | null>(null);
  const [session, setSession] = useState<CountSession | null>(null);

  // scan inputs
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await listStores();
        setStores(s);
        if (!storeId && s.length > 0) setStoreId(s[0].id);
      } catch (e: any) { setMsg(e.message || "Failed to load stores"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadList() {
    setLoading(true);
    try {
      const data = await listCountSessions({
        store_id: storeId ? Number(storeId) : undefined,
        status: status || undefined,
        q,
        page,
        page_size: pageSize,
      });
      setRows(data.results || []);
      setCount(data.count || 0);
    } catch (e: any) {
      setMsg(e.message || "Failed to load counts");
      setRows([]); setCount(0);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, [storeId, status, q, page, pageSize]);

  async function openSession(id: number) {
    try {
      const s = await getCountSession(id);
      setSession(s);
      setOpenId(id);
      setMsg(null);
      setTimeout(() => barcodeRef.current?.focus(), 50);
    } catch (e: any) {
      setMsg(e.message || "Failed to open count");
    }
  }

  async function onCreate() {
    if (!storeId) { setMsg("Choose a store first"); return; }
    try {
      const { id } = await createCountSession({ store_id: Number(storeId) });
      await loadList();
      openSession(id);
    } catch (e: any) { setMsg(e.message || "Create failed"); }
  }

  async function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!barcode && !sku) { setMsg("Enter a barcode or SKU"); return; }
    try {
      await scanIntoCount(session.id, {
        barcode: barcode || undefined,
        sku: sku || undefined,
        qty: qty || 1,
        location: location || undefined,
      });
      const s = await getCountSession(session.id);
      setSession(s);
      setBarcode(""); setSku(""); setQty(1);
      barcodeRef.current?.focus();
    } catch (e: any) { setMsg(e.message || "Scan failed"); }
  }

  async function onSetQty(variantId: number, counted: number) {
    if (!session) return;
    try {
      await setCountQty(session.id, { variant_id: variantId, counted_qty: counted });
      const s = await getCountSession(session.id);
      setSession(s);
    } catch (e: any) { setMsg(e.message || "Update failed"); }
  }

  async function onFinalize() {
    if (!session) return;
    try {
      const resp = await finalizeCount(session.id);
      setMsg(`Finalized (adjusted ${resp.summary.adjusted}, zero ${resp.summary.zero})`);
      await loadList();
      openSession(session.id);
    } catch (e: any) { setMsg(e.message || "Finalize failed"); }
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <AppShell title="Inventory · Counts">
      <div className="grid grid-cols-1 lg:grid-cols-[420px,1fr] gap-4 p-4">
        {/* LEFT: Sessions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="border-b border-slate-800 p-3 flex items-center gap-2">
            <select
              className="rounded bg-slate-800 px-2 py-1"
              value={storeId}
              onChange={(e) => { setStoreId(e.target.value ? Number(e.target.value) : ""); setPage(1); }}
            >
              {stores.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
            <select className="rounded bg-slate-800 px-2 py-1" value={status} onChange={e => { setStatus(e.target.value as any); setPage(1); }}>
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="FINALIZED">Finalized</option>
            </select>
            <div className="flex-1" />
            <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 hover:bg-indigo-500">
              <FilePlus2 className="h-4 w-4" /> New
            </button>
          </div>

          <div className="border-b border-slate-800 p-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search code or notes…"
              className="flex-1 bg-slate-800 rounded px-2 py-1 outline-none"
            />
          </div>

          <div className="max-h-[62vh] overflow-y-auto divide-y divide-slate-800">
            {loading && <div className="p-3 text-slate-400">Loading…</div>}
            {!loading && rows.length === 0 && <div className="p-3 text-slate-400">No sessions</div>}
            {!loading && rows.map(r => (
              <button key={r.id} onClick={() => openSession(r.id)} className={`w-full text-left p-3 hover:bg-slate-800/60 ${openId === r.id ? "bg-slate-800/40" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium">#{r.id} {r.code ? `· ${r.code}` : ""}</div>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
                <div className="text-xs text-slate-400">{r.store.code} — {r.store.name}</div>
                <div className="text-xs mt-1">
                  {r.status === "FINALIZED" ? <span className="text-emerald-300">Finalized</span> :
                   r.status === "IN_PROGRESS" ? <span className="text-amber-300">In Progress</span> :
                   <span className="text-slate-300">Draft</span>}
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="border-t border-slate-800 p-2 flex items-center justify-between text-sm">
              <div className="text-slate-400">Page {page} of {totalPages}</div>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50">Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Session detail */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 min-h-[72vh]">
          {!session && <div className="p-6 text-slate-400">Select or create a count to begin.</div>}
          {!!session && (
            <>
              <div className="border-b border-slate-800 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-slate-300" />
                  <div className="font-semibold">Count #{session.id}</div>
                  {session.status === "FINALIZED" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-4 w-4"/> Finalized</span>
                  ) : session.status === "IN_PROGRESS" ? (
                    <span className="inline-flex items-center gap-1 text-amber-300"><Boxes className="h-4 w-4"/> In Progress</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-300"><Boxes className="h-4 w-4"/> Draft</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {session.status !== "FINALIZED" && (
                    <button onClick={onFinalize} className="inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-1.5 hover:bg-emerald-500">
                      <Check className="h-4 w-4" /> Finalize
                    </button>
                  )}
                </div>
              </div>

              {/* Scan / key-in toolbar */}
              {session.status !== "FINALIZED" && (
                <form onSubmit={onScanSubmit} className="p-4 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-[1fr,1fr,90px,1fr,120px] gap-2">
                  <div className="flex items-center gap-2 rounded bg-slate-800 px-3 py-2">
                    <ScanLine className="h-4 w-4 text-slate-400" />
                    <input ref={barcodeRef} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Barcode" className="bg-transparent outline-none flex-1"/>
                  </div>
                  <div className="flex items-center gap-2 rounded bg-slate-800 px-3 py-2">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" className="bg-transparent outline-none flex-1"/>
                  </div>
                  <input value={qty} onChange={e => setQty(toInt(e.target.value, 1))} className="rounded bg-slate-800 px-3 py-2" inputMode="numeric" />
                  <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location/bin" className="rounded bg-slate-800 px-3 py-2" />
                  <button className="rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-2">Add</button>
                </form>
              )}

              {/* Lines */}
              <div className="p-4 overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-slate-900/60">
                    <tr className="text-left text-sm text-slate-300">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Expected</th>
                      <th className="px-3 py-2 text-right">Counted</th>
                      <th className="px-3 py-2 text-right">Delta</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2 w-28"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(session.lines || []).map(ln => {
                      const exp = toInt(ln.expected_qty, 0);
                      const cnt = toInt(ln.counted_qty, 0);
                      const delta = cnt - exp;
                      return (
                        <tr key={ln.id} className="hover:bg-slate-900/40">
                          <td className="px-3 py-2">{ln.product_name}</td>
                          <td className="px-3 py-2">{ln.sku || "—"}</td>
                          <td className="px-3 py-2 text-right">{exp}</td>
                          <td className="px-3 py-2 text-right">
                            {session.status === "FINALIZED" ? cnt : (
                              <input
                                className="w-20 rounded bg-slate-800 px-2 py-1 text-right"
                                inputMode="numeric"
                                defaultValue={cnt}
                                onBlur={(e) => onSetQty(ln.variant_id, toInt(e.target.value, cnt))}
                              />
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right ${delta !== 0 ? "text-amber-300" : "text-slate-300"}`}>{delta}</td>
                          <td className="px-3 py-2">{ln.location || "—"}</td>
                          <td className="px-3 py-2 text-right text-xs text-slate-400">{ln.method}</td>
                        </tr>
                      );
                    })}
                    {(!session.lines || session.lines.length === 0) && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No lines yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {msg && <div className="px-4 pb-4"><div className="rounded bg-slate-800 px-3 py-2 text-sm">{msg}</div></div>}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
