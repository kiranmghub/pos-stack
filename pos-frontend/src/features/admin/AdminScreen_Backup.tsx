// src/features/admin/AdminScreen.tsx
import { useEffect, useMemo, useState } from "react";
import { listTenantUsers, upsertTenantUser, updateTenantUser, deleteTenantUser } from "./adminApi";
import type { TenantUserRow } from "./adminApi";

type Tab = "users" | "stores" | "registers" | "tax";

export default function AdminScreen() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tenant Admin</h1>
          <p className="text-sm text-slate-400">Manage users, stores, registers, and tax categories.</p>
        </div>
        <div className="flex gap-2">
          {(["users","stores","registers","tax"] as Tab[]).map(t => (
            <button key={t}
              className={`px-3 py-1.5 rounded-md border ${tab===t ? "bg-blue-600 text-white border-blue-500" : "bg-slate-900 border-slate-700 text-slate-200"}`}
              onClick={() => setTab(t)}
            >{t.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {tab==="users" && <UsersPanel/>}
      {tab==="stores" && <Placeholder title="Stores" />}
      {tab==="registers" && <Placeholder title="Registers" />}
      {tab==="tax" && <Placeholder title="Tax Categories" />}
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="text-slate-300">{title} panel coming next. We’ll mirror the Users UX.</div>
    </div>
  );
}

function UsersPanel() {
  const [rows, setRows] = useState<TenantUserRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; id?: number; username?: string }>({ open: false });


  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TenantUserRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listTenantUsers(q);
      setRows(data);
    } catch (e: any) {
      setMsg(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [q]);

  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = (row: TenantUserRow) => { setEditing(row); setOpen(true); };

  const filtered = useMemo(() => rows, [rows]); // server-filtered by ?q

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <input
            className="bg-slate-950 border border-slate-700 rounded px-3 py-2 w-full md:w-72"
            placeholder="Search users…"
            value={q}
            onChange={e=>setQ(e.target.value)}
          />
          <button className="px-3 py-2 bg-slate-800 rounded border border-slate-700 text-slate-200" onClick={load}>Refresh</button>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={onCreate}
          >+ New User</button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="hidden md:grid grid-cols-12 px-3 py-2 text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
          <div className="col-span-3">Username / Name</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Active</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {loading ? (
          <div className="px-3 py-6 text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-slate-400">No users found.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map(r => (
              <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 px-3 py-3 items-center">
                <div className="md:col-span-3 min-w-0">
                  <div className="font-medium truncate">{r.user.username} <span className="text-xs text-slate-400">({r.role})</span></div>
                  <div className="text-xs text-slate-400 truncate">{r.user.first_name} {r.user.last_name}</div>
                </div>
                <div className="md:col-span-3 text-sm text-slate-300 truncate">{r.user.email || <span className="text-slate-500">—</span>}</div>
                <div className="md:col-span-2">
                  <span className="px-2 py-1 rounded-md text-xs border border-slate-700 bg-slate-800">{r.role}</span>
                </div>
                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={!!r.user.is_active}
                      onChange={async (e) => {
                        const next = e.currentTarget.checked;
                        try {
                          await updateTenantUser(r.id, { is_active: next });
                          setRows(rows.map(x => x.id === r.id ? ({ ...x, user: { ...x.user, is_active: next } }) : x));
                        } catch (err:any) {
                          setMsg(err.message || "Failed to update");
                        }
                      }}
                    />
                    <span className={r.user.is_active ? "text-emerald-400" : "text-slate-400"}>
                      {r.user.is_active ? "Active" : "Inactive"}
                    </span>
                  </label>
                </div>
                <div className="md:col-span-2 md:text-right flex md:justify-end gap-2">
                  <button className="px-2 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm"
                    onClick={() => onEdit(r)}>Edit</button>
                  <button className="px-2 py-1.5 rounded-md bg-red-600 text-white text-sm"
                    onClick={async () => {
                      setConfirm({ open: true, id: r.id, username: r.user.username });
                    }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Toast-ish message */}
      {msg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg shadow"
             onClick={()=>setMsg(null)}>
          {msg}
        </div>
      )}

            <ConfirmDialog
              open={confirm.open}
              title="Delete user"
              message={`Delete user "${confirm.username}"? This cannot be undone.`}
              confirmLabel="Delete"
              onClose={() => setConfirm({ open: false })}
              onConfirm={async () => {
                if (!confirm.id) return;
                try {
                  await deleteTenantUser(confirm.id);
                  setConfirm({ open: false });
                  // Optimistic update: remove from list
                  setRows((rows) => rows.filter((x) => x.id !== confirm.id));
                  setMsg(`Deleted "${confirm.username}"`);
                } catch (err: any) {
                  setMsg(err.message || "Delete failed");
                  setConfirm({ open: false });
                }
              }}
            />

      {/* Modal */}
      {open && (
        <UserModal
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={async (saved) => {
            setOpen(false);
            setEditing(null);
            await load();
            setMsg(`${saved.user.username} saved`);
          }}
        />
      )}
    </div>
  );
}

function UserModal({ initial, onSaved, onClose }: {
  initial: TenantUserRow | null;
  onSaved: (saved: TenantUserRow) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    username: initial?.user.username || "",
    email: initial?.user.email || "",
    first_name: initial?.user.first_name || "",
    last_name: initial?.user.last_name || "",
    password: "",
    role: initial?.role || "admin",
    is_active: initial?.user.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const mode = initial ? "Edit User" : "New User";

  const canSave = form.username.trim().length > 0 && (!initial ? form.password.length >= 4 : true);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let out: TenantUserRow;
      if (initial) {
        out = await updateTenantUser(initial.id, {
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          is_active: form.is_active,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        out = await upsertTenantUser({
          username: form.username,
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          password: form.password,
          role: form.role,
          is_active: form.is_active,
        });
      }
      onSaved(out);
    } catch (e:any) {
      alert(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:w-[560px] max-w-[96vw] bg-slate-950 border border-slate-800 rounded-2xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{mode}</h2>
          <button className="text-slate-400 hover:text-slate-200" onClick={onClose}>✕</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!initial && (
            <input
              placeholder="Username"
              value={form.username}
              onChange={e=>setForm({ ...form, username: e.target.value })}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
            />
          )}
          <input
            placeholder="Email"
            value={form.email}
            onChange={e=>setForm({ ...form, email: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
          />
          <input
            placeholder="First name"
            value={form.first_name}
            onChange={e=>setForm({ ...form, first_name: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
          />
          <input
            placeholder="Last name"
            value={form.last_name}
            onChange={e=>setForm({ ...form, last_name: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
          />
          <select
            value={form.role}
            onChange={e=>setForm({ ...form, role: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="accountant">Accountant</option>
            <option value="auditor">Auditor</option>
          </select>
          <div className="flex items-center gap-2 border border-slate-700 rounded px-3 py-2">
            <input
              id="active"
              type="checkbox"
              className="h-4 w-4"
              checked={form.is_active}
              onChange={e=>setForm({ ...form, is_active: e.currentTarget.checked })}
            />
            <label htmlFor="active" className="text-sm">Active</label>
          </div>
          <input
            placeholder={initial ? "New password (optional)" : "Password (min 4 chars)"}
            type="password"
            value={form.password}
            onChange={e=>setForm({ ...form, password: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 md:col-span-2"
          />
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200" onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={!canSave || saving}
            className={`px-3 py-2 rounded text-white ${canSave ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700"}`}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}


function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:w-[520px] max-w-[96vw] bg-slate-950 border border-slate-800 rounded-2xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="text-slate-400 hover:text-slate-200" onClick={onClose}>✕</button>
        </div>
        <p className="text-slate-300 mb-4">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200" onClick={onClose}>
            Cancel
          </button>
          <button className="px-3 py-2 rounded text-white bg-red-600 hover:bg-red-500" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

