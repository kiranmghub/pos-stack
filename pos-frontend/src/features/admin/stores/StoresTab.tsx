// pos-frontend/src/features/admin/stores/StoresTab.tsx
import React from "react";
import type { Store, Query } from "../adminApi";
import { StoresAPI } from "../api";
import { RegistersAPI, type Register } from "../api/registers";
import { DataTable } from "../components/DataTable";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import { Checkbox } from "@/ui/checkbox";
import { useNotify } from "@/lib/notify";
import StoreModal from "./StoreModal";
import { Warning } from "postcss";


export default function StoresTab() {
  const { success, error, info, warn } = useNotify();
  const [query, setQuery] = React.useState<Query>({ search: "", ordering: "" });
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<Store[]>([]);
  const [total, setTotal] = React.useState<number | undefined>(undefined);

  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<Store | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Store | null>(null);
  // expanded rows + lazy registers cache
  const [expandedIds, setExpandedIds] = React.useState<number[]>([]);
  const [regCache, setRegCache] = React.useState<Record<number, Register[]>>({});
  const [regLoading, setRegLoading] = React.useState<Record<number, boolean>>({});

  // fetch list
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = { search: query.search || undefined, ordering: query.ordering || undefined, is_active: query.is_active };
        const page = await StoresAPI.list(p);
        const rows = Array.isArray(page) ? page : page.results ?? [];
        const cnt = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e) {
        console.error(e);
        if (mounted) { setData([]); setTotal(undefined); }
        error("Failed to load stores");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [query]);

  const allChecked = data.length > 0 && selectedIds.length === data.length;
  const partiallyChecked = selectedIds.length > 0 && !allChecked;

  const toggleAll = () => {
    setSelectedIds((prev) => (prev.length === data.length ? [] : data.map((r) => r.id)));
  };
  const toggleRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleExpand = async (row: Store) => {
    setExpandedIds(prev =>
      prev.includes(row.id) ? prev.filter(id => id !== row.id) : [...prev, row.id]
    );
    // lazy load registers on first expand
    if (!regCache[row.id] && !regLoading[row.id]) {
      setRegLoading(prev => ({ ...prev, [row.id]: true }));
      try {
        const page = await RegistersAPI.listByStore(row.id);
        const regs = Array.isArray(page) ? page : (page.results ?? []);
        setRegCache(prev => ({ ...prev, [row.id]: regs }));
      } catch (e: any) {
        error(e?.message || "Failed to load registers");
      } finally {
        setRegLoading(prev => ({ ...prev, [row.id]: false }));
      }
    }
  };

  const bulkSetActive = async (is_active: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const ids = [...selectedIds];
      const ok: number[] = [];
      const fail: number[] = [];
      for (const id of ids) {
        try {
          await StoresAPI.update(id, { is_active });
          ok.push(id);
        } catch {
          fail.push(id);
        }
      }
      if (ok.length)
        //push({ kind: is_active ? "success" : "warn", msg: `${is_active ? "Activated" : "Deactivated"} ${ok.length} store(s)` });
        is_active ?
          success(`Activated ${ok.length} store(s)`) :
          is_active ? "Deactivated" :
            warn(`Deactivated ${ok.length} store(s)`);
      if (fail.length)
        //push({ kind: "error", msg: `Failed to update ${fail.length} store(s)` });
        error(`Failed to update ${fail.length} store(s)`);
      setSelectedIds(fail);
      setQuery({ ...query }); // refresh
    } finally {
      setBulkLoading(false);
    }
  };

  const cols = React.useMemo(() => ([
    {
      key: "__expander__",
      header: "",
      width: "2rem",
      render: (r: Store) => {
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
      render: (r: Store) => (
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
      key: "is_active",
      header: "Active",
      render: (r: Store) => (
        <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
          {r.is_active ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "location",
      header: "City/State",
      render: (r: any) => [r.city, r.state].filter(Boolean).join(", ") || r.country || "",
    },
    {
      key: "timezone",
      header: "Timezone",
    },
    {
      key: "actions",
      header: "",
      render: (r: Store) => (
        <div className="flex items-center gap-2 justify-end">
          <button className="text-xs text-blue-400 hover:underline" onClick={() => { setEditing(r); setCreating(false); }}>Edit</button>
          <button className="text-xs text-red-400 hover:text-red-300" onClick={() => setDeleting(r)}>Delete</button>
        </div>
      ),
    },
  ]), [allChecked, partiallyChecked, selectedIds, expandedIds]);
  // expanded panel renderer (full address + registers)
  const renderRowAfter = React.useCallback((r: Store) => {
    if (!expandedIds.includes(r.id)) return null;
    const regs = regCache[r.id];
    const isRegsLoading = !!regLoading[r.id];
    const address = [r.street, r.city, r.state, r.postal_code, r.country].filter(Boolean).join(", ");
    return (
      <div className="bg-slate-900/60 rounded-md border border-slate-800 p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-400">Address</div>
            <button
              className="text-xs text-blue-400 hover:underline"
              onClick={() => { setEditing(r); /* setCreating(false) not required here */ }}
            >
              Edit
            </button>
            <div className="text-slate-200">{address || "—"}</div>
            <div className="text-xs text-slate-400 mt-1">Timezone</div>
            <div className="text-slate-200">{(r as any).timezone || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Registers</span>
              {Array.isArray(regs) ? <span className="text-slate-500">{regs.length}</span> : null}
            </div>
            {isRegsLoading ? (
              <div className="mt-1 inline-flex items-center gap-2 text-slate-400 text-sm">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
                Loading Registers…
              </div>
            ) : Array.isArray(regs) && regs.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {regs.slice(0, 8).map((g) => (
                  <span key={g.id} className="px-2 py-0.5 rounded-full text-[11px] bg-slate-700/60 text-slate-200">
                    {g.code}{g.name ? ` • ${g.name}` : ""}
                  </span>
                ))}
                {regs.length > 8 && (
                  <span className="text-xs text-slate-400">+{regs.length - 8} more</span>
                )}
              </div>
            ) : (
              <div className="text-slate-400 text-sm">No registers linked.</div>
            )}
          </div>
        </div>
      </div>
    );
  }, [expandedIds, regCache, regLoading]);

  return (
    <div className="space-y-4">
      {/* Filters + New */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <input
            value={query.search || ""}
            onChange={(e) => setQuery((p) => ({ ...p, search: e.target.value || undefined }))}
            placeholder="Search code or name…"
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm outline-none placeholder:text-slate-400"
          />
          <select
            value={query.is_active === true ? "true" : query.is_active === false ? "false" : ""}
            onChange={(e) =>
              setQuery((p) => ({
                ...p,
                is_active: e.target.value === "" ? undefined : e.target.value === "true",
              }))
            }
            className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
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
              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm">+ New Store</button>
          )}
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="Stores"
        rows={data.map((r) => ({ ...r, selected: selectedIds.includes(r.id) }))}
        cols={cols as any}
        loading={loading}
        total={total}
        query={query}
        onQueryChange={(q) => setQuery((p) => ({ ...p, ...q }))}
        renderRowAfter={renderRowAfter}
        getRowKey={(row: any) => row.id ?? row.code}
      />

      {/* Modals */}
      {creating || editing ? (
        <StoreModal
          open={creating || !!editing}
          editing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => setQuery({ ...query })}
        />
      ) : null}

      <DeleteConfirmModal
        open={!!deleting}
        subject={deleting?.code}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await StoresAPI.remove(deleting.id);
            //push({ kind: "warn", msg: `Store "${deleting.code}" deleted` });
            warn(`Store "${deleting.code}" deleted`);
            setQuery({ ...query });
            setDeleting(null);
          } catch (e: any) {
            //push({ kind: "error", msg: e?.message || "Delete failed" });
            error(e?.message || "Delete failed");
            // keep failed row selected
            setSelectedIds((prev) => Array.from(new Set([...prev, deleting.id])));
            setDeleting(null);
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}


