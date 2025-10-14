// pos-frontend/src/features/admin/AdminPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { AdminAPI, Query, AdminUser, Store, Register, TaxCategory, TaxRule, DiscountRule, Coupon } from "./adminApi";
import { DataTable } from "./components/DataTable";
import { Users, Store as StoreIcon, Settings2, Percent, BadgePercent, TicketPercent } from "lucide-react";
import UserModal from "./components/UserModal";
import DeleteConfirmModal from "./components/DeleteConfirmModal";
import { Trash2 } from "lucide-react";
import { useToast } from "./components/Toast";
import Checkbox from "./components/ui/Checkbox";




type TabKey = "users"|"stores"|"registers"|"taxcats"|"taxrules"|"discrules"|"coupons";

const tabs: {key:TabKey; label:string; icon:React.ReactNode}[] = [
  { key:"users",      label:"Users",            icon:<Users className="h-4 w-4"/> },
  { key:"stores",     label:"Stores",           icon:<StoreIcon className="h-4 w-4"/> },
  { key:"registers",  label:"Registers",        icon:<Settings2 className="h-4 w-4"/> },
  { key:"taxcats",    label:"Tax Categories",   icon:<Percent className="h-4 w-4"/> },
  { key:"taxrules",   label:"Tax Rules",        icon:<Percent className="h-4 w-4"/> },
  { key:"discrules",  label:"Discount Rules",   icon:<BadgePercent className="h-4 w-4"/> },
  { key:"coupons",    label:"Coupons",          icon:<TicketPercent className="h-4 w-4"/> },
];

export default function AdminPage() {
  const [active, setActive] = useState<TabKey>("users");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState<number|undefined>(undefined);

  const [query, setQuery] = useState<Query>({ search:"", ordering:"" });

  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState<any|null>(null);
  const [deleteUser, setDeleteUser] = useState<any | null>(null);
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const { push } = useToast();



  // Fetch per tab
  useEffect(()=>{
    let mounted = true;
    (async ()=>{
      // NEW: clear stale rows as soon as tab/query changes
      setData([]); setTotal(undefined);
      setLoading(true);
      try {
        let page:any;
        const q = { search: query.search || undefined, ordering: query.ordering || undefined };
        if (active==="users") page = await AdminAPI.users(q);
        else if (active==="stores") page = await AdminAPI.stores(q);
        else if (active==="registers") page = await AdminAPI.registers(q);
        else if (active==="taxcats") page = await AdminAPI.taxCats(q);
        else if (active==="taxrules") page = await AdminAPI.taxRules(q);
        else if (active==="discrules") page = await AdminAPI.discRules(q);
        else page = await AdminAPI.coupons(q);

        const rows = Array.isArray(page) ? page : (page.results ?? []);
        const cnt  = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e) {
        console.error(e);
        push({ kind: "error", msg: "Failed to load data" });
        if (mounted) { setData([]); setTotal(undefined); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return ()=>{ mounted = false; };
  }, [active, query]);

  // Handlers
  const onToggleActive = async (u: AdminUser) => {
    setUpdatingIds(prev => [...prev, u.id]);
    try {
      await AdminAPI.updateUser(u.id, { is_active: !u.is_active });
      // optimistic local update so the row reflects immediately
      setData(prev => prev.map(r => (r.id === u.id ? { ...r, is_active: !u.is_active } : r)));
      push({ kind: u.is_active ? "warn" : "success", msg: u.is_active ? `User "${u.user?.username}" deactivated` : `User "${u.user?.username}" activated` });
    } catch (e: any) {
      console.error(e);
      push({ kind: "error", msg: e?.message || "Failed to update user status" });
    } finally {
      setUpdatingIds(prev => prev.filter(id => id !== u.id));
    }
  };

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const selectAll = (rows: AdminUser[]) =>
    setSelectedIds(
      selectedIds.length === rows.length ? [] : rows.map((r) => r.id)
    );

  const clearSelection = () => setSelectedIds([]);

  const bulkSetActive = async (value: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      for (const id of selectedIds) {
        await AdminAPI.updateUser(id, { is_active: value });
      }
      setData((prev) =>
        prev.map((r) =>
          selectedIds.includes(r.id) ? { ...r, is_active: value } : r
        )
      );
      push({
        kind: value ? "success" : "warn",
        msg: value
          ? `Activated ${selectedIds.length} user(s)`
          : `Deactivated ${selectedIds.length} user(s)`,
      });
      clearSelection();
    } catch (e: any) {
      console.error(e);
      push({ kind: "error", msg: e?.message || "Bulk update failed" });
    } finally {
      setBulkLoading(false);
    }
  };

  
  const allCount = data.length;
  const selCount = selectedIds.length;
  const allChecked = allCount > 0 && selCount === allCount;
  const partiallyChecked = selCount > 0 && selCount < allCount;

  // Column definitions per tab
  const cols = useMemo(()=>{
    switch (active) {
      case "users": {
        const renderName = (u: AdminUser) => {
        const uname = u?.user?.username ?? "—";
        const email = u?.user?.email ?? "—";
        return (
            <div className="leading-tight">
            <div className="font-medium">{uname}</div>
            <div className="text-xs text-slate-400">{email}</div>
            </div>
        );
        };

        return [
          { key: "select",
            header: (
              <Checkbox
                checked={allChecked}
                indeterminate={partiallyChecked}
                onChange={() => selectAll(data)}
                aria-label="Select all rows"
                title="Select all"
              />
            ),
            render: (r: AdminUser) => (
              <Checkbox
                checked={selectedIds.includes(r.id)}
                onChange={() => toggleSelect(r.id)}
                aria-label="Select row"
              />
            ),
            width: "2rem",
          },
          { key:"user", header:"User", render:renderName },
          { key:"role", header:"Role" },
          { key:"is_active", header:"Active", render:(r:AdminUser)=>(
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!r.is_active}
                disabled={updatingIds.includes(r.id)}
                onChange={() => onToggleActive(r)}
                className="h-4 w-4 accent-emerald-500"
                title={r.is_active ? "Deactivate user" : "Activate user"}
              />
              <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
                {r.is_active ? "Active" : "Inactive"}
              </span>
            </label>
          )},
          { key: "stores", header: "Stores", render: (r: AdminUser) => (
            <div className="flex flex-wrap gap-1 max-w-[8rem]">
              {(r.store_objects || []).slice(0, 3).map((s:any) => (
                <span
                  key={s.id}
                  className="px-2 py-0.5 rounded-full text-[11px] bg-slate-700/60 text-slate-200 truncate"
                  title={s.name}
                >
                  {s.name}
                </span>
              ))}
              {(r.store_objects || []).length > 3 && (
                <span className="text-xs text-slate-400">+{(r.store_objects || []).length - 3}</span>
              )}
            </div>
          ), align:"left" as const },

          { key: "actions", header: "", render: (r: AdminUser) => (
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => { setEditUser(r); setShowUserModal(true); }}
                className="text-xs text-blue-400 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteUser(r)}
                className="text-xs text-red-400 hover:text-red-300"
                title="Delete user"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )},
        ];
      }
      case "stores": {
        return [
          { key:"code", header:"Code" },
          { key:"name", header:"Name" },
          { key:"is_active", header:"Active", render:(r:Store)=>(
            <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active?"bg-emerald-600/30 text-emerald-200":"bg-slate-600/30 text-slate-300"}`}>{r.is_active?"Yes":"No"}</span>
          )},
        ];
      }
      case "registers": {
        return [
          { key:"code", header:"Code" },
          { key:"store", header:"Store ID", align:"right" as const },
          { key:"is_active", header:"Active", render:(r:Register)=>(
            <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active?"bg-emerald-600/30 text-emerald-200":"bg-slate-600/30 text-slate-300"}`}>{r.is_active?"Yes":"No"}</span>
          )},
        ];
      }
      case "taxcats": {
        return [
          { key:"code", header:"Code" },
          { key:"name", header:"Name" },
          { key:"rate", header:"Rate", align:"right" as const, render:(r:TaxCategory)=>`${Number(r.rate).toFixed(4)}` },
        ];
      }
      case "taxrules": {
        return [
          { key:"code", header:"Code" },
          { key:"name", header:"Name" },
          { key:"basis", header:"Basis" },
          { key:"apply_scope", header:"Scope" },
          { key:"rate", header:"Rate", align:"right" as const, render:(r:TaxRule)=> r.rate ?? "-" },
          { key:"amount", header:"Amount", align:"right" as const, render:(r:TaxRule)=> r.amount ?? "-" },
          { key:"priority", header:"Prio", align:"right" as const },
          { key:"is_active", header:"Active", render:(r:TaxRule)=>(
            <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active?"bg-emerald-600/30 text-emerald-200":"bg-slate-600/30 text-slate-300"}`}>{r.is_active?"Yes":"No"}</span>
          )},
        ];
      }
      case "discrules": {
        return [
          { key:"code", header:"Code" },
          { key:"name", header:"Name" },
          { key:"target", header:"Target" },
          { key:"basis", header:"Basis" },
          { key:"apply_scope", header:"Scope" },
          { key:"rate", header:"Rate", align:"right" as const, render:(r:DiscountRule)=> r.rate ?? "-" },
          { key:"amount", header:"Amount", align:"right" as const, render:(r:DiscountRule)=> r.amount ?? "-" },
          { key:"priority", header:"Prio", align:"right" as const },
          { key:"is_active", header:"Active", render:(r:DiscountRule)=>(
            <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active?"bg-emerald-600/30 text-emerald-200":"bg-slate-600/30 text-slate-300"}`}>{r.is_active?"Yes":"No"}</span>
          )},
        ];
      }
      case "coupons": {
        return [
          { key:"code", header:"Code" },
          { key:"name", header:"Name" },
          { key:"rule", header:"Rule", render:(c:Coupon)=>`${c.rule?.name} (${c.rule?.code})` },
          { key:"remaining_uses", header:"Left", align:"right" as const, render:(c:Coupon)=> c.remaining_uses ?? "∞" },
          { key:"is_active", header:"Active", render:(c:Coupon)=>(
            <span className={`px-2 py-0.5 rounded-full text-xs ${c.is_active?"bg-emerald-600/30 text-emerald-200":"bg-slate-600/30 text-slate-300"}`}>{c.is_active?"Yes":"No"}</span>
          )},
        ];
      }
      default: return [];
    }
  }, [active]);


  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={()=>setActive(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm
              ${active===t.key ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/50"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

        {/* Filters + New button for Users tab */}
        {active === "users" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: filters */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {/* Role filter */}
              <select
                value={query.role || ""}
                onChange={(e) => setQuery((p) => ({ ...p, role: e.target.value || undefined }))}
                className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
              >
                <option value="">All Roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="accountant">Accountant</option>
                <option value="auditor">Auditor</option>
              </select>

              {/* Active filter */}
              <select
                value={
                  query.is_active === true
                    ? "true"
                    : query.is_active === false
                    ? "false"
                    : ""
                }
                onChange={(e) =>
                  setQuery((p) => ({
                    ...p,
                    is_active:
                      e.target.value === ""
                        ? undefined
                        : e.target.value === "true",
                  }))
                }
                className="rounded-md bg-slate-800 px-2 py-1 text-sm outline-none"
              >
                <option value="">All Users</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>

              {/* Search */}
              <input
                value={query.search || ""}
                onChange={(e) =>
                  setQuery((p) => ({ ...p, search: e.target.value || undefined }))
                }
                placeholder="Search username or email…"
                className="rounded-md bg-slate-800 px-3 py-1.5 text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Right: add new user */}
            <button
              onClick={() => {
                setEditUser(null);
                setShowUserModal(true);
              }}
              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >
              + New User
            </button>
          </div>
        )}

        {/* Bulk toolbar */}
        {active === "users" && selectedIds.length > 0 && (
          <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-md px-3 py-2 text-sm">
            <span className="text-slate-200">
              {selectedIds.length} selected
            </span>

            {(() => {
              const selectedRows = data.filter((u: AdminUser) => selectedIds.includes(u.id));
              const allActive = selectedRows.every((u) => u.is_active);
              const allInactive = selectedRows.every((u) => !u.is_active);

              // Decide which action(s) to show
              if (allActive) {
                return (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={bulkLoading}
                      onClick={() => bulkSetActive(false)}
                      className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      Deactivate Selected
                    </button>
                    <button
                      onClick={clearSelection}
                      className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100"
                    >
                      Clear
                    </button>
                  </div>
                );
              }
              if (allInactive) {
                return (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={bulkLoading}
                      onClick={() => bulkSetActive(true)}
                      className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      Activate Selected
                    </button>
                    <button
                      onClick={clearSelection}
                      className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100"
                    >
                      Clear
                    </button>
                  </div>
                );
              }

              // Mixed (some active, some inactive)
              return (
                <div className="flex items-center gap-2">
                  <button
                    disabled={bulkLoading}
                    onClick={() => bulkSetActive(true)}
                    className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Activate Inactive
                  </button>
                  <button
                    disabled={bulkLoading}
                    onClick={() => bulkSetActive(false)}
                    className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    Deactivate Active
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100"
                  >
                    Clear
                  </button>
                </div>
              );
            })()}
          </div>
        )}



      {/* Table */}
      <DataTable
        title={tabs.find(t=>t.key===active)?.label || ""}
        rows={data.map((r) => ({ ...r, selected: selectedIds.includes(r.id) }))}
        cols={cols as any}
        loading={loading}
        total={total}
        query={query}
        onQueryChange={(q)=> setQuery(prev=> ({ ...prev, ...q }))}
      />

      {/* Modals */}
      <UserModal
        open={showUserModal}
        editUser={editUser}
        onClose={() => setShowUserModal(false)}
        onSave={() => {
            setShowUserModal(false);
            setQuery({ ...query }); // triggers refresh
        }}
      />
      <DeleteConfirmModal
        open={!!deleteUser}
        title="Delete User"
        subject={deleteUser?.user?.username}
        onConfirm={async () => {
          if (deleteUser) {
            await AdminAPI.deleteUser(deleteUser.id);
            push({
              kind: "warn",
              msg: `User "${deleteUser.user?.username}" deleted`,
            });
            setQuery({ ...query }); // refresh table
          }
        }}
        onClose={() => setDeleteUser(null)}
      />
    </div>    
  );
}
