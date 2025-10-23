// pos-frontend/src/features/admin/taxrules/TaxRulesTab.tsx
import React from "react";
import type { Query, Store } from "../adminApi";
import { AdminAPI } from "../adminApi"; // to fetch stores for filter dropdown
import { TaxRulesAPI, type TaxRule } from "../api/taxrules";
import { DataTable } from "../components/DataTable";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import { Checkbox } from "@/ui/checkbox";
import { useNotify } from "@/lib/notify";
import TaxRuleModal from "./TaxRuleModal";

export default function TaxRulesTab() {
  const { success, error, info, warn } = useNotify();

  const [query, setQuery] = React.useState<Query>({ search: "", ordering: "priority" });
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<TaxRule[]>([]);
  const [total, setTotal] = React.useState<number | undefined>(undefined);

  const [stores, setStores] = React.useState<Store[]>([]);

  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = React.useState(false);

  const [editing, setEditing] = React.useState<TaxRule | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<TaxRule | null>(null);

  // NEW: expanded row state
  const [expandedIds, setExpandedIds] = React.useState<number[]>([]);

  // load stores for filter
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const page = await AdminAPI.stores({ is_active: true });
        const list = Array.isArray(page) ? page : (page.results ?? []);
        if (mounted) setStores(list);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  // fetch rules
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = {
          search: query.search || undefined,
          ordering: query.ordering || undefined,
          is_active: query.is_active,
          scope: (query as any).scope,
          basis: (query as any).basis,
          apply_scope: (query as any).apply_scope,
          store: (query as any).store,
        };
        const page = await TaxRulesAPI.list(p);
        const rows = Array.isArray(page) ? page : page.results ?? [];
        const cnt  = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e:any) {
        // push({ kind: "error", msg: e?.message || "Failed to load tax rules" });
        error(e?.message || "Failed to load tax rules");
        if (mounted) { setData([]); setTotal(undefined); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [query]);

  const allChecked = data.length > 0 && selectedIds.length === data.length;
  const partiallyChecked = selectedIds.length > 0 && !allChecked;

  const toggleAll = () => {
    setSelectedIds(prev => (prev.length === data.length ? [] : data.map(r => r.id)));
  };
  const toggleRow = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleExpand = (row: TaxRule) => {
    setExpandedIds(prev => prev.includes(row.id) ? prev.filter(id => id !== row.id) : [...prev, row.id]);
  };

  const bulkSetActive = async (is_active: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const ids = [...selectedIds];
      const ok: number[] = [];
      const fail: number[] = [];
      for (const id of ids) {
        try { await TaxRulesAPI.update(id, { is_active }); ok.push(id); }
        catch { fail.push(id); }
      }
      if (ok.length) 
        // push({ kind: is_active ? "success" : "warn", msg: `${is_active ? "Activated" : "Deactivated"} ${ok.length} rule(s)` });
        is_active ? success(`Activated ${ok.length} rule(s)`) : warn(`Deactivated ${ok.length} rule(s)`);
      if (fail.length) 
        // push({ kind: "error", msg: `Failed to update ${fail.length} rule(s)` });
        error(`Failed to update ${fail.length} rule(s)`);
      setSelectedIds(fail);
      setQuery({ ...query });
    } finally {
      setBulkLoading(false);
    }
  };

  const fmtPct = (val?: string | null) => {
    const n = Number(val);
    if (isNaN(n)) return "—";
    const pct = n > 1 ? n : n * 100;
    return `${pct.toFixed(2)}%`;
  };
  const fmtAmt = (val?: string | null) => {
    const n = Number(val);
    if (isNaN(n)) return "—";
    return `$${n.toFixed(2)}`;
  };
  const windowLabel = (s?: string | null, e?: string | null) => {
    const ss = s ? s.replace("T"," ").slice(0,16) : "";
    const ee = e ? e.replace("T"," ").slice(0,16) : "";
    if (!ss && !ee) return "No window";
    if (ss && !ee) return `From ${ss}`;
    if (!ss && ee) return `Until ${ee}`;
    return `${ss} → ${ee}`;
  };

  const cols = React.useMemo(() => ([
    // NEW: expander caret
    {
      key: "__expander__",
      header: "",
      width: "2rem",
      render: (r: TaxRule) => {
        const open = expandedIds.includes(r.id);
        return (
          <button
            className="text-slate-300 hover:text-white"
            title={open ? "Collapse" : "Expand"}
            onClick={() => toggleExpand(r)}
          >
            <svg className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        );
      }
    },
    {
      key: "select",
      header: (
        <Checkbox
          checked={allChecked ? true : partiallyChecked ? "indeterminate" : false}
          onCheckedChange={toggleAll}
          aria-label="Select all"
          title="Select all"
        />
      ),
      render: (r: TaxRule) => (
        <Checkbox
          checked={selectedIds.includes(r.id)}
          onCheckedChange={() => toggleRow(r.id)}
          aria-label="Select row"
        />
      ),
      width: "2rem",
    },
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    {
      key: "basis",
      header: "Basis",
      render: (r: TaxRule) => (
        r.basis === "PCT"
          ? <span title={fmtPct(r.rate)} className="px-2 py-0.5 rounded-full text-xs bg-emerald-600/30 text-emerald-200">{fmtPct(r.rate)}</span>
          : <span title={fmtAmt(r.amount)} className="px-2 py-0.5 rounded-full text-xs bg-sky-600/30 text-sky-200">{fmtAmt(r.amount)}</span>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      render: (r: TaxRule) => (
        <span className="text-sm">
          {r.scope === "STORE" ? "STORE" : "GLOBAL"}
        </span>
      ),
    },
    {
      key: "store_name",
      header: "Store",
      render: (r: any) => (
        r.scope === "STORE"
          ? (r.store_name || (r.store ? `#${r.store}` : "—"))
          : "All Stores"
      ),
    },
    {
      key: "category_names",
      header: "Cats",
      render: (r: any) => {
        const names: string[] = r.category_names || [];
        if (!names.length) return "All Categories";
        const shown = names.slice(0, 3);
        const more = names.length - shown.length;
        return (
          <span title={names.join(", ")}>
            {shown.join(", ")}{more > 0 ? ` +${more} more` : ""}
          </span>
        );
      },
    },
    { key: "apply_scope", header: "Apply" },
    { key: "priority", header: "Prio", align: "right" as const },
    { key: "start_at", header: "Start", render: (r: TaxRule) => r.start_at ? r.start_at.replace("T"," ").slice(0,16) : "—" },
    { key: "end_at", header: "End", render: (r: TaxRule) => r.end_at ? r.end_at.replace("T"," ").slice(0,16) : "—" },
    {
      key: "is_active",
      header: "Active",
      render: (r: TaxRule) => (
        <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
          {r.is_active ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r: TaxRule) => (
        <div className="flex items-center gap-2 justify-end">
          <button className="text-xs text-blue-400 hover:underline" onClick={() => { setEditing(r); setCreating(false); }}>
            Edit
          </button>
          <button className="text-xs text-red-400 hover:text-red-300" onClick={() => setDeleting(r)}>
            Delete
          </button>
        </div>
      ),
    },
  ]), [allChecked, partiallyChecked, selectedIds, expandedIds]);

  // NEW: expanded detail panel
  const renderRowAfter = React.useCallback((r: any) => {
    if (!expandedIds.includes(r.id)) return null;
    const basisLabel = r.basis === "PCT" ? fmtPct(r.rate) : fmtAmt(r.amount);
    const scopeLabel = r.scope === "STORE" ? (r.store_name || (r.store ? `#${r.store}` : "—")) : "All Stores";
    const cats: string[] = r.category_names || [];
    return (
      <div className="bg-slate-900/60 rounded-md border border-slate-800 p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-400">Description</div>
            <div className="text-slate-200 break-words">{r.description || "—"}</div>
            <div className="text-xs text-slate-400 mt-2">Scope</div>
            <div className="text-slate-200">{r.scope} • {scopeLabel}</div>
            <div className="text-xs text-slate-400 mt-2">Apply</div>
            <div className="text-slate-200">{r.apply_scope}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Basis</div>
            <div className="text-slate-200">{basisLabel}</div>
            <div className="text-xs text-slate-400 mt-2">Priority</div>
            <div className="text-slate-200">{r.priority}</div>
            <div className="text-xs text-slate-400 mt-2">Window</div>
            <div className="text-slate-200">{windowLabel(r.start_at, r.end_at)}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="text-xs text-slate-400 mb-1">Categories</div>
          {cats.length ? (
            <div className="flex flex-wrap gap-1">
              {cats.slice(0, 12).map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-slate-700/60 text-slate-200">
                  {c}
                </span>
              ))}
              {cats.length > 12 && <span className="text-xs text-slate-400">+{cats.length - 12} more</span>}
            </div>
          ) : (
            <div className="text-slate-400 text-sm">All taxable items.</div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {r.is_active ? <span className="text-emerald-300">Active</span> : <span className="text-slate-400">Inactive</span>}
          </div>
          <div>
            <button className="text-xs text-blue-400 hover:underline" onClick={() => { setEditing(r); setCreating(false); }}>
              Edit
            </button>
          </div>
        </div>
      </div>
    );
  }, [expandedIds]);

  return (
    <div className="space-y-4">
      {/* Filters + New */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            value={query.search || ""}
            onChange={(e) => setQuery((p) => ({ ...p, search: e.target.value || undefined }))}
            placeholder="Search code, name or category code…"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm outline-none placeholder:text-slate-400"
          />
          <select
            value={(query as any).scope || ""}
            onChange={(e) => setQuery((p) => ({ ...p, scope: e.target.value || undefined }))}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
            title="Scope"
          >
            <option value="">All scopes</option>
            <option value="GLOBAL">Global</option>
            <option value="STORE">Store</option>
          </select>
          <select
            value={(query as any).basis || ""}
            onChange={(e) => setQuery((p) => ({ ...p, basis: e.target.value || undefined }))}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
            title="Basis"
          >
            <option value="">All basis</option>
            <option value="PCT">Percent</option>
            <option value="FLAT">Flat</option>
          </select>
          <select
            value={(query as any).apply_scope || ""}
            onChange={(e) => setQuery((p) => ({ ...p, apply_scope: e.target.value || undefined }))}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
            title="Apply scope"
          >
            <option value="">Apply to</option>
            <option value="LINE">Line</option>
            <option value="RECEIPT">Receipt</option>
          </select>
          <select
            value={(query as any).store || ""}
            onChange={(e) => setQuery((p) => ({ ...p, store: e.target.value === "" ? undefined : Number(e.target.value) }))}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
            title="Filter by store"
          >
            <option value="">All stores</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
          <select
            value={query.is_active === true ? "true" : query.is_active === false ? "false" : ""}
            onChange={(e) =>
              setQuery((p) => ({
                ...p,
                is_active: e.target.value === "" ? undefined : e.target.value === "true",
              }))
            }
            className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
            title="Active"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 ? (
            <>
              <button disabled={bulkLoading} onClick={() => bulkSetActive(true)}
                className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">Activate Selected</button>
              <button disabled={bulkLoading} onClick={() => bulkSetActive(false)}
                className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white">Deactivate Selected</button>
              <button onClick={() => setSelectedIds([])}
                className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100">Clear</button>
            </>
          ) : (
            <button onClick={() => { setEditing(null); setCreating(true); }}
              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm">+ New Tax Rule</button>
          )}
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="Tax Rules"
        rows={data.map((r) => ({ ...r, selected: selectedIds.includes(r.id) }))}
        cols={cols as any}
        loading={loading}
        total={total}
        query={query}
        onQueryChange={(q) => setQuery((p) => ({ ...p, ...q }))}
        getRowKey={(row:any) => row.id ?? row.code}
        renderRowAfter={renderRowAfter}   // ← show expanded details
      />

      {/* Modals */}
      {(creating || editing) && (
        <TaxRuleModal
          open={creating || !!editing}
          editing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => setQuery({ ...query })}
        />
      )}

      <DeleteConfirmModal
        open={!!deleting}
        subject={deleting?.code}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await TaxRulesAPI.remove(deleting.id);
            // push({ kind: "warn", msg: `Tax rule "${deleting.code}" deleted` });
            warn(`Tax rule "${deleting.code}" deleted`);
            setQuery({ ...query });
            setDeleting(null);
          } catch (e: any) {
            // push({ kind: "error", msg: e?.message || "Delete failed" });
            error(e?.message || "Delete failed");
            setSelectedIds(prev => Array.from(new Set([...prev, deleting.id])));
            setDeleting(null);
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
