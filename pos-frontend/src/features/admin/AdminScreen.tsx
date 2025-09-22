// src/features/admin/AdminScreen.tsx
import { useEffect, useMemo, useState } from "react";
import {
  listTenantUsers, upsertTenantUser, updateTenantUser, deleteTenantUser,
  listStoresAdmin, createStore, updateStore, deleteStore,
  listRegistersAdmin, createRegister, updateRegister, deleteRegister,
  listTaxCategoriesAdmin, createTaxCategory, updateTaxCategory, deleteTaxCategory,
} from "./adminApi";
import type { TenantUserRow, StoreRow, RegisterRow, TaxCategoryRow } from "./adminApi";

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);


/* ---------- Shell ---------- */

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
            >{capitalize(t)}</button>
          ))}
        </div>
      </div>

      {tab==="users" && <UsersPanel/>}
      {tab==="stores" && <StoresPanel/>}
      {tab==="registers" && <RegistersPanel/>}
      {tab==="tax" && <TaxPanel/>}
    </div>
  );
}

/* ---------- Users Panel (existing, with modal + confirm) ---------- */

function UsersPanel() {
  const [rows, setRows] = useState<TenantUserRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TenantUserRow | null>(null);

  // Confirm modal state
  const [confirm, setConfirm] = useState<{ open: boolean; id?: number; username?: string }>({ open: false });

  const load = async () => {
    setLoading(true);
    try { setRows(await listTenantUsers(q)); } catch (e: any) { setMsg(e.message || "Failed to load users"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [q]);

  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = (row: TenantUserRow) => { setEditing(row); setOpen(true); };

  const filtered = useMemo(() => rows, [rows]); // server-filtered by ?q

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Toolbar
        placeholder="Search users…"
        value={q}
        onChange={setQ}
        onRefresh={load}
        ctaLabel="+ New User"
        onCta={onCreate}
      />

      {/* Table */}
      <CardTable>
        <TableHead cols={["Username / Name", "Email", "Role", "Active", ""]} />
        {loading ? (
          <TableEmpty message="Loading…" />
        ) : filtered.length === 0 ? (
          <TableEmpty message="No users found." />
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map(r => (
              <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 px-3 py-3 items-center">
                <div className="md:col-span-3 min-w-0">
                  <div className="font-medium truncate">{r.user.username} <span className="ml-1 text-xs rounded-full px-2 py-0.5 border border-slate-700 bg-slate-800">{r.role}</span></div>
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
                        } catch (err:any) { setMsg(err.message || "Failed to update"); }
                      }}
                    />
                    <span className={r.user.is_active ? "text-emerald-400" : "text-slate-400"}>
                      {r.user.is_active ? "Active" : "Inactive"}
                    </span>
                  </label>
                </div>
                <div className="md:col-span-2 md:text-right flex md:justify-end gap-2">
                  <Btn onClick={() => onEdit(r)}>Edit</Btn>
                  <BtnDanger onClick={() => setConfirm({ open: true, id: r.id, username: r.user.username })}>Delete</BtnDanger>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardTable>

      {/* Toast-ish message */}
      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}

      {/* Modals */}
      {open && (
        <UserModal
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => { setOpen(false); setEditing(null); await load(); setMsg("User saved"); }}
        />
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
            setRows(rows.filter(x => x.id !== confirm.id));
            setMsg(`Deleted "${confirm.username}"`);
          } catch (err:any) { setMsg(err.message || "Delete failed"); }
          finally { setConfirm({ open: false }); }
        }}
      />
    </div>
  );
}

/* ---------- Stores Panel ---------- */

function StoresPanel() {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoreRow | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; id?: number; label?: string }>({ open: false });

  const load = async () => {
    setLoading(true);
    try { setRows(await listStoresAdmin(q)); } catch (e:any) { setMsg(e.message || "Failed to load stores"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [q]);

  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = (row: StoreRow) => { setEditing(row); setOpen(true); };

  return (
    <div className="space-y-4">
      <Toolbar
        placeholder="Search stores…"
        value={q}
        onChange={setQ}
        onRefresh={load}
        ctaLabel="+ New Store"
        onCta={onCreate}
      />

      <CardTable>
        <TableHead cols={["Code", "Name","TimeZone",""]} />
        {loading ? (
          <TableEmpty message="Loading…" />
        ) : rows.length === 0 ? (
          <TableEmpty message="No stores found." />
        ) : (
          <div className="divide-y divide-slate-800">
            {rows.map(r => (
              <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 px-3 py-3 items-center">
                <div className="md:col-span-3">
                  <span className="text-xs rounded-full px-2 py-0.5 border border-slate-700 bg-slate-800">{r.code}</span>
                </div>
                <div className="md:col-span-3 font-medium truncate">
                  {r.name}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.street ? <span className="text-xs rounded-full px-2 py-0.5 border border-slate-700 bg-slate-800">{r.street}</span> : null}
                    {(r.city || r.state) ? (
                      <span className="text-xs rounded-full px-2 py-0.5 border border-slate-700 bg-slate-800">
                        {[r.city, r.state].filter(Boolean).join(", ")}
                      </span>
                    ) : null}
                    {r.country ? <span className="text-xs rounded-full px-2 py-0.5 border border-slate-700 bg-slate-800">{r.country}</span> : null}
                  </div>
                </div>

                  <div className="md:col-span-4 text-sm text-slate-300 truncate">
                    {r.timezone || "—"}
                  </div>

                <div className="md:col-span-2 md:text-right flex md:justify-end gap-2">
                  <Btn onClick={() => onEdit(r)}>Edit</Btn>
                  <BtnDanger onClick={() => setConfirm({ open: true, id: r.id, label: r.name })}>Delete</BtnDanger>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardTable>

      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}

      {open && (
        <StoreModal
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => { setOpen(false); setEditing(null); await load(); setMsg("Store saved"); }}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Delete store"
        message={`Delete store "${confirm.label}"? If registers exist, deletion may be blocked.`}
        confirmLabel="Delete"
        onClose={() => setConfirm({ open: false })}
        onConfirm={async () => {
          if (!confirm.id) return;
          try {
            await deleteStore(confirm.id);
            setRows(rows.filter(x => x.id !== confirm.id));
            setMsg(`Deleted "${confirm.label}"`);
          } catch (err:any) { setMsg(err.message || "Delete failed"); }
          finally { setConfirm({ open: false }); }
        }}
      />
    </div>
  );
}

/* ---------- Registers Panel ---------- */

function RegistersPanel() {
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeFilter, setStoreFilter] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RegisterRow | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; id?: number; label?: string }>({ open: false });

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([listStoresAdmin(""), listRegistersAdmin(storeFilter ? Number(storeFilter) : undefined)]);
      setStores(s);
      setRows(r);
    } catch (e:any) { setMsg(e.message || "Failed to load registers"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [storeFilter]);

  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = (row: RegisterRow) => { setEditing(row); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <select
            className="bg-slate-950 border border-slate-700 rounded px-3 py-2 w-full md:w-56"
            value={storeFilter}
            onChange={e => setStoreFilter(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
          <button className="px-3 py-2 bg-slate-800 rounded border border-slate-700 text-slate-200" onClick={load}>Refresh</button>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white" onClick={onCreate}>
            + New Register
          </button>
        </div>
      </div>

      <CardTable>
        <TableHead cols={["Code", "Name", "Store", ""]} />
        {loading ? (
          <TableEmpty message="Loading…" />
        ) : rows.length === 0 ? (
          <TableEmpty message="No registers found." />
        ) : (
          <div className="divide-y divide-slate-800">
            {rows.map(r => {
              const store = stores.find(s => s.id === r.store);
              return (
                <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 px-3 py-3 items-center">
                  <div className="md:col-span-3">
                    <span className="text-xs rounded-full px-2 py-0.5 border border-slate-700 bg-slate-800">{r.code}</span>
                  </div>
                  <div className="md:col-span-4 font-medium truncate">{r.name}</div>
                  <div className="md:col-span-3 text-sm text-slate-300 truncate">{store ? `${store.code} — ${store.name}` : "—"}</div>
                  <div className="md:col-span-2 md:text-right flex md:justify-end gap-2">
                    <Btn onClick={() => onEdit(r)}>Edit</Btn>
                    <BtnDanger onClick={() => setConfirm({ open: true, id: r.id, label: r.name })}>Delete</BtnDanger>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardTable>

      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}

      {open && (
        <RegisterModal
          initial={editing}
          stores={stores}
          onClose={() => setOpen(false)}
          onSaved={async () => { setOpen(false); setEditing(null); await load(); setMsg("Register saved"); }}
        />
      )}
      <ConfirmDialog
        open={confirm.open}
        title="Delete register"
        message={`Delete register "${confirm.label}"?`}
        confirmLabel="Delete"
        onClose={() => setConfirm({ open: false })}
        onConfirm={async () => {
          if (!confirm.id) return;
          try {
            await deleteRegister(confirm.id);
            setRows(rows.filter(x => x.id !== confirm.id));
            setMsg(`Deleted "${confirm.label}"`);
          } catch (err:any) { setMsg(err.message || "Delete failed"); }
          finally { setConfirm({ open: false }); }
        }}
      />
    </div>
  );
}

/* ---------- Tax Panel ---------- */

function TaxPanel() {
  const [rows, setRows] = useState<TaxCategoryRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxCategoryRow | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; id?: number; label?: string }>({ open: false });

  const load = async () => {
    setLoading(true);
    try { setRows(await listTaxCategoriesAdmin(q)); } catch (e:any) { setMsg(e.message || "Failed to load tax categories"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [q]);

  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = (row: TaxCategoryRow) => { setEditing(row); setOpen(true); };

  return (
    <div className="space-y-4">
      <Toolbar
        placeholder="Search tax categories…"
        value={q}
        onChange={setQ}
        onRefresh={load}
        ctaLabel="+ New Tax"
        onCta={onCreate}
      />

      <CardTable>
        <TableHead cols={["Code", "Name", "Rate", ""]} />
        {loading ? (
          <TableEmpty message="Loading…" />
        ) : rows.length === 0 ? (
          <TableEmpty message="No tax categories found." />
        ) : (
          <div className="divide-y divide-slate-800">
            {rows.map(r => (
              <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 px-3 py-3 items-center">
                <div className="md:col-span-3">
                  <span className="text-xs rounded-full px-2 py-0.5 border border-slate-700 bg-slate-800">{r.code}</span>
                </div>
                <div className="md:col-span-5 font-medium truncate">{r.name}</div>
                <div className="md:col-span-2 text-sm text-emerald-400">{Number(r.rate).toFixed(2)}%</div>
                <div className="md:col-span-2 md:text-right flex md:justify-end gap-2">
                  <Btn onClick={() => onEdit(r)}>Edit</Btn>
                  <BtnDanger onClick={() => setConfirm({ open: true, id: r.id, label: r.name })}>Delete</BtnDanger>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardTable>

      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}

      {open && (
        <TaxModal
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => { setOpen(false); setEditing(null); await load(); setMsg("Tax category saved"); }}
        />
      )}
      <ConfirmDialog
        open={confirm.open}
        title="Delete tax category"
        message={`Delete tax category "${confirm.label}"?`}
        confirmLabel="Delete"
        onClose={() => setConfirm({ open: false })}
        onConfirm={async () => {
          if (!confirm.id) return;
          try {
            await deleteTaxCategory(confirm.id);
            setRows(rows.filter(x => x.id !== confirm.id));
            setMsg(`Deleted "${confirm.label}"`);
          } catch (err:any) { setMsg(err.message || "Delete failed"); }
          finally { setConfirm({ open: false }); }
        }}
      />
    </div>
  );
}

/* ---------- Shared UI Bits (Inventory-like look) ---------- */

function Toolbar({ placeholder, value, onChange, onRefresh, ctaLabel, onCta }: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
      <div className="flex items-center gap-2">
        <input
          className="bg-slate-950 border border-slate-700 rounded px-3 py-2 w-full md:w-72"
          placeholder={placeholder}
          value={value}
          onChange={e=>onChange(e.target.value)}
        />
        <button className="px-3 py-2 bg-slate-800 rounded border border-slate-700 text-slate-200" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
          onClick={onCta}
        >{ctaLabel}</button>
      </div>
    </div>
  );
}

function CardTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">{children}</div>;
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <div className="hidden md:grid grid-cols-12 px-3 py-2 text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
      {cols.map((c, i) => (
        <div key={i} className={`col-span-${[3,3,2,2,2][i] ?? 2}`}>{c}</div>
      ))}
    </div>
  );
}



function TableEmpty({ message }: { message: string }) {
  return <div className="px-3 py-6 text-slate-400">{message}</div>;
}

function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="px-2 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm" onClick={onClick}>{children}</button>;
}
function BtnDanger({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="px-2 py-1.5 rounded-md bg-red-600 text-white text-sm" onClick={onClick}>{children}</button>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-slate-100 border border-slate-700 px-3 py-2 rounded-lg shadow"
      onClick={onClose}>
      {message}
    </div>
  );
}

function ConfirmDialog({
  open, title = "Confirm", message, confirmLabel = "Delete",
  onConfirm, onClose,
}: {
  open: boolean; title?: string; message: string; confirmLabel?: string;
  onConfirm: () => Promise<void> | void; onClose: () => void;
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
          <button className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200" onClick={onClose}>Cancel</button>
          <button className="px-3 py-2 rounded text-white bg-red-600 hover:bg-red-500" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Entity Modals ---------- */

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
          email: form.email, first_name: form.first_name, last_name: form.last_name,
          role: form.role, is_active: form.is_active, ...(form.password ? { password: form.password } : {}),
        });
      } else {
        out = await upsertTenantUser({
          username: form.username, email: form.email, first_name: form.first_name, last_name: form.last_name,
          password: form.password, role: form.role, is_active: form.is_active,
        });
      }
      onSaved(out);
    } catch (e:any) { alert(e.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={mode} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!initial && (
          <Input placeholder="Username" value={form.username} onChange={v=>setForm({ ...form, username: v })} />
        )}
        <Input placeholder="Email" value={form.email} onChange={v=>setForm({ ...form, email: v })} />
        <Input placeholder="First name" value={form.first_name} onChange={v=>setForm({ ...form, first_name: v })} />
        <Input placeholder="Last name" value={form.last_name} onChange={v=>setForm({ ...form, last_name: v })} />
        <Select value={form.role} onChange={v=>setForm({ ...form, role: v })} options={["owner","admin","manager","cashier","accountant","auditor"]} />
        <Checkbox label="Active" checked={form.is_active} onChange={v=>setForm({ ...form, is_active: v })} />
        <Input
          placeholder={initial ? "New password (optional)" : "Password (min 4 chars)"}
          type="password"
          className="md:col-span-2"
          value={form.password}
          onChange={v=>setForm({ ...form, password: v })}
        />
      </div>
      <ModalFooter onClose={onClose} canSave={canSave} saving={saving} onSave={save} />
    </ModalShell>
  );
}

function StoreModal({ initial, onSaved, onClose }: {
  initial: StoreRow | null;
  onSaved: (saved: StoreRow) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    code: initial?.code || "",
    name: initial?.name || "",
    timezone: initial?.timezone || "America/Chicago",
    street: initial?.street || "",
    city: initial?.city || "",
    state: initial?.state || "",
    postal_code: initial?.postal_code || "",
    country: initial?.country || "USA",
    is_active: initial?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const mode = initial ? "Edit Store" : "New Store";
  const canSave = form.code.trim().length > 0 && form.name.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let out: StoreRow;
      if (initial) out = await updateStore(initial.id, form);
      else out = await createStore(form);
      onSaved(out);
    } catch (e:any) { alert(e.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={mode} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="Code" value={form.code} onChange={v=>setForm({ ...form, code: v })} />
        <Input placeholder="Name" value={form.name} onChange={v=>setForm({ ...form, name: v })} />
        <Input placeholder="Timezone (e.g. America/Chicago)" value={form.timezone} onChange={v=>setForm({ ...form, timezone: v })} />
        <Checkbox label="Active" checked={form.is_active} onChange={v=>setForm({ ...form, is_active: v })} />
        <Input placeholder="Street" value={form.street} onChange={v=>setForm({ ...form, street: v })} className="md:col-span-2" />
        <Input placeholder="City" value={form.city} onChange={v=>setForm({ ...form, city: v })} />
        <Input placeholder="State / Region" value={form.state} onChange={v=>setForm({ ...form, state: v })} />
        <Input placeholder="Postal code" value={form.postal_code} onChange={v=>setForm({ ...form, postal_code: v })} />
        <Input placeholder="Country" value={form.country} onChange={v=>setForm({ ...form, country: v })} />
      </div>
      <ModalFooter onClose={onClose} canSave={canSave} saving={saving} onSave={save} />
    </ModalShell>
  );
}

function RegisterModal({ initial, stores, onSaved, onClose }: {
  initial: RegisterRow | null;
  stores: StoreRow[];
  onSaved: (saved: RegisterRow) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<{ store: number | ""; code: string; name: string }>({
    store: initial?.store ?? (stores[0]?.id ?? ""),
    code: initial?.code || "",
    name: initial?.name || "",
  });
  const [saving, setSaving] = useState(false);
  const mode = initial ? "Edit Register" : "New Register";
  const canSave = !!form.store && form.code.trim().length > 0 && form.name.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let out: RegisterRow;
      if (initial) out = await updateRegister(initial.id, { store: Number(form.store), code: form.code, name: form.name });
      else out = await createRegister({ store: Number(form.store), code: form.code, name: form.name });
      onSaved(out);
    } catch (e:any) { alert(e.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={mode} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select
          value={String(form.store || "")}
          onChange={v=>setForm({ ...form, store: v ? Number(v) as number : "" })}
          options={stores.map(s => ({ value: String(s.id), label: `${s.code} — ${s.name}` }))}
          placeholder="Select store"
        />
        <Input placeholder="Code" value={form.code} onChange={v=>setForm({ ...form, code: v })} />
        <Input placeholder="Name" value={form.name} onChange={v=>setForm({ ...form, name: v })} className="md:col-span-2" />
      </div>
      <ModalFooter onClose={onClose} canSave={canSave} saving={saving} onSave={save} />
    </ModalShell>
  );
}

function TaxModal({ initial, onSaved, onClose }: {
  initial: TaxCategoryRow | null;
  onSaved: (saved: TaxCategoryRow) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ code: initial?.code || "", name: initial?.name || "", rate: String(initial?.rate ?? "") });
  const [saving, setSaving] = useState(false);
  const mode = initial ? "Edit Tax Category" : "New Tax Category";
  const canSave = form.code.trim().length > 0 && form.name.trim().length > 0 && form.rate.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let out: TaxCategoryRow;
      const payload = { code: form.code, name: form.name, rate: form.rate };
      if (initial) out = await updateTaxCategory(initial.id, payload);
      else out = await createTaxCategory(payload);
      onSaved(out);
    } catch (e:any) { alert(e.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={mode} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="Code" value={form.code} onChange={v=>setForm({ ...form, code: v })} />
        <Input placeholder="Name" value={form.name} onChange={v=>setForm({ ...form, name: v })} />
        <Input placeholder="Rate (e.g. 8.25)" value={form.rate} onChange={v=>setForm({ ...form, rate: v })} />
      </div>
      <ModalFooter onClose={onClose} canSave={canSave} saving={saving} onSave={save} />
    </ModalShell>
  );
}

/* ---------- Micro components ---------- */

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full md:w-[560px] max-w-[96vw] bg-slate-950 border border-slate-800 rounded-2xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-slate-400 hover:text-slate-200" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, canSave, saving }: {
  onClose: () => void; onSave: () => void; canSave: boolean; saving: boolean;
}) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200" onClick={onClose}>Cancel</button>
      <button disabled={!canSave || saving} className={`px-3 py-2 rounded text-white ${canSave ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700"}`} onClick={onSave}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function Input({ placeholder, value, onChange, type = "text", className = "" }: {
  placeholder?: string; value: string; onChange: (v: string) => void; type?: string; className?: string;
}) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      type={type}
      onChange={e=>onChange(e.target.value)}
      className={`bg-slate-900 border border-slate-700 rounded px-3 py-2 ${className}`}
    />
  );
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]; placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e=>onChange(e.target.value)}
      className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((opt, i) => {
        if (typeof opt === "string") return <option key={i} value={opt}>{opt}</option>;
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 border border-slate-700 rounded px-3 py-2">
      <input type="checkbox" className="h-4 w-4" checked={checked} onChange={e=>onChange(e.currentTarget.checked)} />
      <span className="text-sm">{label}</span>
    </label>
  );
}
