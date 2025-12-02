// pos-frontend/src/features/admin/coupons/CouponsTab.tsx
import React from "react";
import type { Query } from "../adminApi";
import { CouponsAPI, type Coupon } from "../api/coupons";
import { DataTable } from "../components/DataTable";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import { Checkbox } from "@/ui/checkbox";
import { useNotify } from "@/lib/notify";
import CouponModal from "./CouponModal";

export default function CouponsTab() {
  const { success, error, info, warn } = useNotify();
  const [query, setQuery] = React.useState<Query>({ search: "", ordering: "code" });
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<Coupon[]>([]);
  const [total, setTotal] = React.useState<number | undefined>(undefined);

  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<Coupon | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Coupon | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<number[]>([]);
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const p = {
          search: query.search || undefined,
          ordering: query.ordering || undefined,
          is_active: query.is_active,
          rule: (query as any).rule,
        };
        const page = await CouponsAPI.list(p);
        const rows = Array.isArray(page) ? page : page.results ?? [];
        const cnt  = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e:any) {
        // push({ kind: "error", msg: e?.message || "Failed to load coupons" });
        error(e?.message || "Failed to load coupons");
        if (mounted) { setData([]); setTotal(undefined); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [query, refresh]);

  const allChecked = data.length > 0 && selectedIds.length === data.length;
  const partiallyChecked = selectedIds.length > 0 && !allChecked;
  const toggleAll = () => setSelectedIds(prev => (prev.length === data.length ? [] : data.map(r => r.id)));
  const toggleRow = (id: number) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const toggleExpand = (r: Coupon) => setExpandedIds(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]);

  const bulkSetActive = async (is_active: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
        const ids = [...selectedIds];
        const ok: number[] = [];
        const fail: number[] = [];
        for (const id of ids) {
        try {
            await CouponsAPI.update(id, { is_active });
            ok.push(id);
        } catch {
            fail.push(id);
        }
        }
        if (ok.length) 
          // push({ kind: is_active ? "success" : "warn", msg: `${is_active ? "Activated" : "Deactivated"} ${ok.length} coupon(s)` });
          is_active ? success(`Activated ${ok.length} coupon(s)`) : warn(`Deactivated ${ok.length} coupon(s)`);
        if (fail.length) 
          // push({ kind: "error", msg: `Failed to update ${fail.length} coupon(s)` });
          error(`Failed to update ${fail.length} coupon(s)`);
        setSelectedIds(fail);      // keep failures selected
        // setQuery({ ...query });    // refresh list
        setRefresh(x => x + 1);
    } finally {
        setBulkLoading(false);
    }
  };


  const cols = React.useMemo(() => ([
    {
      key: "__expander__", header: "", width: "2rem",
      render: (r: Coupon) => {
        const open = expandedIds.includes(r.id);
        return (
          <button className="text-muted-foreground hover:text-white" title={open ? "Collapse" : "Expand"} onClick={() => toggleExpand(r)}>
            <svg className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        );
      }
    },
    {
      key: "select", width: "2rem",
      header: (
        <Checkbox
          checked={allChecked ? true : partiallyChecked ? "indeterminate" : false}
          onCheckedChange={toggleAll}
          aria-label="Select all"
          title="Select all"
        />
      ),
      render: (r: Coupon) => (
        <Checkbox checked={selectedIds.includes(r.id)}
          onCheckedChange={() => toggleRow(r.id)}
          aria-label="Select row" />
      ),
    },
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    {
      key: "description",
      header: "Description",
      render: (r: Coupon) => (
        <span title={r.description || ""} className="line-clamp-2 max-w-[28rem] block">
          {r.description || "—"}
        </span>
      ),
    },
    {
      key: "rule",
      header: "Rule",
      render: (r: any) => (r.rule ? `${r.rule.code}${r.rule.name ? ` — ${r.rule.name}` : ""}` : "—"),
    },
    {
        key: "used",
        header: "Used",
        align: "right" as const,
        render: (r: Coupon) => String(r.used_count || 0),
    },
    {
      key: "remaining",
      header: "Remaining",
      align: "right" as const,
      render: (r: Coupon) => {
        if (r.max_uses == null) return "∞";
        const remaining = Math.max(0, (r.max_uses || 0) - (r.used_count || 0));
        return String(remaining);
      },
    },
    {
      key: "is_active",
      header: "Active",
      render: (r: Coupon) => (
        <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-badge-success-bg text-badge-success-text" : "bg-muted/30 text-muted-foreground"}`}>
          {r.is_active ? "Yes" : "No"}
        </span>
      ),
    },
    { key: "start_at", header: "Start", render: (r: Coupon) => r.start_at ? r.start_at.replace("T"," ").slice(0,16) : "—" },
    { key: "end_at", header: "End", render: (r: Coupon) => r.end_at ? r.end_at.replace("T"," ").slice(0,16) : "—" },
    {
        key: "actions",
        header: "",
        render: (r: Coupon) => (
            <div className="flex items-center gap-2 justify-end">
            <button
                className="text-xs text-info hover:underline"
                onClick={() => { setEditing(r); setCreating(false); }}
            >
                Edit
            </button>
            <button
                className="text-xs text-error hover:text-error/80"
                onClick={() => setDeleting(r)}
            >
                Delete
            </button>
            </div>
        ),
        },

  ]), [allChecked, partiallyChecked, selectedIds, expandedIds]);

  const renderRowAfter = React.useCallback((r: any) => {
    if (!expandedIds.includes(r.id)) return null;
    const remaining = r.max_uses == null ? "∞" : Math.max(0, (r.max_uses || 0) - (r.used_count || 0));
    return (
      <div className="bg-muted/60 rounded-md border border-border p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Description</div>
            <div className="text-muted-foreground break-words">{r.description || "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Rule</div>
            <div className="text-muted-foreground">{r.rule ? `${r.rule.code}${r.rule.name ? ` — ${r.rule.name}` : ""}` : "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Active</div>
            <div className="text-muted-foreground">{r.is_active ? "Yes" : "No"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Usage</div>
            <div className="text-muted-foreground">
              Used {r.used_count || 0}
              {r.max_uses != null ? ` of ${r.max_uses}` : " of ∞"}
              {" · Remaining "}{remaining}
            </div>
            <div className="text-xs text-muted-foreground mt-2">Window</div>
            <div className="text-muted-foreground">
              {r.start_at ? r.start_at.replace("T"," ").slice(0,16) : "—"} → {r.end_at ? r.end_at.replace("T"," ").slice(0,16) : "—"}
            </div>
          </div>
        </div>
      </div>
    );
  }, [expandedIds]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            value={query.search || ""}
            onChange={(e) => setQuery((p) => ({ ...p, search: e.target.value || undefined }))}
            placeholder="Search code, name, description…"
            className="rounded-md bg-muted px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <select
            value={query.is_active === true ? "true" : query.is_active === false ? "false" : ""}
            onChange={(e) =>
              setQuery((p) => ({ ...p, is_active: e.target.value === "" ? undefined : e.target.value === "true" }))
            }
            className="rounded-md bg-muted px-2 py-1 text-sm outline-none"
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
                        className="px-2 py-1 rounded-md bg-success hover:bg-success/90 text-success-foreground">
                Activate Selected
                </button>
                <button disabled={bulkLoading} onClick={() => bulkSetActive(false)}
                        className="px-2 py-1 rounded-md bg-warning hover:bg-warning/90 text-warning-foreground">
                Deactivate Selected
                </button>
                <button onClick={() => setSelectedIds([])}
                        className="px-2 py-1 rounded-md bg-muted hover:bg-muted text-foreground">
                Clear
                </button>
            </>
            ) : (
            <button onClick={() => { setEditing(null); setCreating(true); }}
                    className="px-3 py-1.5 rounded-md bg-success hover:bg-success/90 text-success-foreground text-sm">
                + New Coupon
            </button>
            )}
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="Coupons"
        rows={data.map((r) => ({ ...r, selected: selectedIds.includes(r.id) }))}
        cols={cols as any}
        loading={loading}
        total={total}
        query={query}
        onQueryChange={(q) => setQuery((p) => ({ ...p, ...q }))}
        getRowKey={(row:any) => row.id ?? row.code}
        renderRowAfter={renderRowAfter}
      />

      {/* Modals */}
      {(creating || editing) && (
        <CouponModal
          open={creating || !!editing}
          editing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => setRefresh(x => x + 1)}
        />
      )}

      <DeleteConfirmModal
        open={!!deleting}
        subject={deleting?.code}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await CouponsAPI.remove(deleting.id);
            // push({ kind: "warn", msg: `Coupon "${deleting.code}" deleted` });
            warn(`Coupon "${deleting.code}" deleted`);
            // setQuery({ ...query });
            setRefresh(x => x + 1);
            setDeleting(null);
          } catch (e: any) {
            // push({ kind: "error", msg: e?.message || "Delete failed" });
            error(e?.message || "Delete failed");
            setDeleting(null);
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
