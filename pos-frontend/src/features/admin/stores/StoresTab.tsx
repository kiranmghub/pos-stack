// pos-frontend/src/features/admin/stores/StoresTab.tsx
import React from "react";
import type { Store, Query } from "../adminApi";
import { StoresAPI } from "../api";
import { DataTable } from "../components/DataTable";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import Checkbox from "../components/ui/Checkbox";
import { useToast } from "../components/ToastCompat";
import StoreModal from "./StoreModal";


export default function StoresTab() {
  const { push } = useToast();
  const [query, setQuery] = React.useState<Query>({ search: "", ordering: "" });
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<Store[]>([]);
  const [total, setTotal] = React.useState<number | undefined>(undefined);

  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<Store | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Store | null>(null);

  // fetch list
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = { search: query.search || undefined, ordering: query.ordering || undefined, is_active: query.is_active };
        const page = await StoresAPI.list(p);
        const rows = Array.isArray(page) ? page : page.results ?? [];
        const cnt  = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e) {
        console.error(e);
        if (mounted) { setData([]); setTotal(undefined); }
        push({ kind: "error", msg: "Failed to load stores" });
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
      if (ok.length) push({ kind: is_active ? "success" : "warn", msg: `${is_active ? "Activated" : "Deactivated"} ${ok.length} store(s)` });
      if (fail.length) push({ kind: "error", msg: `Failed to update ${fail.length} store(s)` });
      setSelectedIds(fail);
      setQuery({ ...query }); // refresh
    } finally {
      setBulkLoading(false);
    }
  };

  const cols = React.useMemo(() => ([
    {
      key: "select",
      header: (
        <Checkbox
          checked={allChecked}
          indeterminate={partiallyChecked}
          onChange={toggleAll}
          aria-label="Select all"
          title="Select all"
        />
      ),
      render: (r: Store) => (
        <Checkbox
          checked={selectedIds.includes(r.id)}
          onChange={() => toggleRow(r.id)}
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
  ]), [allChecked, partiallyChecked, selectedIds]);

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
            push({ kind: "warn", msg: `Store "${deleting.code}" deleted` });
            setQuery({ ...query });
            setDeleting(null);
          } catch (e: any) {
            push({ kind: "error", msg: e?.message || "Delete failed" });
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


