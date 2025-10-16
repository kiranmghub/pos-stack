// pos-frontend/src/features/admin/components/ToastCompat.tsx
// This file provides a compatibility layer to adapt the old toast API to the new one.
// It allows existing code that uses `useToast().push({ kind, msg })` to work with the new shadcn/ui toast system.
import React, { useCallback } from "react";
import { useToast as useShadcnToast } from "@/ui/toast";
import { CheckCircle2, XCircle, Info, Trash2 } from "lucide-react";

type Kind = "success" | "error" | "info" | "warn";
type PushArgs = { kind: Kind; msg: string };

const styleByKind: Record<Kind, string> = {
  success: "bg-emerald-900/80 border border-emerald-600 text-emerald-50",
  error:   "bg-red-900/80 border border-red-600 text-red-50",
  info:    "bg-slate-800/90 border border-slate-600 text-slate-100",
  warn:    "bg-amber-900/80 border border-amber-600 text-amber-50",
};

const iconByKind: Record<Kind, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  error:   <XCircle className="h-4 w-4 shrink-0" />,
  info:    <Info className="h-4 w-4 shrink-0" />,
  warn:    <Trash2 className="h-4 w-4 shrink-0" />,
};

export function useToast() {
  const { toast } = useShadcnToast();

  const push = useCallback(({ kind, msg }: PushArgs) => {
    const variant = kind === "error" ? "destructive" : undefined;
    toast({
      title: (
        <span className="inline-flex items-center gap-2">
          {iconByKind[kind]}
          <span>{msg}</span>
        </span>
      ),
      variant,
      className: `min-w-[16rem] ${styleByKind[kind]}`,
      duration: 3500,
    });
  }, [toast]);

  return { push };
}


