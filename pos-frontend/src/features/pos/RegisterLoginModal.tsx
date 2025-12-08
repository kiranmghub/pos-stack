// pos-frontend/src/features/pos/RegisterLoginModal.tsx
import React, { useState, useEffect } from "react";
import { X, Lock, AlertCircle } from "lucide-react";
import {
  startRegisterSession,
  getRegistersForStore,
  setRegisterSession,
  type RegisterInfo,
} from "./api";

type Props = {
  open: boolean;
  storeId: number | null;
  storeName: string;
  onSuccess: () => void;
  onCancel?: () => void;
};

export default function RegisterLoginModal({
  open,
  storeId,
  storeName,
  onSuccess,
  onCancel,
}: Props) {
  const [registers, setRegisters] = useState<RegisterInfo[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingRegisters, setLoadingRegisters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load registers when store changes
  useEffect(() => {
    if (!open || !storeId) {
      setRegisters([]);
      setSelectedRegisterId(null);
      return;
    }

    setLoadingRegisters(true);
    setError(null);
    getRegistersForStore(storeId)
      .then((list) => {
        setRegisters(list);
        if (list.length > 0) {
          setSelectedRegisterId(list[0].id);
        }
      })
      .catch((err: any) => {
        setError(err?.message || "Failed to load registers");
      })
      .finally(() => {
        setLoadingRegisters(false);
      });
  }, [open, storeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegisterId || !pin.trim() || loading || !storeId) return;

    setLoading(true);
    setError(null);

    try {
      const selectedRegister = registers.find((r) => r.id === selectedRegisterId);
      if (!selectedRegister) {
        throw new Error("Please select a register");
      }

      const response = await startRegisterSession(selectedRegister.code, pin.trim());
      
      // Store session info
      setRegisterSession(
        response.token,
        response.register.id,
        response.register.store_id,
        response.expires_at
      );

      // Clear PIN
      setPin("");
      setError(null);

      // Notify success
      onSuccess();
    } catch (err: any) {
      const message = err?.message || "Failed to sign in to register";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && onCancel) {
      onCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onCancel || (() => {})}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Register Login</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Sign in to a register to start processing sales
          </p>
        </div>

        {/* Store info (read-only) */}
        <div className="mb-4 rounded-lg border border-border bg-muted/50 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">Store</div>
          <div className="text-sm font-medium text-foreground">{storeName || "No store selected"}</div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Register selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Register
            </label>
            {loadingRegisters ? (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                Loading registers...
              </div>
            ) : registers.length === 0 ? (
              <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
                No active registers found for this store
              </div>
            ) : (
              <select
                value={selectedRegisterId || ""}
                onChange={(e) => setSelectedRegisterId(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                {registers.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    {reg.name} ({reg.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* PIN input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter register PIN"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
              autoFocus
              disabled={loading || loadingRegisters || registers.length === 0}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || loadingRegisters || !selectedRegisterId || !pin.trim() || registers.length === 0}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

