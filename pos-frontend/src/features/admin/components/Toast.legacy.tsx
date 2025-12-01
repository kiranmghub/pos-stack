// pos-frontend/src/features/admin/components/Toast.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Info,
  Trash2,
} from "lucide-react";

type Toast = {
  id: number;
  kind: "success" | "error" | "info" | "warn";
  msg: string;
};
type Ctx = { push: (t: Omit<Toast, "id">) => void };

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

  const colorMap = {
    success: "bg-emerald-900/80 border-emerald-600 text-emerald-50",
    error: "bg-red-900/80 border-red-600 text-red-50",
    info: "bg-muted/90 border-border text-foreground",
    warn: "bg-amber-900/80 border-amber-600 text-amber-50",
  } as const;

  const iconMap = {
    success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
    error: <XCircle className="h-4 w-4 shrink-0" />,
    info: <Info className="h-4 w-4 shrink-0" />,
    warn: <Trash2 className="h-4 w-4 shrink-0" />,
  } as const;

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {list.map((t) => (
          <div
            key={t.id}
            className={`min-w-[16rem] rounded-lg border px-3 py-2 shadow-lg text-sm flex items-center gap-2 ${colorMap[t.kind]}`}
          >
            {iconMap[t.kind]}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
