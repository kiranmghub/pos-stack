// pos-frontend/src/features/admin/components/UserModal.tsx
import React, { useEffect, useState } from "react";
import { AdminAPI, AdminUser, Store } from "../adminApi";
//import { useToast } from "./Toast";
import { useToast } from "./ToastCompat";



type Props = {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  editUser?: AdminUser | null;
};


export default function UserModal({ open, onClose, onSave, editUser }: Props) {
  const isEdit = !!editUser;
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("cashier");
  const [isActive, setIsActive] = useState(true);
  const [stores, setStores] = useState<number[]>([]);
  const [storeList, setStoreList] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState<{value:string; label:string}[]>([]);
  const { push } = useToast();


  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await AdminAPI.stores();
        setStoreList(Array.isArray(list) ? list : list.results ?? []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
  (async () => {
    try {
      const r = await AdminAPI.getTenantRoles();
      setRoleOptions(r);
    } catch (e) {
      console.error(e);
      setRoleOptions([
        { value:"owner", label:"Owner" },
        { value:"admin", label:"Admin" },
        { value:"manager", label:"Manager" },
        { value:"cashier", label:"Cashier" },
        { value:"accountant", label:"Accountant" },
        { value:"auditor", label:"Auditor" },
      ]);
    }
  })();
}, []);

  useEffect(() => {
    if (isEdit && editUser) {
      setUsername(editUser.user?.username || "");
      setEmail(editUser.user?.email || "");
      setRole(editUser.role);
      setIsActive(editUser.is_active);
      setStores(editUser.stores || []);
    } else {
      setUsername("");
      setEmail("");
      setRole("cashier");
      setIsActive(true);
      setStores([]);
    }
  }, [editUser, isEdit]);

  if (!open) return null;

const handleSubmit = async () => {
  setSaving(true);
  try {
    if (isEdit && editUser) {
      const payload: any = {
        role, is_active: isActive, stores,
      };
      if (username && username !== editUser.user?.username) payload.username = username;
      if (email !== editUser.user?.email) payload.email = email;
      if (password) payload.password = password;
      await AdminAPI.updateUser(editUser.id, payload);
    } else {
      // Create — inline user
      await AdminAPI.createUser({
        username, email, password, role, is_active: isActive, stores,
      });
    }
    push({ kind: "success", msg: isEdit ? "User updated" : "User created" });
    onSave();
    onClose();
  } catch (err: any) {
    console.error(err);
    push({ kind: "error", msg: (err as any)?.message || "Failed to save user" });
  } finally {
    setSaving(false);
  }
};


  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="w-[30rem] rounded-2xl bg-slate-900 border border-slate-700 shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {isEdit ? "Edit User" : "New User"}
        </h2>

        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-slate-200">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
            placeholder="Enter username"
          />
          <p className="text-xs text-slate-400 mt-1">Unique username for login.</p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-slate-200">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
            placeholder="user@example.com"
          />
          <p className="text-xs text-slate-400 mt-1">Used for notifications and identification.</p>
        </div>

        {/* Password (optional on edit) */}
        <div>
        <label className="block text-sm font-medium text-slate-200">
            Password {isEdit ? <span className="text-slate-400 font-normal">(leave blank to keep)</span> : null}
        </label>
        <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
            placeholder={isEdit ? "••••••••" : "Set an initial password"}
        />
        <p className="text-xs text-slate-400 mt-1">
            {isEdit ? "Only set if you need to change this user's password." : "Required for new users."}
        </p>
        </div>


        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-slate-200">Role</label>
            <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
            >
            {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                {r.label}
                </option>
            ))}
            </select>

          <p className="text-xs text-slate-400 mt-1">Select user’s permission level.</p>
        </div>

        {/* Stores */}
        <div>
          <label className="block text-sm font-medium text-slate-200">Stores</label>
          {loading ? (
            <p className="text-sm text-slate-400">Loading stores…</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-auto border border-slate-700 rounded-md p-2">
              {storeList.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={stores.includes(s.id)}
                    onChange={(e) =>
                      setStores((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                      )
                    }
                  />
                  {s.name} ({s.code})
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">Assign one or more stores to this user.</p>
        </div>

        {/* Active */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label className="text-sm text-slate-200">Active user</label>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={handleSubmit}
            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}
