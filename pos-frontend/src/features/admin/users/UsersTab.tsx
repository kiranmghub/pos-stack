// pos-frontend/src/features/admin/users/UsersTab.tsx
import React, { useEffect, useMemo, useState } from "react";
//import { AdminAPI, Query, AdminUser } from "../adminApi";
import type { AdminUser, Query } from "../adminApi";
import { UsersAPI } from "../api";
import { DataTable } from "../components/DataTable";
import DeleteConfirmModal from "../components/DeleteConfirmModal";
import { Checkbox } from "@/ui/checkbox";
import { useNotify } from "@/lib/notify";
import { Trash2 } from "lucide-react";
import UserModal from "./UserModal";
import { getUser } from "@/lib/auth";

export default function UsersTab() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [query, setQuery] = useState<Query>({ search: "", ordering: "" });

  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);

  const { success, error, info, warn } = useNotify();

  // derive my user id from lib/auth getUser()
  const meId = React.useMemo(() => {
    const user = getUser();
    return (user?.id ?? user?.user?.id) ?? null;
  }, []);

  // Fetch Users
  useEffect(() => {
    let mounted = true;
    (async () => {
      setData([]); setTotal(undefined);
      setLoading(true);
      try {
        const q = { search: query.search || undefined, ordering: query.ordering || undefined, role: query.role, is_active: query.is_active };
        const page = await UsersAPI.list(q);
        const rows = Array.isArray(page) ? page : (page.results ?? []);
        const cnt = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e) {
        console.error(e);
        error("Failed to load data");
        if (mounted) { setData([]); setTotal(undefined); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
    // ✅ only re-fetch when query changes
  }, [query]);

  const onToggleActive = async (u: AdminUser) => {
    setUpdatingIds(prev => [...prev, u.id]);
    try {
      await UsersAPI.update(u.id, { is_active: !u.is_active });
      setData(prev => prev.map(r => (r.id === u.id ? { ...r, is_active: !u.is_active } : r)));
      u.is_active
        ? warn(`User "${u.user?.username}" deactivated`)
        : success(`User "${u.user?.username}" activated`);

    } catch (e: any) {
      console.error(e);
      error(e?.message || "Failed to update user status");
    } finally {
      setUpdatingIds(prev => prev.filter(id => id !== u.id));
    }
  };

  // const toggleSelect = (id: number) => {
  //   if (meId && id === meId) {
  //     info("You cannot select yourself for bulk changes.");
  //     return;
  //   }
  //   setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  // };

  const toggleSelect = (id: number) => {
    const user = data.find(u => u.id === id);
    if (meId && user?.user?.id === meId) {
      info("You cannot select yourself for bulk changes.");
      return;
    }
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = (rows: AdminUser[]) => {
    // const allowed = meId ? rows.filter(r => r.id !== meId) : rows;
    const allowed = meId ? rows.filter(r => r.user?.id !== meId) : rows;
    setSelectedIds(prev => prev.length === allowed.length ? [] : allowed.map(r => r.id));
  };

  const clearSelection = () => setSelectedIds([]);

  const bulkSetActive = async (value: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      let okIds: number[] = [];
      let fails: { id: number; msg: string }[] = [];
      // const idsToProcess = meId ? selectedIds.filter(id => id !== meId) : selectedIds;
      const idsToProcess = meId 
        ? selectedIds.filter(id => {
            const user = data.find(u => u.id === id);
            return user?.user?.id !== meId;
          }) 
        : selectedIds;

      for (const id of idsToProcess) {
        try {
          await UsersAPI.update(id, { is_active: value });
          okIds.push(id);
        } catch (e: any) {
          fails.push({ id, msg: e?.message || "Failed" });
        }
      }

      if (okIds.length > 0) {
        setData(prev => prev.map(r => (okIds.includes(r.id) ? { ...r, is_active: value } : r)));
      }

      if (fails.length === 0) {
        value
          ? success(`Activated ${okIds.length} user(s)`)
          : warn(`Deactivated ${okIds.length} user(s)`);
      } else if (okIds.length > 0) {
        info(`Updated ${okIds.length} user(s). Skipped ${fails.length} — ${fails[0].msg}`);
      } else {
        error(`No users updated. ${fails[0].msg}`);
      }

      setSelectedIds(fails.map(f => f.id));
    } finally {
      setBulkLoading(false);
    }
  };

  const allCount = data.length;
  const selCount = selectedIds.length;
  const allChecked = allCount > 0 && selCount === allCount;
  const partiallyChecked = selCount > 0 && selCount < allCount;

  // Columns (identical to your AdminPage users case)
  const cols = useMemo(() => {
    const renderName = (u: AdminUser) => {
      const uname = u?.user?.username ?? "—";
      const email = u?.user?.email ?? "—";
      return (
        <div className="leading-tight">
          <div className="font-medium">{uname}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </div>
      );
    };

    return [
      { 
        key: "__expander__",
        header: "",
        width: "2rem",
        render: (r: AdminUser) => {
          const open = expandedIds.includes(r.id);
          return (
            <button
              className="text-muted-foreground hover:text-white"
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
            onCheckedChange={() => selectAll(data)}
            aria-label="Select all rows"
            title="Select all"
          />
        ),
        render: (r: AdminUser) => (
          <Checkbox
            checked={selectedIds.includes(r.id)}
            onCheckedChange={() => toggleSelect(r.id)}
            aria-label="Select row"
          />
        ),
        width: "2rem",
      },
      { key: "user", header: "User", render: renderName },
      { key: "role", header: "Role" },
      {
        key: "is_active",
        header: "Active",
        render: (r: AdminUser) => (
          <label className="inline-flex items-center gap-2">
            <Checkbox
              checked={!!r.is_active}
              // disabled={updatingIds.includes(r.id) || (meId && r.id === meId)}
              disabled={updatingIds.includes(r.id) || (meId && r.user?.id === meId)}
              onCheckedChange={() => onToggleActive(r)}
              title={
                meId && r.id === meId
                  ? "You cannot deactivate your own account."
                  : r.is_active ? "Deactivate user" : "Activate user"
              }
            />
            <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-badge-success-bg text-badge-success-text" : "bg-muted/30 text-muted-foreground"}`}>
              {r.is_active ? "Active" : "Inactive"}
            </span>
          </label>
        ),
      },
      {
        key: "stores",
        header: "Stores",
        render: (r: AdminUser) => {
          const stores = r.store_objects || [];
          const shown = stores.slice(0, 2);       // show first 2; change to 3 if you prefer
          const more = stores.length - shown.length;

          return (
            <div
              className="min-w-0 flex items-center gap-1 whitespace-nowrap max-w-[18rem] overflow-hidden"
              title={stores.map((s: any) => s.name).join(", ")}
            >
              {shown.map((s: any) => (
                <span
                  key={s.id}
                  className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-muted/60 text-muted-foreground max-w-[9rem] truncate"
                >
                  {s.name}
                </span>
              ))}
              {more > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">+{more}</span>
              )}
            </div>
          );
        },
        align: "left" as const,
      },


      {
        key: "actions",
        header: "",
        render: (r: AdminUser) => (
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={() => { setEditUser(r); setShowUserModal(true); }}
              className="text-xs text-info hover:underline"
            >
              Edit
            </button>
            <button
              onClick={() => setDeleteUser(r)}
              className="text-xs text-error hover:text-error/80"
              title="Delete user"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ];
  }, [data, selectedIds, updatingIds, allChecked, partiallyChecked, meId]);

    
  const renderRowAfter = React.useCallback((r: AdminUser) => {
    if (!expandedIds.includes(r.id)) return null;
    const stores = (r.store_objects || []) as Array<{ id:number; name:string; code?:string }>;
    return (
      <div className="bg-muted/60 rounded-md border border-border p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">User</div>
            <div className="text-muted-foreground break-words">
              {r.user?.username ?? "—"}{r.user?.email ? ` — ${r.user.email}` : ""}
            </div>
            <div className="text-xs text-muted-foreground mt-2">Role</div>
            <div className="text-muted-foreground">{r.role || "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Active</div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-badge-success-bg text-badge-success-text" : "bg-badge-warning-bg text-badge-warning-text"}`}>
              {r.is_active ? "Yes" : "No"}
            </span>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Stores</div>
            {stores.length ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {stores.slice(0, 20).map(s => (
                  <span key={s.id} className="px-2 py-0.5 rounded-full text-[11px] bg-muted/60 text-muted-foreground">
                    {s.name}{s.code ? ` (${s.code})` : ""}
                  </span>
                ))}
                {stores.length > 20 && (
                  <span className="text-xs text-muted-foreground">+{stores.length - 20} more</span>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No stores linked.</div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground" />
          <div>
            <button className="text-xs text-info hover:underline"
                    onClick={() => { setEditUser(r); setShowUserModal(true); }}>
              Edit
            </button>
          </div>
        </div>
      </div>
    );
  }, [expandedIds, setEditUser, setShowUserModal]);


  return (
    <div className="space-y-4">
      {/* Filters + New button */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: filters */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {/* Role filter */}
          <select
            value={query.role || ""}
            onChange={(e) => setQuery((p) => ({ ...p, role: e.target.value || undefined }))}
            className="rounded-md bg-muted px-2 py-1 text-sm outline-none"
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
              query.is_active === true ? "true"
                : query.is_active === false ? "false"
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
            className="rounded-md bg-muted px-2 py-1 text-sm outline-none"
          >
            <option value="">All Users</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          {/* Search */}
          <input
            value={query.search || ""}
            onChange={(e) => setQuery((p) => ({ ...p, search: e.target.value || undefined }))}
            placeholder="Search username or email…"
            className="rounded-md bg-muted px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Right: add new user */}
        <button
          onClick={() => { setEditUser(null); setShowUserModal(true); }}
          className="px-3 py-1.5 rounded-md bg-success hover:bg-success/90 text-success-foreground text-sm"
        >
          + New User
        </button>
      </div>

      {/* Bulk toolbar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-muted/60 border border-border rounded-md px-3 py-2 text-sm">
          <span className="text-muted-foreground">{selectedIds.length} selected</span>
          {(() => {
            const selectedRows = data.filter((u: AdminUser) => selectedIds.includes(u.id));
            const allActive = selectedRows.every((u) => u.is_active);
            const allInactive = selectedRows.every((u) => !u.is_active);

            if (allActive) {
              return (
                <div className="flex items-center gap-2">
                  <button
                    disabled={bulkLoading}
                    onClick={() => bulkSetActive(false)}
                    className="px-2 py-1 rounded-md bg-warning hover:bg-warning/90 text-warning-foreground"
                  >
                    Deactivate Selected
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-2 py-1 rounded-md bg-muted hover:bg-muted text-foreground"
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
                    className="px-2 py-1 rounded-md bg-success hover:bg-success/90 text-success-foreground"
                  >
                    Activate Selected
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-2 py-1 rounded-md bg-muted hover:bg-muted text-foreground"
                  >
                    Clear
                  </button>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <button
                  disabled={bulkLoading}
                  onClick={() => bulkSetActive(true)}
                  className="px-2 py-1 rounded-md bg-success hover:bg-success/90 text-success-foreground"
                >
                  Activate Inactive
                </button>
                <button
                  disabled={bulkLoading}
                  onClick={() => bulkSetActive(false)}
                  className="px-2 py-1 rounded-md bg-warning hover:bg-warning/90 text-warning-foreground"
                >
                  Deactivate Active
                </button>
                <button
                  onClick={clearSelection}
                  className="px-2 py-1 rounded-md bg-muted hover:bg-muted text-foreground"
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
        title="Users"
        rows={data.map((r) => ({ ...r, selected: selectedIds.includes(r.id) }))}
        cols={cols as any}
        loading={loading}
        total={total}
        query={query}
        onQueryChange={(q) => setQuery(prev => ({ ...prev, ...q }))}
        renderRowAfter={renderRowAfter}
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
          if (!deleteUser) return;
          await UsersAPI.remove(deleteUser.id);
          warn(`User "${deleteUser.user?.username}" deleted`);
          setQuery({ ...query }); // refresh table
        }}
        onClose={() => setDeleteUser(null)}
      />
    </div>
  );
}

