// src/features/inventory/InventoryRoute.tsx
import React, { useEffect, useMemo, useState } from "react";
import AppShell, { PageHeading, ensureAuthedFetch } from "@/components/AppShell";
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
  ArrowLeftRight,
} from "lucide-react";

/* -------------------- utils -------------------- */
function toMoney(n: string | number) {
  const x = typeof n === "string" ? parseFloat(n) : n;
  return (isNaN(x) ? 0 : x).toFixed(2);
}

/* -------------------- Transfers types (frontend-only) -------------------- */
type InvTransferRow = {
  id: number;
  status: "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";
  from_store: { id: number; code: string; name: string } | null;
  to_store: { id: number; code: string; name: string } | null;
  lines_count: number;
  created_at: string;
};

type InvTransferCreate = {
  from_store_id: number;
  to_store_id: number;
  lines: Array<{ variant_id: number; qty: number }>;
  note?: string;
};

export default function InventoryRoute() {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [active, setActive] = useState<"overview" | "stock" | "ledger" | "transfers">("stock");

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
          icon={<Package className="h-5 w-5" />}
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
          <TabButton
            active={active === "overview"}
            onClick={() => setActive("overview")}
            label="Overview"
            icon={<Activity className="h-4 w-4" />}
          />
          <TabButton
            active={active === "stock"}
            onClick={() => setActive("stock")}
            label="Stock by Store"
            icon={<SlidersHorizontal className="h-4 w-4" />}
          />
          <TabButton
            active={active === "ledger"}
            onClick={() => setActive("ledger")}
            label="Ledger"
            icon={<ListChecks className="h-4 w-4" />}
          />
          <TabButton
            active={active === "transfers"}
            onClick={() => setActive("transfers")}
            label="Transfers"
            icon={<ArrowLeftRight className="h-4 w-4" />}
          />
        </div>
      </div>

      {storeId ? (
        <>
          {active === "overview" && <OverviewTab storeId={storeId} />}
          {active === "stock" && <StockTab storeId={storeId} />}
          {active === "ledger" && <LedgerTab storeId={storeId} />}
          {active === "transfers" && <TransfersTab storeId={storeId} stores={stores} />}
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
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
        active ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
      }`}
    >
      {icon} {label}
    </button>
  );
}

/* -------------------- Overview -------------------- */
function OverviewTab({ storeId }: { storeId: number }) {
  const [data, setData] = useState<{ on_hand_value: string; low_stock_count: number; recent: any[]; summary?: any } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await getOverview({ store_id: storeId });
        setData(d);
      } catch (e: any) {
        setMsg(e.message || "Failed to load overview");
      }
    })();
  }, [storeId]);

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="On-hand value" value={`$${toMoney(data?.on_hand_value || "0")}`} />
        <KpiCard label="Low stock items" value={String(data?.low_stock_count ?? 0)} />
        <KpiCard label="Recent movements" value={String(data?.recent?.length ?? 0)} />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/50 font-medium">Recent movements</div>
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
            {(data?.recent || []).map((r) => (
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
                      r.on_hand <= 0
                        ? "bg-red-600/20 text-red-300 ring-red-600/30"
                        : r.low_stock
                        ? "bg-amber-500/20 text-amber-300 ring-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30"
                    }`}
                  >
                    {r.on_hand}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">${toMoney(r.price)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setAdjustFor(r)}
                    className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
                  >
                    Adjust
                  </button>
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-sm">
            <div className="text-slate-400">
              Page {page} of {totalPages}
            </div>
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

      {adjustFor && (
        <AdjustModal
          row={adjustFor}
          reasons={reasons}
          onClose={() => setAdjustFor(null)}
          onSaved={async (delta, reason_code, note) => {
            await createAdjustment({
              store_id: storeId,
              reason_code,
              note,
              lines: [{ variant_id: adjustFor.id, delta }],
            });
            setAdjustFor(null);
            load();
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
  onSaved,
}: {
  row: InvStockRow;
  reasons: InvReason[];
  onClose: () => void;
  onSaved: (delta: number, reason_code: string, note?: string) => Promise<void>;
}) {
  const [qty, setQty] = useState<string>("");
  const [reason, setReason] = useState<string>(reasons[0]?.code || "COUNT");
  const [note, setNote] = useState("");
  const delta = parseInt(qty || "0", 10) || 0;
  const canSave = delta !== 0 && reason;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="font-semibold">
            Adjust: {row.product_name} ({row.sku || "—"})
          </div>
          <button onClick={onClose} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Current on hand</span>
            <span className="font-semibold">{row.on_hand}</span>
          </div>
          <label className="block">
            <span className="text-slate-300">Change by (use negative to decrease)</span>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setQty(String((parseInt(qty || "0") || 0) - 1))}
                className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))}
                className="w-24 rounded bg-slate-800 px-2 py-1 outline-none text-center"
                placeholder="+/-"
              />
              <button
                onClick={() => setQty(String((parseInt(qty || "0") || 0) + 1))}
                className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </label>

          <label className="block">
            <span className="text-slate-300">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none"
            >
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-slate-300">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded px-3 py-2 bg-slate-700 hover:bg-slate-600">
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() => onSaved(delta, reason, note)}
            className="rounded px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            Apply
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
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
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
            placeholder="Search product/SKU/note…"
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
            {[25, 50, 100, 200].map((n) => (
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
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2">Δ</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2 text-left">Ref</th>
              <th className="px-3 py-2 text-left">Note</th>
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
                <td className="px-3 py-2">{r.note || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No ledger entries
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-sm">
            <div className="text-slate-400">
              Page {page} of {totalPages}
            </div>
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

/* -------------------- Transfers -------------------- */
function TransfersTab({ storeId, stores }: { storeId: number; stores: StoreLite[] }) {
  const [rows, setRows] = useState<InvTransferRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [msg, setMsg] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  async function load() {
    try {
      const params = new URLSearchParams({
        store_id: String(storeId),
        page: String(page),
        page_size: String(pageSize),
      });
      const res = await ensureAuthedFetch(`/api/v1/inventory/transfers?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load transfers (${res.status})`);
      const data = (await res.json()) as { results: InvTransferRow[]; count: number };
      setRows(data.results || []);
      setCount(data.count || 0);
    } catch (e: any) {
      setMsg(e.message || "Failed to load transfers");
      setRows([]);
      setCount(0);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [storeId, page, pageSize]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-slate-300 text-sm">Transfers touching this store (as source or destination)</div>
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" /> New Transfer
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-900/70 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">From → To</th>
              <th className="px-3 py-2">Lines</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2">{new Date(t.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {(t.from_store?.code || "—")} → {(t.to_store?.code || "—")}
                </td>
                <td className="px-3 py-2 text-center">{t.lines_count}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  No transfers
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-sm">
            <div className="text-slate-400">
              Page {page} of {totalPages}
            </div>
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

      {newOpen && (
        <NewTransferModal
          fromStoreIdDefault={storeId}
          stores={stores}
          onClose={() => setNewOpen(false)}
          onCreated={async (payload) => {
            // POST create
            const res = await ensureAuthedFetch("/api/v1/inventory/transfers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const txt = await res.text().catch(() => "");
              throw new Error(txt || `Failed to create transfer (${res.status})`);
            }
            setNewOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: InvTransferRow["status"] }) {
  let cls = "bg-slate-700 text-slate-200 ring-slate-600/40";
  if (status === "SENT") cls = "bg-amber-500/20 text-amber-300 ring-amber-500/30";
  if (status === "RECEIVED") cls = "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30";
  if (status === "CANCELLED") cls = "bg-red-600/20 text-red-300 ring-red-600/30";
  return <span className={`px-2 py-0.5 text-xs rounded ring-1 ring-inset ${cls}`}>{status}</span>;
}

function NewTransferModal({
  fromStoreIdDefault,
  stores,
  onClose,
  onCreated,
}: {
  fromStoreIdDefault: number;
  stores: StoreLite[];
  onClose: () => void;
  onCreated: (payload: InvTransferCreate) => Promise<void>;
}) {
  const [fromId, setFromId] = useState<number>(fromStoreIdDefault);
  const [toId, setToId] = useState<number>(() => {
    const alt = stores.find((s) => s.id !== fromStoreIdDefault)?.id;
    return alt ?? fromStoreIdDefault;
  });
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Array<{ variant_id: string; qty: string }>>([{ variant_id: "", qty: "" }]);
  const [saving, setSaving] = useState(false);
  const canSave =
    fromId > 0 &&
    toId > 0 &&
    fromId !== toId &&
    lines.some((l) => Number(l.variant_id) > 0 && Number(l.qty) !== 0);

  function updateLine(i: number, patch: Partial<{ variant_id: string; qty: string }>) {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    setLines(next);
  }
  function addLine() {
    setLines((x) => [...x, { variant_id: "", qty: "" }]);
  }
  function removeLine(i: number) {
    const next = [...lines];
    next.splice(i, 1);
    setLines(next.length ? next : [{ variant_id: "", qty: "" }]);
  }

  async function handleCreate() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: InvTransferCreate = {
        from_store_id: fromId,
        to_store_id: toId,
        note: note || undefined,
        lines: lines
          .filter((l) => Number(l.variant_id) > 0 && Number(l.qty) !== 0)
          .map((l) => ({ variant_id: Number(l.variant_id), qty: Number(l.qty) })),
      };
      await onCreated(payload);
    } catch (e) {
      // surface minimal error
      alert((e as any)?.message || "Failed to create transfer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="font-semibold">New Transfer</div>
          <button onClick={onClose} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-slate-300">From store</span>
              <select
                value={fromId}
                onChange={(e) => setFromId(Number(e.target.value))}
                className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-slate-300">To store</span>
              <select
                value={toId}
                onChange={(e) => setToId(Number(e.target.value))}
                className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none"
              >
                {stores
                  .filter((s) => s.id !== fromId || s.id === toId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-slate-300">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none"
            />
          </label>

          {/* Lines */}
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-900/70 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">Variant ID</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {lines.map((ln, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <input
                        value={ln.variant_id}
                        onChange={(e) =>
                          updateLine(i, {
                            variant_id: e.target.value.replace(/[^\d]/g, ""),
                          })
                        }
                        className="w-full rounded bg-slate-800 px-2 py-1 outline-none"
                        placeholder="e.g. 1024"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        value={ln.qty}
                        onChange={(e) =>
                          updateLine(i, {
                            qty: e.target.value.replace(/[^\d-]/g, ""),
                          })
                        }
                        className="w-24 rounded bg-slate-800 px-2 py-1 outline-none text-center"
                        placeholder="+/-"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeLine(i)}
                        className="rounded bg-red-700 px-2 py-1 hover:bg-red-600"
                        title="Remove line"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                      No lines
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button
            onClick={addLine}
            className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700 inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add line
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded px-3 py-2 bg-slate-700 hover:bg-slate-600">
            Cancel
          </button>
          <button
            disabled={!canSave || saving}
            onClick={handleCreate}
            className="rounded px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
