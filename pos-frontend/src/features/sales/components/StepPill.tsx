// pos-frontend/src/features/sales/components/StepPill.tsx

export function StepPill({ n, active, label }: { n: number; active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${active ? "text-white" : "text-muted-foreground"}`}>
      <div className={`h-5 w-5 rounded-full grid place-items-center ${active ? "bg-blue-600" : "bg-muted"}`}>{n}</div>
      <div>{label}</div>
    </div>
  );
}