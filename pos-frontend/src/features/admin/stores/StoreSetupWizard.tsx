// pos-frontend/src/features/admin/stores/StoreSetupWizard.tsx
import React, { useEffect, useState } from "react";
import { Plus, CheckCircle2, Loader2 } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { RegistersAPI, type Register } from "../api/registers";
import { UsersAPI, type AdminUser } from "../api";
import { StoresAPI } from "../api/stores";
import { AdminAPI, type Store } from "../adminApi";
import RegisterFormItem, { type RegisterFormData } from "./components/RegisterFormItem";
import UserFormItem, { type UserFormData } from "./components/UserFormItem";

type Props = {
  open: boolean;
  storeId: number;
  storeName: string;
  onComplete: () => void;
  onClose: () => void;
};

type Step = 1 | 2 | 3;

type CreatedItem = {
  type: "register" | "user";
  name: string;
  code?: string;
  role?: string;
  stores?: string[];
};

export default function StoreSetupWizard({
  open,
  storeId,
  storeName,
  onComplete,
  onClose,
}: Props) {
  const { success, error } = useNotify();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [storeList, setStoreList] = useState<Store[]>([]);

  // Registers
  const [registers, setRegisters] = useState<RegisterFormData[]>([
    { name: "", code: "", hardware_profile: {} },
  ]);
  const [createdRegisters, setCreatedRegisters] = useState<Register[]>([]);

  // Users
  const [users, setUsers] = useState<UserFormData[]>([
    { username: "", email: "", password: "", role: "cashier", stores: [] },
  ]);
  const [createdUsers, setCreatedUsers] = useState<AdminUser[]>([]);

  // Summary
  const [summary, setSummary] = useState<CreatedItem[]>([]);

  // Load store details and store list
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const [storeData, storesData] = await Promise.all([
          StoresAPI.list({}),
          AdminAPI.stores({ is_active: true }),
        ]);
        if (!mounted) return;

        const stores = Array.isArray(storesData) ? storesData : storesData.results ?? [];
        setStoreList(stores);
        const allStores = Array.isArray(storeData) ? storeData : storeData.results ?? [];
        const foundStore = allStores.find((s: Store) => s.id === storeId);
        if (foundStore) setStore(foundStore);

        // Initialize user stores with the new store
        setUsers((prev) =>
          prev.map((u) => ({
            ...u,
            stores: u.stores.length === 0 ? [storeId] : u.stores,
          }))
        );
      } catch (e: any) {
        error(e?.message || "Failed to load store information");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open, storeId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setRegisters([{ name: "", code: "", hardware_profile: {} }]);
      setUsers([{ username: "", email: "", password: "", role: "cashier", stores: [] }]);
      setCreatedRegisters([]);
      setCreatedUsers([]);
      setSummary([]);
    }
  }, [open]);

  if (!open) return null;

  const addRegister = () => {
    setRegisters([...registers, { name: "", code: "", hardware_profile: {} }]);
  };

  const removeRegister = (index: number) => {
    setRegisters(registers.filter((_, i) => i !== index));
  };

  const updateRegister = (index: number, value: RegisterFormData) => {
    const updated = [...registers];
    updated[index] = value;
    setRegisters(updated);
  };

  const addUser = () => {
    setUsers([
      ...users,
      { username: "", email: "", password: "", role: "cashier", stores: [storeId] },
    ]);
  };

  const removeUser = (index: number) => {
    setUsers(users.filter((_, i) => i !== index));
  };

  const updateUser = (index: number, value: UserFormData) => {
    const updated = [...users];
    updated[index] = value;
    setUsers(updated);
  };

  const validateRegisters = (): boolean => {
    const validRegisters = registers.filter((r) => r.code.trim());
    if (validRegisters.length === 0 && registers.length > 0) {
      error("Please provide at least one register code, or remove empty registers.");
      return false;
    }
    return true;
  };

  const validateUsers = (): boolean => {
    const validUsers = users.filter((u) => u.username.trim() && u.password.trim() && u.stores.length > 0);
    if (validUsers.length === 0 && users.length > 0) {
      error("Please provide username, password, and at least one store for each user, or remove empty users.");
      return false;
    }
    for (const user of users) {
      if (user.username.trim() && (!user.password.trim() || user.stores.length === 0)) {
        error(`User "${user.username}" is missing password or store assignment.`);
        return false;
      }
    }
    return true;
  };

  const handleStep1Continue = async () => {
    if (registers.length === 0 || registers.every((r) => !r.code.trim())) {
      // Skip if no registers
      setCurrentStep(2);
      return;
    }

    if (!validateRegisters()) return;

    setLoading(true);
    try {
      const validRegisters = registers.filter((r) => r.code.trim());
      const created: Register[] = [];
      const errors: string[] = [];

      for (const reg of validRegisters) {
        try {
          const result = await RegistersAPI.create({
            store: storeId,
            name: reg.name || undefined,
            code: reg.code,
            hardware_profile: reg.hardware_profile,
            is_active: true,
          });
          created.push(result);
        } catch (e: any) {
          errors.push(`Register "${reg.code}": ${e?.message || "Failed to create"}`);
        }
      }

      if (errors.length > 0 && created.length === 0) {
        error(errors.join("; "));
        return;
      }

      if (created.length > 0) {
        setCreatedRegisters(created);
        if (errors.length > 0) {
          error(`Some registers failed: ${errors.join("; ")}`);
        }
      }

      setCurrentStep(2);
    } catch (e: any) {
      error(e?.message || "Failed to create registers");
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Continue = async () => {
    if (users.length === 0 || users.every((u) => !u.username.trim())) {
      // Skip if no users
      buildSummary();
      setCurrentStep(3);
      return;
    }

    if (!validateUsers()) return;

    setLoading(true);
    try {
      const validUsers = users.filter((u) => u.username.trim() && u.password.trim() && u.stores.length > 0);
      const created: AdminUser[] = [];
      const errors: string[] = [];

      for (const user of validUsers) {
        try {
          const result = await UsersAPI.create({
            username: user.username,
            email: user.email || undefined,
            password: user.password,
            role: user.role,
            is_active: true,
            stores: user.stores,
          });
          created.push(result);
        } catch (e: any) {
          errors.push(`User "${user.username}": ${e?.message || "Failed to create"}`);
        }
      }

      if (errors.length > 0 && created.length === 0) {
        error(errors.join("; "));
        return;
      }

      if (created.length > 0) {
        setCreatedUsers(created);
        if (errors.length > 0) {
          error(`Some users failed: ${errors.join("; ")}`);
        }
      }

      buildSummary();
      setCurrentStep(3);
    } catch (e: any) {
      error(e?.message || "Failed to create users");
    } finally {
      setLoading(false);
    }
  };

  const buildSummary = () => {
    const items: CreatedItem[] = [];

    // Add store (always first)
    items.push({
      type: "register", // Using register type for display consistency
      name: storeName,
      code: store?.code,
    });

    // Add registers
    createdRegisters.forEach((reg) => {
      items.push({
        type: "register",
        name: reg.name || reg.code,
        code: reg.code,
      });
    });

    // Add users
    createdUsers.forEach((user) => {
      const storeNames = storeList
        .filter((s) => user.stores?.includes(s.id))
        .map((s) => s.name);
      items.push({
        type: "user",
        name: user.user?.username || "",
        role: user.role,
        stores: storeNames,
      });
    });

    setSummary(items);
  };

  const handleFinish = () => {
    onComplete();
    onClose();
  };

  const handleSkip = () => {
    if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      buildSummary();
      setCurrentStep(3);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50">
      <div className="w-[900px] max-h-[90vh] rounded-xl border border-border bg-card flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Set Up Store: {storeName}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {currentStep === 1 && "Step 1 of 2: Create Registers"}
                {currentStep === 2 && "Step 2 of 2: Create Users"}
                {currentStep === 3 && "Summary"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div
                  className={`h-2 w-2 rounded-full ${currentStep >= 1 ? "bg-primary" : "bg-muted"}`}
                />
                <div
                  className={`h-2 w-2 rounded-full ${currentStep >= 2 ? "bg-primary" : "bg-muted"}`}
                />
                <div
                  className={`h-2 w-2 rounded-full ${currentStep >= 3 ? "bg-primary" : "bg-muted"}`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 flex-1">
          {currentStep === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create one or more registers for this store. Registers are used to process sales at the point of sale.
              </p>

              <div className="space-y-3">
                {registers.map((reg, index) => (
                  <RegisterFormItem
                    key={index}
                    storeId={storeId}
                    storeName={storeName}
                    value={reg}
                    onChange={(value) => updateRegister(index, value)}
                    onRemove={() => removeRegister(index)}
                    index={index}
                    canRemove={registers.length > 1}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={addRegister}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 hover:bg-muted transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Another Register
              </button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create one or more users (e.g., cashiers) who can access this store and process sales.
              </p>

              <div className="space-y-3">
                {users.map((user, index) => (
                  <UserFormItem
                    key={index}
                    storeIds={[storeId]}
                    storeList={storeList}
                    value={user}
                    onChange={(value) => updateUser(index, value)}
                    onRemove={() => removeUser(index)}
                    index={index}
                    canRemove={users.length > 1}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={addUser}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 hover:bg-muted transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Another User
              </button>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                <h4 className="font-semibold text-lg">Store Setup Complete!</h4>
              </div>

              <div className="space-y-4">
                {/* Store */}
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="font-semibold text-sm">Store Created</span>
                  </div>
                  <div className="text-sm text-foreground ml-6">
                    {storeName}{" "}
                    {store?.code && (
                      <span className="text-muted-foreground">(code: {store.code})</span>
                    )}
                  </div>
                </div>

                {/* Registers */}
                {createdRegisters.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="font-semibold text-sm">
                        Registers Created ({createdRegisters.length})
                      </span>
                    </div>
                    <ul className="space-y-1 ml-6">
                      {createdRegisters.map((reg, idx) => (
                        <li key={idx} className="text-sm text-foreground">
                          • {reg.name || reg.code} (code: {reg.code})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Users */}
                {createdUsers.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="font-semibold text-sm">
                        Users Created ({createdUsers.length})
                      </span>
                    </div>
                    <ul className="space-y-2 ml-6">
                      {createdUsers.map((user, idx) => {
                        const summaryItem = summary.find(
                          (s) => s.type === "user" && s.name === user.user?.username
                        );
                        return (
                          <li key={idx} className="text-sm text-foreground">
                            • {user.user?.username} ({user.role})
                            {summaryItem?.stores && summaryItem.stores.length > 0 && (
                              <span className="text-muted-foreground">
                                {" "}
                                - Assigned to: {summaryItem.stores.join(", ")}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4 flex-shrink-0">
          <div className="text-xs text-muted-foreground">
            {currentStep === 1 && "You can skip this step if you want to add registers later."}
            {currentStep === 2 && "You can skip this step if you want to add users later."}
            {currentStep === 3 && "Your store is ready to use!"}
          </div>
          <div className="flex items-center gap-2">
            {currentStep < 3 && (
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                Cancel
              </button>
            )}
            {currentStep === 1 && (
              <>
                <button
                  onClick={handleSkip}
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleStep1Continue}
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-success hover:bg-success/90 text-success-foreground transition-colors flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
              </>
            )}
            {currentStep === 2 && (
              <>
                <button
                  onClick={handleSkip}
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleStep2Continue}
                  disabled={loading}
                  className="px-4 py-2 rounded-md bg-success hover:bg-success/90 text-success-foreground transition-colors flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
              </>
            )}
            {currentStep === 3 && (
              <button
                onClick={handleFinish}
                className="px-4 py-2 rounded-md bg-success hover:bg-success/90 text-success-foreground transition-colors"
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

