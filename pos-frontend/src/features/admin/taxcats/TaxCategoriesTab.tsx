// pos-frontend/src/features/admin/taxcats/TaxCategoriesTab.tsx
import React from "react";
import type { Query } from "../adminApi";
import { TaxCatsAPI, type TaxCategory } from "../api/taxcats";
import { DataTable } from "../components/DataTable";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import { useToast } from "../components/ToastCompat";
import TaxCategoryModal from "./TaxCategoryModal";
import { Checkbox } from "@/ui/checkbox";

export default function TaxCategoriesTab() {
  const { push } = useToast();
  const [query, setQuery] = React.useState<Query>({ search: "", ordering: "" });
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<TaxCategory[]>([]);
  const [total, setTotal] = React.useState<number | undefined>(undefined);

  const [editing, setEditing] = React.useState<TaxCategory | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<TaxCategory | null>(null);

  // NEW: bulk selection + confirm
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const allChecked = data.length > 0 && selectedIds.length === data.length;
  const partiallyChecked = selectedIds.length > 0 && !allChecked;

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = { search: query.search || undefined, ordering: query.ordering || undefined };
        const page = await TaxCatsAPI.list(p);
        const rows = Array.isArray(page) ? page : page.results ?? [];
        const cnt  = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e:any) {
        push({ kind: "error", msg: e?.message || "Failed to load tax categories" });
        if (mounted) { setData([]); setTotal(undefined); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [query]);

  const toggleAll = () => {
    setSelectedIds(prev => (prev.length === data.length ? [] : data.map(r => r.id)));
  };
  const toggleRow = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const cols = React.useMemo(() => ([
    // NEW: selection column
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
      render: (r: TaxCategory) => (
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
      key: "rate",
      header: "Rate",
      align: "right" as const,
      render: (r: TaxCategory) => `${Number(r.rate).toFixed(4)}`,
    },
    {
      key: "description",
      header: "Description",
      render: (r: TaxCategory) => (
        <span title={r.description || ""} className="line-clamp-2 max-w-[28rem] block">
          {r.description || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r: TaxCategory) => (
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
  // memo deps include selection state so header checkbox updates correctly
  ]), [allChecked, partiallyChecked, selectedIds]);

  // Bulk delete handler
  const onBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const ids = [...selectedIds];
      const ok: number[] = [];
      const fail: number[] = [];
      for (const id of ids) {
        try {
          await TaxCatsAPI.remove(id);
          ok.push(id);
        } catch {
          fail.push(id);
        }
      }
      if (ok.length) push({ kind: "warn", msg: `Deleted ${ok.length} tax categor${ok.length === 1 ? "y" : "ies"}` });
      if (fail.length) push({ kind: "error", msg: `Failed to delete ${fail.length} item(s)` });
      setSelectedIds(fail);       // keep failures selected
      setQuery({ ...query });     // refresh list
    } finally {
      setBulkLoading(false);
      setBulkOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        {/* Left is DataTable's search/order UI; we only add actions on the right */}
        <div />
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 ? (
            <>
              <button
                onClick={() => setBulkOpen(true)}
                disabled={bulkLoading}
                className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white"
              >
                Delete Selected
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100"
              >
                Clear
              </button>
            </>
          ) : (
            <button
              onClick={() => { setEditing(null); setCreating(true); }}
              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >
              + New Tax Category
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="Tax Categories"
        rows={data.map(r => ({ ...r, selected: selectedIds.includes(r.id) }))} // highlight selected rows
        cols={cols as any}
        loading={loading}
        total={total}
        query={query}
        onQueryChange={(q) => setQuery((p) => ({ ...p, ...q }))}
        getRowKey={(row: any) => row.id ?? row.code}
      />

      {/* Modals */}
      {(creating || editing) && (
        <TaxCategoryModal
          open={creating || !!editing}
          editing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => setQuery({ ...query })}
        />
      )}

      {/* Single delete */}
      <DeleteConfirmModal
        open={!!deleting}
        subject={deleting?.code}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await TaxCatsAPI.remove(deleting.id);
            push({ kind: "warn", msg: `Tax category "${deleting.code}" deleted` });
            setQuery({ ...query });
            setDeleting(null);
          } catch (e: any) {
            push({ kind: "error", msg: e?.message || "Delete failed" });
            setDeleting(null);
          }
        }}
        onClose={() => setDeleting(null)}
      />

      {/* Bulk delete confirm */}
      <DeleteConfirmModal
        open={bulkOpen}
        title="Delete Selected"
        subject={`${selectedIds.length} tax categor${selectedIds.length === 1 ? "y" : "ies"}`}
        onConfirm={onBulkDelete}
        onClose={() => setBulkOpen(false)}
      />
    </div>
  );
}
