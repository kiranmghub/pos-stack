// src/features/admin/registers/RegistersTab.tsx
import React from "react";
import type { Query, Store } from "../adminApi";
import { AdminAPI } from "../adminApi"; // to fetch stores for filter dropdown
import { RegistersAPI, type Register } from "../api/registers";
import { DataTable } from "../components/DataTable";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import { Checkbox } from "@/ui/checkbox";
import { useNotify } from "@/lib/notify";
import RegisterModal from "./RegisterModal";

export default function RegistersTab() {
  const { success, error, info, warn } = useNotify();
  const [query, setQuery] = React.useState<Query>({ search: "", ordering: "" });
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<Register[]>([]);
  const [total, setTotal] = React.useState<number | undefined>(undefined);

  const [stores, setStores] = React.useState<Store[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<Register | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Register | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<number[]>([]);

  // Load stores for the filter once
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

  // Fetch registers
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = {
          search: query.search || undefined,
          ordering: query.ordering || undefined,
          is_active: query.is_active,
          store: (query as any).store || undefined,
        };
        const page = await RegistersAPI.list(p);
        const rows = Array.isArray(page) ? page : page.results ?? [];
        const cnt  = Array.isArray(page) ? undefined : page.count;
        if (mounted) {
         // enrich registers with store name/code for display
         const enriched = rows.map((r) => {
           const storeObj = stores.find((s) => s.id === r.store);
           return {
             ...r,
             store_name: storeObj?.name || "",
             store_code: storeObj?.code || "",
           };
         });
         setData(enriched);
         setTotal(cnt);
        }
      } catch (e:any) {      
        error(e?.message || "Failed to load registers");
        if (mounted) { setData([]); setTotal(undefined); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [query, stores]);

  const allChecked = data.length > 0 && selectedIds.length === data.length;
  const partiallyChecked = selectedIds.length > 0 && !allChecked;

  const toggleAll = () => {
    setSelectedIds(prev => (prev.length === data.length ? [] : data.map(r => r.id)));
  };
  const toggleRow = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
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
          await RegistersAPI.update(id, { is_active });
          ok.push(id);
        } catch {
          fail.push(id);
        }
      }
      if (ok.length)
        //push({ kind: is_active ? "success" : "warn", msg: `${is_active ? "Activated" : "Deactivated"} ${ok.length} register(s)` });
        is_active ?
        success(`Activated ${ok.length} register(s)`) :
        warn(`Deactivated ${ok.length} register(s)`);
      if (fail.length)
        //push({ kind: "error", msg: `Failed to update ${fail.length} register(s)` });
        error(`Failed to update ${fail.length} register(s)`);
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
          render: (r: Register) => {
            const open = expandedIds.includes(r.id);
            return (
              <button
                className="text-slate-300 hover:text-white"
                title={open ? "Collapse" : "Expand"}
                onClick={() =>
                  setExpandedIds(prev =>
                    prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                  )
                }
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
      render: (r: Register) => (
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
    // { key: "store", header: "Store ID", align: "right" as const },
    {
      key: "store_name",
      header: "Store Name",
      render: (r: any) => r.store_name || "—",
    },
    {
      key: "store_code",
      header: "Store Code",
      render: (r: any) => r.store_code || "—",
    },
    {
      key: "is_active",
      header: "Active",
      render: (r: Register) => (
        <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
          {r.is_active ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r: Register) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            className="text-xs text-blue-400 hover:underline"
            onClick={() => { setEditing(r); setCreating(false); }}
          >
            Edit
          </button>
          <button
            className="text-xs text-red-400 hover:text-red-300"
            onClick={() => setDeleting(r)}
            title="Delete register"
          >
            Delete
          </button>
        </div>
      ),
    },
  ]), [allChecked, partiallyChecked, selectedIds]);

    const renderRowAfter = React.useCallback((r: any) => {
      if (!expandedIds.includes(r.id)) return null;
      return (
        <div className="bg-slate-900/60 rounded-md border border-slate-800 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400">Code</div>
              <div className="text-slate-200 break-words">{r.code || "—"}</div>
              <div className="text-xs text-slate-400 mt-2">Name</div>
              <div className="text-slate-200 break-words">{r.name || "—"}</div>
              <div className="text-xs text-slate-400 mt-2">Active</div>
              <div className="text-slate-200">{r.is_active ? "Yes" : "No"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Store</div>
              <div className="text-slate-200">
                {r.store_name ? `${r.store_name}${r.store_code ? ` (${r.store_code})` : ""}` : "—"}
              </div>
              <div className="text-xs text-slate-400 mt-2">Hardware Profile</div>
              <div className="text-slate-200 break-words text-xs max-w-[40rem]">
                {r.hardware_profile ? JSON.stringify(r.hardware_profile) : "—"}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button className="text-xs text-blue-400 hover:underline"
                    onClick={() => { setEditing(r); setCreating(false); }}>
              Edit
            </button>
          </div>
        </div>
      );
    }, [expandedIds]);

  return (
    <div className="space-y-4">
      {/* Filters + New */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <input
            value={query.search || ""}
            onChange={(e) => setQuery((p) => ({ ...p, search: e.target.value || undefined }))}
            placeholder="Search code or store…"
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

          <select
            value={(query as any).store || ""}
            onChange={(e) => setQuery((p) => ({ ...p, store: e.target.value === "" ? undefined : Number(e.target.value) }))}
            className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
            title="Filter by store"
          >
            <option value="">All Stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
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
              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm">+ New Register</button>
          )}
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="Registers"
        rows={data.map((r) => ({ ...r, selected: selectedIds.includes(r.id) }))}
        cols={cols as any}
        loading={loading}
        total={total}
        query={query}
        onQueryChange={(q) => setQuery((p) => ({ ...p, ...q }))}
        renderRowAfter={renderRowAfter}
        getRowKey={(row:any) => row.id ?? row.code}
      />

      {/* Modals */}
      {(creating || editing) && (
        <RegisterModal
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
            await RegistersAPI.remove(deleting.id);
            // push({ kind: "warn", msg: `Register "${deleting.code}" deleted` });
            warn(`Register "${deleting.code}" deleted`);
            setQuery({ ...query });
            setDeleting(null);
          } catch (e: any) {
            // push({ kind: "error", msg: e?.message || "Delete failed" });
            error
            setSelectedIds((prev) => Array.from(new Set([...prev, deleting.id])));
            setDeleting(null);
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
