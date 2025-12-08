// pos-frontend/src/features/admin/stores/components/UserFormItem.tsx
import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Store } from "../../adminApi";
import { UsersAPI } from "../../api";

export type UserFormData = {
  username: string;
  email: string;
  password: string;
  role: string;
  stores: number[];
};

type Props = {
  storeIds: number[];
  storeList: Store[];
  value: UserFormData;
  onChange: (value: UserFormData) => void;
  onRemove: () => void;
  index: number;
  canRemove: boolean;
};

export default function UserFormItem({
  storeIds,
  storeList,
  value,
  onChange,
  onRemove,
  index,
  canRemove,
}: Props) {
  const [roleOptions, setRoleOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const opts = await UsersAPI.getTenantRoles();
        setRoleOptions(opts);
        // Set default role if not set
        if (!value.role && opts.length) {
          onChange({ ...value, role: opts.find((o) => o.value === "cashier")?.value || opts[0].value });
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
        if (!value.role) {
          onChange({ ...value, role: "cashier" });
        }
      }
    })();
  }, []);

  // Initialize stores with storeIds if empty
  useEffect(() => {
    if (value.stores.length === 0 && storeIds.length > 0) {
      onChange({ ...value, stores: [...storeIds] });
    }
  }, [storeIds]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">User {index + 1}</h4>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Username *</label>
          <input
            type="text"
            value={value.username}
            onChange={(e) => onChange({ ...value, username: e.target.value })}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
            placeholder="Enter username"
          />
        </div>
        <div>
          <label className="text-sm">Email</label>
          <input
            type="email"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="text-sm">Password *</label>
          <input
            type="password"
            value={value.password}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
            placeholder="Set password"
          />
        </div>
        <div>
          <label className="text-sm">Role *</label>
          <select
            value={value.role}
            onChange={(e) => onChange({ ...value, role: e.target.value })}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
          >
            {roleOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm">Stores *</label>
        <div className="mt-1 max-h-32 overflow-auto border border-border rounded-md p-2 space-y-1">
          {storeList.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={value.stores.includes(s.id)}
                onChange={(e) => {
                  const newStores = e.target.checked
                    ? [...value.stores, s.id]
                    : value.stores.filter((id) => id !== s.id);
                  onChange({ ...value, stores: newStores });
                }}
              />
              {s.name} ({s.code})
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Select one or more stores for this user.</p>
      </div>
    </div>
  );
}

