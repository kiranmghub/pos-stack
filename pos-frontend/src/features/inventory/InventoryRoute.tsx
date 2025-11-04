// pos-frontend/src/features/inventory/InventoryRoute.tsx
import React, { useEffect, useState } from "react";
import AppShell, { PageHeading } from "@/components/AppShell";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import {
  listReasons,
  listStock,
  getOverview,
  createAdjustment,
  listLedger,
  type InvReason,
  type InvStockRow,
} from "./api";
import {
  Package,
  SlidersHorizontal,
  ListChecks,
  Activity,
  Plus,
  Minus,
  Search,
  CheckCircle2,
  X,
} from "lucide-react";

// NEW: Transfers page import
import TransfersPage from "@/features/inventory/TransfersPage";
import CountsPage from "@/features/inventory/CountsPage";

function toMoney(n: string | number) {
  const x = typeof n === "string" ? parseFloat(n) : n;
  return (isNaN(x) ? 0 : x).toFixed(2);
}

export default function InventoryRoute() {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  // NEW: include "transfers" in the union
  const [active, setActive] = useState<"overview" | "stock" | "ledger" | "transfers" | "counts">("stock");

  useEffect(() => {
    (async () => {
      const s = await getMyStores();
      const arr = Array.isArray(s) ? s : (s as any).results || [];
      setStores(arr);
      if (!storeId && arr.length) setStoreId(arr[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <PageHeading
//           icon={<Package className="h-5 w-5" />}
          title="Inventory"
          subtitle="Manage stock levels, adjustments, transfers, and ledger"
        />
        <div className="flex items-center gap-2">
          <select
            value={storeId ?? ""}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="rounded-lg bg-slate-800 px-3 py-2 outline-none"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3">
        <div className="flex gap-2">
          <TabButton active={active === "overview"} onClick={() => setActive("overview")} label="Overview" icon={<Activity className="h-4 w-4" />} />
          <TabButton active={active === "stock"} onClick={() => setActive("stock")} label="Stock by Store" icon={<SlidersHorizontal className="h-4 w-4" />} />
          <TabButton active={active === "ledger"} onClick={() => setActive("ledger")} label="Ledger" icon={<ListChecks className="h-4 w-4" />} />
          {/* NEW: Transfers tab button */}
          <TabButton active={active === "transfers"} onClick={() => setActive("transfers")} label="Transfers" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M7 7h10M7 12h10M7 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>} />
          <TabButton active={active === "counts"} onClick={() => setActive("counts")} label="Counts" icon={<ListChecks className="h-4 w-4" />} />
        </div>
      </div>

      {storeId ? (
        <>
          {active === "overview" && <OverviewTab storeId={storeId} />}
          {active === "stock" && <StockTab storeId={storeId} />}
          {active === "ledger" && <LedgerTab storeId={storeId} />}
          {/* NEW: render Transfers page (self-contained) */}
          {active === "transfers" && <TransfersPage />}
{/*           {active === "counts" && <CountsPage storeId={storeId} />} */}
          {active === "counts" && <CountsPage />}
        </>
      ) : (
        <div className="p-6 text-slate-400">No stores found.</div>
      )}
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 ${active ? "bg-white/10" : "bg-transparent hover:bg-white/5"}`}
    >
      <span className="inline-flex items-center gap-2">
        {icon} <span>{label}</span>
      </span>
    </button>
  );
}

/* -------------------- Overview -------------------- */
function OverviewTab({ storeId }: { storeId: number }) {
  const [data, setData] = useState<{ on_hand_value?: string; low_stock_count?: number; recent?: any[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getOverview({ store_id: storeId });
        setData(res || {});
      } catch (e: any) {
        setMsg(e.message || "Failed to load overview");
      }
    })();
  }, [storeId]);

  const { on_hand_value, low_stock_count, recent } = data || {};

  return (
    <div className="p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="On-hand value" value={`$${toMoney(on_hand_value || "0")}`} />
        <KpiCard label="Low-stock items" value={String(low_stock_count ?? 0)} />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900/70 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2 text-left">Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(recent || []).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {r.product_name} ({r.sku || "—"})
                </td>
                <td className="px-3 py-2 text-center">{r.qty_delta > 0 ? `+${r.qty_delta}` : r.qty_delta}</td>
                <td className="px-3 py-2 text-center">{r.balance_after ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.ref_type}
                  {r.ref_id ? ` #${r.ref_id}` : ""}
                </td>
              </tr>
            ))}
            {(!data?.recent || data.recent.length === 0) && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                  No recent movements
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <div className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm">{msg}</div>}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-slate-400 text-sm">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

/* -------------------- Stock by Store -------------------- */
function StockTab({ storeId }: { storeId: number }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<InvStockRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [reasons, setReasons] = useState<InvReason[]>([]);
  const [adjustFor, setAdjustFor] = useState<InvStockRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  async function load() {
    try {
      const [rs, st] = await Promise.all([
        listReasons(),
        listStock({ store_id: storeId, q, page, page_size: pageSize }),
      ]);
      setReasons(rs);
      setRows(st.results);
      setCount(st.count);
    } catch (e: any) {
      setMsg(e.message || "Failed to load stock");
      setRows([]);
      setCount(0);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [storeId, q, page, pageSize]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 min-w-[260px] flex-1">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search product / SKU / barcode…"
            className="bg-transparent outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
          <span className="text-slate-400 text-sm">Page size</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-transparent outline-none"
          >
            {[12, 24, 48, 96].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900/70 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2">On hand</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-900/40">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.product_name}</div>
                  <div className="text-xs text-slate-400">
                    {r.sku || "—"} {r.barcode ? `• ${r.barcode}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ring-1 ring-inset ${
                      (r.low_stock || 0)
                        ? "bg-amber-500/20 text-amber-300 ring-amber-500/30"
                        : r.on_hand <= 0
                        ? "bg-red-600/20 text-red-300 ring-red-600/30"
                        : "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30"
                    }`}
                  >
                    {r.on_hand}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">${toMoney(r.price || "0.00")}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setAdjustFor(r)}
                      className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
                      title="Adjust"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  No items
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-sm">
            <div className="text-slate-400">Page {page} of {totalPages}</div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && <div className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm">{msg}</div>}

      {/* Adjust modal */}
      {adjustFor && (
        <AdjustModal
          row={adjustFor}
          reasons={reasons}
          onClose={() => setAdjustFor(null)}
          onSave={async (delta, reason_code) => {
            try {
              await createAdjustment({
                store_id: storeId,
                reason_code,
                lines: [{ variant_id: adjustFor.id, delta }],
              });
              setMsg("Adjustment saved");
              setAdjustFor(null);
              load();
            } catch (e: any) {
              setMsg(e.message || "Failed to save adjustment");
            }
          }}
        />
      )}
    </div>
  );
}

function AdjustModal({
  row,
  reasons,
  onClose,
  onSave,
}: {
  row: InvStockRow;
  reasons: InvReason[];
  onClose: () => void;
  onSave: (delta: number, reason_code: string) => Promise<void>;
}) {
  const [qty, setQty] = useState<string>("");
  const [reason, setReason] = useState<string>(reasons[0]?.code || "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="font-semibold">Adjust: {row.product_name}</div>
          <button onClick={onClose} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <label className="text-sm">
            Quantity change (use negative to reduce)
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
              placeholder="+5 or -2"
            />
          </label>

          <label className="text-sm">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
            >
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded-lg px-3 py-2 bg-slate-700 hover:bg-slate-600">
            Cancel
          </button>
          <button
            disabled={saving || !qty.trim() || isNaN(Number(qty))}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(Number(qty), reason);
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Ledger -------------------- */
function LedgerTab({ storeId }: { storeId: number }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const res = await listLedger({ store_id: storeId, q, page, page_size: pageSize });
      setRows(res.results || []);
      setCount(res.count || 0);
    } catch (e: any) {
      setMsg(e.message || "Failed to load ledger");
      setRows([]);
      setCount(0);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [storeId, q, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 min-w-[260px] flex-1">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search item / note / ref…"
            className="bg-transparent outline-none flex-1"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900/70 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2 text-left">Ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {r.product_name} ({r.sku || "—"})
                </td>
                <td className="px-3 py-2 text-center">{r.qty_delta > 0 ? `+${r.qty_delta}` : r.qty_delta}</td>
                <td className="px-3 py-2 text-center">{r.balance_after ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.ref_type}
                  {r.ref_id ? ` #${r.ref_id}` : ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                  No entries
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-sm">
            <div className="text-slate-400">Page {page} of {totalPages}</div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && <div className="rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm">{msg}</div>}
    </div>
  );
}
