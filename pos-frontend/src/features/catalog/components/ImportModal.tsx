// src/features/catalog/components/ImportModal.tsx
import * as React from "react";
import { X, Download } from "lucide-react";
import { downloadImportTemplate, importCatalog } from "../api";

type Scope = "products" | "variants";
type Mode = "create" | "upsert";

export default function ImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [scope, setScope] = React.useState<Scope>("products");
  const [mode, setMode] = React.useState<Mode>("upsert");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const [result, setResult] = React.useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: any }[];
    total_rows: number;
    dry_run: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setScope("products");
    setMode("upsert");
    setFile(null);
    setBusy(false);
    setError("");
    setResult(null);
  }, [open]);

  async function onDownloadTemplate() {
    try {
      setBusy(true);
      setError("");
      await downloadImportTemplate(scope);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onValidate() {
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const res = await importCatalog({ scope, mode, dry_run: true, file });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const res = await importCatalog({ scope, mode, dry_run: false, file });
      setResult(res);
      // signal the table to refresh; ProductTable listens for this
      window.dispatchEvent(new CustomEvent("catalog:import:applied", { detail: res }));
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
      <div className="relative w-full max-w-2xl rounded-2xl bg-zinc-900 text-zinc-100 shadow-2xl border border-zinc-800">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold">Import Catalog</h2>
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
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-zinc-400">Mode</span>
              <select
                className="rounded-md px-2 py-1 bg-zinc-900 border border-zinc-700 text-zinc-100"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                disabled={busy}
              >
                <option value="upsert">Upsert (create or update)</option>
                <option value="create">Create only</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
              onClick={onDownloadTemplate}
              disabled={busy}
            >
              <Download className="w-4 h-4" />
              Download template
            </button>
            <span className="text-xs text-zinc-500">CSV format only for now.</span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-400">Upload CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:text-zinc-100 hover:file:bg-white/5"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={busy}
            />
          </label>

          {error && (
            <div className="text-sm text-red-300 border border-red-900/40 bg-red-900/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-zinc-800 bg-zinc-950">
              <div className="px-3 py-2 border-b border-zinc-800 text-sm text-zinc-300">
                Validation summary{result.dry_run ? " (dry run)" : ""}:
              </div>
              <div className="p-3 grid grid-cols-2 gap-2 text-sm">
                <div>Created: <span className="font-medium">{result.created}</span></div>
                <div>Updated: <span className="font-medium">{result.updated}</span></div>
                <div>Skipped: <span className="font-medium">{result.skipped}</span></div>
                <div>Total rows: <span className="font-medium">{result.total_rows}</span></div>
              </div>
              {result.errors?.length ? (
                <div className="p-3">
                  <div className="text-sm text-zinc-300 mb-1">Errors</div>
                  <div className="max-h-56 overflow-auto rounded border border-zinc-800">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-900 text-zinc-300">
                        <tr>
                          <th className="text-left px-2 py-1 border-b border-zinc-800 w-20">Row</th>
                          <th className="text-left px-2 py-1 border-b border-zinc-800">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((e, idx) => (
                          <tr key={idx} className="odd:bg-zinc-950 even:bg-zinc-900/40">
                            <td className="px-2 py-1 align-top border-b border-zinc-800">{e.row}</td>
                            <td className="px-2 py-1 align-top border-b border-zinc-800">
                              <pre className="whitespace-pre-wrap break-words text-xs">
                                {typeof e.message === "string" ? e.message : JSON.stringify(e.message, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5" onClick={onClose} disabled={busy}>
            Close
          </button>
          {!result?.dry_run && (
            <button
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
              onClick={onValidate}
              disabled={busy}
            >
              Validate
            </button>
          )}
          {(!result || result.dry_run) && (
            <button
              className="rounded-xl px-3 py-2 text-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
              onClick={onValidate}
              disabled={busy || !file}
            >
              Validate
            </button>
          )}
          {result?.dry_run && !result.errors?.length ? (
            <button
              className="rounded-xl px-3 py-2 text-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
              onClick={onApply}
              disabled={busy || !file}
            >
              Apply changes
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
