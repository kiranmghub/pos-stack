// src/features/catalog/components/ExportModal.tsx
import * as React from "react";
import { exportCatalog, listInventoryStores } from "../api";
import { X } from "lucide-react";

type Scope = "products" | "variants" | "combined";
type Format = "csv" | "json" | "pdf";

export default function ExportModal({
  open,
  onClose,
  initialQuery = "",
  initialStoreId = "",
}: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
  initialStoreId?: string | number;
}) {
  const [scope, setScope] = React.useState<Scope>("products");
  const [format, setFormat] = React.useState<Format>("csv");
  const [q, setQ] = React.useState<string>(initialQuery);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>("");
  const [includeOnHand, setIncludeOnHand] = React.useState(false);
  const [mode, setMode] = React.useState<"aggregate"|"store"|"breakdown_columns"|"breakdown_rows">("aggregate");
  const [stores, setStores] = React.useState<{id:number; name:string; code?:string}[]>([]);
  const [storeId, setStoreId] = React.useState<string>("");
  const [storeIds, setStoreIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setScope("products");
    setFormat("csv");
    setQ(initialQuery || "");
    setError("");
    setBusy(false);
    setIncludeOnHand(false);
    setMode("aggregate");
    setStoreId(String(initialStoreId || ""));
    setStoreIds([]);
  }, [open, initialQuery, initialStoreId]);

  // Combined is JSON-only in v1; products/variants can be csv/json/pdf
  const effectiveFormat = scope === "combined" ? "json" : format;
  const breakdownDisabled = scope === "combined" || effectiveFormat === "pdf";

// load stores once when modal opens
  React.useEffect(() => {
    if (!open) return;
    (async () => {
      try { setStores(await listInventoryStores()); } catch {}
    })();
  }, [open]);

  async function onExport() {
    try {
      setBusy(true);
      setError("");
      await exportCatalog({
        scope,
        format: effectiveFormat,
        q: q || undefined,
        include_on_hand: includeOnHand || undefined,
        on_hand_mode: includeOnHand ? mode : undefined,
        store_id: includeOnHand && mode === "store" ? (storeId || undefined) : undefined,
        store_ids: includeOnHand && (mode === "breakdown_columns" || mode === "breakdown_rows") ? storeIds : undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* modal */}
      <div className="relative w-full max-w-lg rounded-2xl bg-card text-foreground shadow-2xl border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Export Catalog</h2>
          <button className="p-1 rounded hover:bg-white/5" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Scope</span>
              <select
                className="rounded-md px-2 py-1 bg-card border border-border text-foreground"
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                disabled={busy}
              >
                <option value="products">Products</option>
                <option value="variants">Variants</option>
                <option value="combined">Combined (prod+variants)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Format</span>
              <select
                className="rounded-md px-2 py-1 bg-card border border-border text-foreground"
                value={effectiveFormat}
                onChange={(e) => setFormat(e.target.value as Format)}
                disabled={busy || scope === "combined"}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="pdf">PDF</option>
              </select>
              <span className="text-xs text-muted-foreground">
                {scope === "combined"
                  ? "Combined export is JSON-only."
                  : "PDF omits image URLs for compact output."}
              </span>

            </label>
          </div>

          {/* On-Hand controls */}
          <div className="space-y-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={includeOnHand}
                onChange={(e) => setIncludeOnHand(e.target.checked)}
                disabled={busy}
              />
              <span className="text-sm text-foreground">Include On-Hand</span>
            </label>

            {includeOnHand && (
              <div className="space-y-2 pl-1">
                <div className="text-xs text-muted-foreground">On-Hand Mode</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="oh" checked={mode==="aggregate"} onChange={()=>setMode("aggregate")} />
                    <span className="text-sm">Aggregate (all stores)</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="oh" checked={mode==="store"} onChange={()=>setMode("store")} />
                    <span className="text-sm">Specific store</span>
                  </label>
                  <label className="inline-flex items-center gap-2 opacity-100">
                    <input
                      type="radio"
                      name="oh"
                      checked={mode==="breakdown_columns"}
                      onChange={()=>setMode("breakdown_columns")}
                      disabled={breakdownDisabled}
                    />
                    <span className={breakdownDisabled ? "text-sm text-muted-foreground" : "text-sm"}>
                      Breakdown by store — columns
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="oh"
                      checked={mode==="breakdown_rows"}
                      onChange={()=>setMode("breakdown_rows")}
                      disabled={breakdownDisabled}
                    />
                    <span className={breakdownDisabled ? "text-sm text-muted-foreground" : "text-sm"}>
                      Breakdown by store — rows
                    </span>
                  </label>
                </div>

                {/* Store pickers */}
                {mode === "store" && (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">Store</span>
                    <select
                      className="rounded-md px-2 py-1 bg-card border border-border text-foreground"
                      value={storeId}
                      onChange={(e)=>setStoreId(e.target.value)}
                    >
                      <option value="">Choose a store…</option>
                      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}

                {(mode === "breakdown_columns" || mode === "breakdown_rows") && !breakdownDisabled && (
                  <label className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">Stores (multi-select)</span>
                    <select
                      multiple
                      className="rounded-md px-2 py-1 bg-card border border-border text-foreground h-28"
                      value={storeIds}
                      onChange={(e) => {
                        const vals = Array.from(e.target.selectedOptions).map(o => o.value);
                        setStoreIds(vals);
                      }}
                    >
                      {stores.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                    </select>
                    <span className="text-xs text-muted-foreground">Tip: many stores → consider “rows” layout.</span>
                  </label>
                )}
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Search filter (optional)</span>
            <input
              className="rounded-md px-2 py-1 bg-card border border-border text-foreground placeholder:text-muted-foreground"
              placeholder="Filter by code or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={busy}
            />
            <span className="text-xs text-muted-foreground">Matches product/variant code or name.</span>
          </label>

          {error && (
            <div className="text-sm text-error-foreground border border-error/40 bg-error/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>


        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button 
            className="rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-white/5"
            onClick={onClose}
            disabled={busy}>
            Cancel
          </button>
          <button
            className="rounded-xl px-3 py-2 text-sm bg-zinc-100 text-foreground hover:bg-zinc-200 disabled:opacity-60"
            onClick={onExport}
            disabled={busy}
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
