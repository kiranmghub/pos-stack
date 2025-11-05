// src/features/catalog/components/ExportModal.tsx
import * as React from "react";
import { exportCatalog } from "../api";
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

  React.useEffect(() => {
    if (!open) return;
    setScope("products");
    setFormat("csv");
    setQ(initialQuery || "");
    setError("");
    setBusy(false);
  }, [open, initialQuery]);

  // Combined is JSON-only in v1; products/variants can be csv/json/pdf
  const effectiveFormat = scope === "combined" ? "json" : format;

  async function onExport() {
    try {
      setBusy(true);
      setError("");
      await exportCatalog({
        scope,
        format: effectiveFormat,
        q: q || undefined,
        // store_id: initialStoreId || undefined, // keep for future enablement
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
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-900 text-zinc-100 shadow-2xl border border-zinc-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold">Export Catalog</h2>
          <button className="p-1 rounded hover:bg-white/5" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5 text-zinc-300" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-zinc-400">Scope</span>
              <select
                className="rounded-md px-2 py-1 bg-zinc-900 border border-zinc-700 text-zinc-100"
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
              <span className="text-sm text-zinc-400">Format</span>
              <select
                className="rounded-md px-2 py-1 bg-zinc-900 border border-zinc-700 text-zinc-100"
                value={effectiveFormat}
                onChange={(e) => setFormat(e.target.value as Format)}
                disabled={busy || scope === "combined"}
              >
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
                <option value="pdf">PDF</option>
              </select>
              <span className="text-xs text-zinc-500">
                {scope === "combined"
                  ? "Combined export is JSON-only."
                  : "PDF omits image URLs for compact output."}
              </span>

            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-400">Search filter (optional)</span>
            <input
              className="rounded-md px-2 py-1 bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
              placeholder="Filter by code or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={busy}
            />
            <span className="text-xs text-zinc-500">Matches product/variant code or name.</span>
          </label>

          {error && (
            <div className="text-sm text-red-300 border border-red-900/40 bg-red-900/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>


        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button 
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
            onClick={onClose}
            disabled={busy}>
            Cancel
          </button>
          <button
            className="rounded-xl px-3 py-2 text-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
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
