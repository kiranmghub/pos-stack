// pos-frontend/src/features/admin/components/UserModal.tsx
import React, { useEffect, useState } from "react";
import type { AdminUser, Store } from "../adminApi";
import { UsersAPI } from "../api";
import { StoresAPI } from "../api";
import { useNotify } from "@/lib/notify";



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
  const { success, error, info, warn } = useNotify();
  



  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const list = await StoresAPI.list({ is_active: true });
        setStoreList(Array.isArray(list) ? list : list.results ?? []);
      } catch (e: any) {
        error(e?.message || "Failed to load stores");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);


  useEffect(() => {
    (async () => {
      try {
        const opts = await UsersAPI.getTenantRoles(); // RoleOption[]
        setRoleOptions(opts);

        // if current role is not in the list, pick the first available
        if (!opts.some((o) => o.value === role) && opts.length) {
          setRole(opts[0].value);
        }
      } catch (e) {
        console.error(e);
        setRoleOptions([
          { value: "owner", label: "Owner" },
          { value: "admin", label: "Admin" },
          { value: "manager", label: "Manager" },
          { value: "cashier", label: "Cashier" },
          { value: "accountant", label: "Accountant" },
          { value: "auditor", label: "Auditor" },
        ]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await UsersAPI.update(editUser.id, payload);
    } else {
      // Create — inline user
      await UsersAPI.create({
        username, email, password, role, is_active: isActive, stores,
      });
    }
    success(isEdit ? "User updated" : "User created");
    onSave();
    onClose();
  } catch (err: any) {
    console.error(err);
    error((err as any)?.message || "Failed to save user");
  } finally {
    setSaving(false);
  }
};


  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="w-[30rem] rounded-2xl bg-card border border-border shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {isEdit ? "Edit User" : "New User"}
        </h2>

        {/* Username */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
            placeholder="Enter username"
          />
          <p className="text-xs text-muted-foreground mt-1">Unique username for login.</p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
            placeholder="user@example.com"
          />
          <p className="text-xs text-muted-foreground mt-1">Used for notifications and identification.</p>
        </div>

        {/* Password (optional on edit) */}
        <div>
        <label className="block text-sm font-medium text-muted-foreground">
            Password {isEdit ? <span className="text-muted-foreground font-normal">(leave blank to keep)</span> : null}
        </label>
        <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
            placeholder={isEdit ? "••••••••" : "Set an initial password"}
        />
        <p className="text-xs text-muted-foreground mt-1">
            {isEdit ? "Only set if you need to change this user's password." : "Required for new users."}
        </p>
        </div>


        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Role</label>
            <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
            >
            {roleOptions.map((r) => (
                <option key={r.value} value={r.value}>
                {r.label}
                </option>
            ))}
            </select>

          <p className="text-xs text-muted-foreground mt-1">Select user’s permission level.</p>
        </div>

        {/* Stores */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Stores</label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading stores…</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-auto border border-border rounded-md p-2">
              {storeList.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-muted-foreground">
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
          <p className="text-xs text-muted-foreground mt-1">Assign one or more stores to this user.</p>
        </div>

        {/* Active */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label className="text-sm text-muted-foreground">Active user</label>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-muted-foreground"
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
