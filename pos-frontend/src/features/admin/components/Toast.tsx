// pos-frontend/src/features/admin/components/Toast.tsx
import React, { createContext, useContext, useEffect, useState } from "react";

type Toast = { id: number; kind: "success" | "error" | "info"; msg: string };
type Ctx = {
  push: (t: Omit<Toast, "id">) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);

  const push: Ctx["push"] = (t) =>
    setList((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]);

  useEffect(() => {
    if (list.length === 0) return;
    const timers = list.map((t) =>
      setTimeout(() => {
        setList((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500)
    );
    return () => timers.forEach(clearTimeout);
  }, [list]);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {list.map((t) => (
          <div
            key={t.id}
            className={`min-w-[16rem] rounded-lg border px-3 py-2 shadow-lg text-sm
              ${
                t.kind === "success"
                  ? "bg-emerald-900/80 border-emerald-600 text-emerald-50"
                  : t.kind === "error"
                  ? "bg-red-900/80 border-red-600 text-red-50"
                  : "bg-slate-800/90 border-slate-600 text-slate-100"
              }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
