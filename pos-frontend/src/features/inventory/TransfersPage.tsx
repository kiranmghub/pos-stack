// src/features/inventory/TransfersPage.tsx
import React, { useEffect, useState } from "react";
import { PackagePlus, Search, Send, CheckCircle2, Loader2 } from "lucide-react";
import { ensureAuthedFetch } from "@/components/AppShell";
import { getMyStores, searchProducts, type StoreLite, type VariantLite } from "@/features/pos/api";
import {
  listTransfers,
  createTransfer,
  sendTransfer,
  receiveTransfer,
  type TransferListItem,
  type TransferLine,
} from "./transfersApi";

function toInt(x: unknown, d = 0) {
  const n = parseFloat(String(x ?? ""));
  return Number.isFinite(n) ? Math.floor(n) : d;
}
function toMoney(n: number | string | null | undefined) {
  const x = typeof n === "string" ? parseFloat(n) : typeof n === "number" ? n : 0;
  return (isNaN(x) ? 0 : x).toFixed(2);
}

type PickRow = VariantLite & { on_hand?: number };

export default function TransfersPage() {
  // reference data
  const [stores, setStores] = useState<StoreLite[]>([]);
  // form state
  const [fromStoreId, setFromStoreId] = useState<number | null>(null);
  const [toStoreId, setToStoreId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState<PickRow[]>([]);
  const [lines, setLines] = useState<Array<{ v: PickRow; qty: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // right panel: list
  const [status, setStatus] = useState<"" | "DRAFT" | "SENT" | "RECEIVED">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<TransferListItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // receive modal
  const [recvOpen, setRecvOpen] = useState<{ id: number; title: string } | null>(null);
  const [recvLines, setRecvLines] = useState<Array<{ variant_id: number; sku?: string | null; product_name?: string | null; qty: number }>>([]);
  const [recvSaving, setRecvSaving] = useState(false);

  // load stores
  useEffect(() => {
    (async () => {
      try {
        const s = await getMyStores();
        const list = Array.isArray(s) ? s : (s as any).results || [];
        setStores(list);
        if (!fromStoreId && list[0]) setFromStoreId(list[0].id);
        if (!toStoreId && list[1]) setToStoreId(list[1].id);
      } catch (e: any) {
        setMsg(e.message || "Failed to load stores");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autocomplete: search variants available in fromStoreId
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!fromStoreId || !searchQ.trim()) {
        setOptions([]);
        return;
      }
      setSearching(true);
      try {
        const results = await searchProducts({ store_id: fromStoreId, query: searchQ.trim() });
        if (!alive) return;
        // FIX: spread the variant; keep on_hand numeric
        const opts = (results || []).map((v: any) => ({
          ...v,
          on_hand: toInt(v.on_hand, 0),
        }));
        setOptions(opts);
      } catch (e: any) {
        if (alive) setMsg(e.message || "Search failed");
      } finally {
        if (alive) setSearching(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fromStoreId, searchQ]);

  // list transfers (right)
  async function fetchTransfers() {
    setLoading(true);
    try {
      const resp = await listTransfers({
        from_store_id: fromStoreId || undefined,
        to_store_id: toStoreId || undefined,
        status: status || undefined,
        q: q || undefined,
        page,
        page_size: pageSize,
      });
      setRows(resp.results || []);
      setCount(resp.count || 0);
    } catch (e: any) {
      setMsg(e.message || "Failed to load transfers");
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromStoreId, toStoreId, status, q, page, pageSize]);

  // add variant to lines
  function addVariant(v: PickRow) {
    if (!fromStoreId) {
      setMsg("Choose a source store first");
      return;
    }
    if (lines.find((ln) => ln.v.id === v.id)) return; // skip dups
    setLines((xs) => [...xs, { v, qty: 1 }]);
    setSearchQ("");
    setOptions([]);
  }
  function setQty(vId: number, qty: number) {
    setLines((xs) => xs.map((ln) => (ln.v.id === vId ? { ...ln, qty } : ln)));
  }
  function removeLine(vId: number) {
    setLines((xs) => xs.filter((ln) => ln.v.id !== vId));
  }

  async function onCreate(sendNow = false) {
    if (!fromStoreId || !toStoreId || fromStoreId === toStoreId || lines.length === 0) {
      setMsg("Pick both stores and add at least one item");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        from_store_id: fromStoreId,
        to_store_id: toStoreId,
        note: note || undefined,
        lines: lines.map<TransferLine>((ln) => ({ variant_id: ln.v.id, qty: ln.qty })),
        send_now: sendNow,
      };
      const res = await createTransfer(payload);
      setMsg(sendNow ? `Transfer #${res.id} sent` : `Transfer #${res.id} created`);
      setLines([]);
      setNote("");
      setSearchQ("");
      setOptions([]);
      setPage(1);
      fetchTransfers();
    } catch (e: any) {
      setMsg(e.message || "Failed to create transfer");
    } finally {
      setSaving(false);
    }
  }

  // receive modal helpers
  async function openReceive(t: TransferListItem) {
    setRecvOpen({ id: t.id, title: `Receive transfer #${t.id} (${t.from_store.code} → ${t.to_store.code})` });
    try {
      const res = await ensureAuthedFetch(`/api/v1/inventory/transfers/${t.id}`);
      if (!res.ok) throw new Error(`Failed to load transfer`);
      const detail = await res.json();
      const prefill = (detail?.lines || []).map((ln: any) => ({
        variant_id: ln.variant_id,
        sku: ln.sku,
        product_name: ln.product_name,
        qty: Number(ln.qty || 0), // default receive full
      }));
      setRecvLines(prefill);
    } catch (e: any) {
      setMsg(e.message || "Failed to load transfer lines");
      setRecvLines([]);
    }
  }
  async function doReceive() {
    if (!recvOpen) return;
    setRecvSaving(true);
    try {
      await receiveTransfer(
        recvOpen.id,
        { lines: recvLines.map((x) => ({ variant_id: x.variant_id, qty: Number(x.qty || 0) })) }
      );
      setMsg(`Transfer #${recvOpen.id} received`);
      setRecvOpen(null);
      fetchTransfers();
    } catch (e: any) {
      setMsg(e.message || "Failed to receive transfer");
    } finally {
      setRecvSaving(false);
    }
  }

  // UI
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Left: Create / Send */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <PackagePlus className="h-5 w-5 text-indigo-300" />
          <div className="font-semibold">Create transfer</div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              From store
              <select
                value={fromStoreId ?? ""}
                onChange={(e) => setFromStoreId(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
              >
                <option value="">—</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              To store
              <select
                value={toStoreId ?? ""}
                onChange={(e) => setToStoreId(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
              >
                <option value="">—</option>
                {stores
                  .filter((s) => !fromStoreId || s.id !== fromStoreId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
              placeholder="Reason or reference…"
            />
          </label>

          {/* Autocomplete */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                disabled={!fromStoreId}
                placeholder={fromStoreId ? "Search by name / SKU / barcode…" : "Choose a source store first"}
                className="flex-1 bg-transparent outline-none placeholder:text-slate-500"
              />
              {searching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            {options.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur">
                {options.slice(0, 10).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => addVariant(v)}
                    className="w-full px-3 py-2 text-left hover:bg-white/5"
                  >
                    <div className="font-medium">{v.product?.name || v.product_name || v.sku}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>{v.sku || "—"}</span>
                      {typeof v.on_hand === "number" && (
                        <span className={`px-1.5 py-0.5 rounded ring-1 ring-inset text-[11px] ${
                          v.on_hand <= 0
                            ? "bg-red-600/20 text-red-300 ring-red-600/30"
                            : v.on_hand <= 5
                            ? "bg-amber-500/20 text-amber-300 ring-amber-500/30"
                            : "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30"
                        }`}>
                          on hand: {v.on_hand}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lines */}
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-900/70 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {lines.map((ln) => (
                  <tr key={ln.v.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{ln.v.product?.name || ln.v.product_name || ln.v.sku}</div>
                      <div className="text-xs text-slate-400">{ln.v.sku || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        value={ln.qty}
                        onChange={(e) => setQty(ln.v.id, Math.max(0, toInt(e.target.value, 0)))}
                        className="w-24 rounded bg-slate-800 px-2 py-1 text-center outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeLine(ln.v.id)}
                        className="rounded bg-red-700 px-2 py-1 hover:bg-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                      Add items using the search above
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={saving || !fromStoreId || !toStoreId || fromStoreId === toStoreId || lines.length === 0}
              onClick={() => onCreate(false)}
              className="rounded bg-slate-800 px-3 py-2 hover:bg-slate-700 disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              disabled={saving || !fromStoreId || !toStoreId || fromStoreId === toStoreId || lines.length === 0}
              onClick={() => onCreate(true)}
              className="rounded bg-indigo-600 px-3 py-2 hover:bg-indigo-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4 inline" /> Send Now
            </button>
          </div>

          {msg && <div className="mt-3 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm">{msg}</div>}
        </div>
      </div>

      {/* Right: List / Receive */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="font-semibold">Transfers</div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}
              className="rounded bg-slate-800 px-2 py-1 text-sm outline-none"
            >
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="RECEIVED">Received</option>
            </select>
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search…"
              className="rounded bg-slate-800 px-2 py-1 text-sm outline-none"
            />
          </div>
        </div>

        <div className="p-3">
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-900/70 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Transfer</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">From → To</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 w-40"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No transfers</td></tr>
                )}
                {!loading && rows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2">#{t.id}</td>
                    <td className="px-3 py-2">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{t.from_store.code} → {t.to_store.code}</td>
                    <td className="px-3 py-2 text-center">{t.line_count}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ring-1 ring-inset ${
                        t.status === "RECEIVED"
                          ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30"
                          : t.status === "SENT"
                          ? "bg-amber-500/20 text-amber-300 ring-amber-500/30"
                          : "bg-slate-700/40 text-slate-300 ring-slate-600/40"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {t.status === "DRAFT" && (
                          <button
                            onClick={async () => { await sendTransfer(t.id); fetchTransfers(); }}
                            className="rounded bg-indigo-600 px-2 py-1 hover:bg-indigo-500"
                          >
                            <Send className="h-4 w-4 inline" /> Send
                          </button>
                        )}
                        {t.status === "SENT" && (
                          <button
                            onClick={() => openReceive(t)}
                            className="rounded bg-emerald-600 px-2 py-1 hover:bg-emerald-500"
                          >
                            <CheckCircle2 className="h-4 w-4 inline" /> Receive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* pagination */}
            {Math.max(1, Math.ceil(count / pageSize)) > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-sm">
                <div className="text-slate-400">Page {page} of {Math.max(1, Math.ceil(count / pageSize))}</div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
                  >
                    Prev
                  </button>
                  <button
                    disabled={page >= Math.max(1, Math.ceil(count / pageSize))}
                    onClick={() => setPage((p) => Math.min(Math.max(1, Math.ceil(count / pageSize)), p + 1))}
                    className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {msg && <div className="mt-3 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm">{msg}</div>}
        </div>
      </div>

      {/* Receive modal */}
      {recvOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setRecvOpen(null)}>
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 p-4">
              <div className="font-semibold">{recvOpen.title}</div>
              <button onClick={() => setRecvOpen(null)} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-900/70 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2">Receive Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recvLines.map((ln, i) => (
                      <tr key={ln.variant_id}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{ln.product_name || ln.sku || `#${ln.variant_id}`}</div>
                          <div className="text-xs text-slate-400">{ln.sku || "—"}</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            value={ln.qty}
                            type="number"
                            onChange={(e) => {
                              const next = [...recvLines];
                              next[i] = { ...next[i], qty: Math.max(0, toInt(e.target.value, 0)) };
                              setRecvLines(next);
                            }}
                            className="w-28 rounded bg-slate-800 px-2 py-1 text-center outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                    {recvLines.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-6 text-center text-slate-400">No lines</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
              <button onClick={() => setRecvOpen(null)} className="rounded-lg px-3 py-2 bg-slate-700 hover:bg-slate-600">Cancel</button>
              <button
                disabled={recvSaving}
                onClick={doReceive}
                className="rounded-lg px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {recvSaving ? "Receiving…" : "Receive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
