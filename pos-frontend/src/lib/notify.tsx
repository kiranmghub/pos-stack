// pos-frontend/src/lib/notify.tsx
import React from "react";
import { useToast as useShadcnToast } from "@/ui/toast";
import { CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react";

type Kind = "success" | "error" | "info" | "warn";
type PushArgs = { kind: Kind; msg: string; duration?: number };

const styleByKind: Record<Kind, string> = {
  success: "bg-emerald-900/80 border border-emerald-600 text-emerald-50",
  error:   "bg-red-900/80 border border-red-600 text-red-50",
  info:    "bg-muted/80 border border-border text-foreground",
  warn:    "bg-amber-900/80 border border-amber-600 text-amber-50",
};

const iconByKind: Record<Kind, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0" />,
  error:   <XCircle className="h-4 w-4 shrink-0" />,
  info:    <Info className="h-4 w-4 shrink-0" />,
  warn:    <AlertTriangle className="h-4 w-4 shrink-0" />,
};

/** Hook form, if you prefer dependency injection in components */
export function useNotify() {
  const { toast } = useShadcnToast();

  const push = React.useCallback(
    ({ kind, msg, duration = 3500 }: PushArgs) => {
      toast({
        title: (
          <span className="inline-flex items-center gap-2">
            {iconByKind[kind]}
            <span>{msg}</span>
          </span>
        ),
        variant: kind === "error" ? "destructive" : undefined,
        className: `min-w-[16rem] ${styleByKind[kind]}`,
        duration,
      });
    },
    [toast]
  );

  return {
    push,
    success: (msg: string, duration?: number) => push({ kind: "success", msg, duration }),
    error:   (msg: string, duration?: number) => push({ kind: "error", msg, duration }),
    info:    (msg: string, duration?: number) => push({ kind: "info", msg, duration }),
    warn:    (msg: string, duration?: number) => push({ kind: "warn", msg, duration }),
  };
}

/** Static form, for places where hooks aren't convenient (thunks, helpers) */
let _toast: ReturnType<typeof useShadcnToast>["toast"] | null = null;

export function ToastBridgeProvider({ children }: { children: React.ReactNode }) {
  // capture toast function once, so non-React code can call notify.*
  const { toast } = useShadcnToast();
  React.useEffect(() => { _toast = toast; }, [toast]);
  return <>{children}</>;
}

function _emit(kind: Kind, msg: string, duration = 3500) {
  if (!_toast) return; // no-op until provider mounts
  _toast({
    title: (
      <span className="inline-flex items-center gap-2">
        {iconByKind[kind]}
        <span>{msg}</span>
      </span>
    ),
    variant: kind === "error" ? "destructive" : undefined,
    className: `min-w-[16rem] ${styleByKind[kind]}`,
    duration,
  });
}

export const notify = {
  success: (msg: string, duration?: number) => _emit("success", msg, duration),
  error:   (msg: string, duration?: number) => _emit("error", msg, duration),
  info:    (msg: string, duration?: number) => _emit("info", msg, duration),
  warn:    (msg: string, duration?: number) => _emit("warn", msg, duration),
};
