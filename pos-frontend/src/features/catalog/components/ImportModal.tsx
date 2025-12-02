// src/features/catalog/components/ImportModal.tsx
import * as React from "react";
import { X, Download } from "lucide-react";
import { downloadImportTemplate, importCatalog } from "../api";
import { useNotify } from "@/lib/notify";

type Scope = "products" | "variants";
type Mode = "create" | "upsert";

export default function ImportModal({
    open,
    onClose,
    scopeOverride,
    autoCloseOnApply = false,
    onSuccess,
}: {
    open: boolean;
    onClose: () => void;
    scopeOverride?: Scope;
    autoCloseOnApply?: boolean;
    onSuccess?: () => void;
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

    const { success, error: toastError } = useNotify();
    const errorsRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setScope(scopeOverride || "products");
        setMode("upsert");
        setFile(null);
        setBusy(false);
        setError("");
        setResult(null);
    }, [open, scopeOverride]);

    // If the user changes scope, mode, or file after a validation,
    // clear the previous result to avoid stale "Apply" state.
    React.useEffect(() => {
        setResult(null);
    }, [scope, mode, file]);

    const canApply =
        !!result &&
        !!result.dry_run &&
        Array.isArray(result.errors) &&
        result.errors.length === 0 &&
        (Number(result.created || 0) + Number(result.updated || 0) > 0);

    // Classify error messages for soft color coding
    function classifyError(msg: any): "error" | "warn" {
        const s = (typeof msg === "string" ? msg : JSON.stringify(msg)).toLowerCase();
        const hard = [
            "required",
            "invalid",
            "duplicate",
            "unique",
            "not found",
            "mismatch",
            "negative",
            "exceed",
            "cannot",
            "missing column",
            "column count",
        ];
        return hard.some((k) => s.includes(k)) ? "error" : "warn";
    }


    async function onDownloadTemplate() {
        try {
            setBusy(true);
            setError("");
            await downloadImportTemplate(scope);
            success("Template downloaded.");
        } catch (e: any) {
            setError(e?.message || String(e));
            toastError(e?.message || "Template download failed.");
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
            const created = Number(res.created || 0);
            const updated = Number(res.updated || 0);
            if (res.errors?.length) {
                // bring errors into view
                setTimeout(() => errorsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                toastError("Validation found errors. Review the list below.");
            } else if (created + updated > 0) {
                success(`Validation passed. Ready to import ${created} create(s) and ${updated} update(s).`);
            } else {
                success("Validation complete — nothing to import (all rows skipped).");
            }
        } catch (e: any) {
            setError(e?.message || String(e));
            toastError(e?.message || "Validation failed.");
        } finally {
            setBusy(false);
        }
    }

    async function onApply() {
        if (!file) {
            setError("Please choose a CSV file first.");
            return;
        }
        // Guard: if nothing to import, don't post again.
        if (result && (Number(result.created || 0) + Number(result.updated || 0) === 0)) {
            success("Nothing to import — all rows were skipped.");
            return;
        }
        try {
            setBusy(true);
            setError("");
            const res = await importCatalog({ scope, mode, dry_run: false, file });
            setResult(res);
            // signal the table to refresh; ProductTable listens for this
            window.dispatchEvent(new CustomEvent("catalog:import:applied", { detail: res }));
            success(scope === "products" ? "Products uploaded successfully." : "Variants uploaded successfully.");
            if (onSuccess) onSuccess();
            if (autoCloseOnApply) {
                onClose();
            }
        } catch (e: any) {
            setError(e?.message || String(e));
            toastError(e?.message || "Import failed.");
        } finally {
            setBusy(false);
        }
    }

    // Build and download a small CSV from the current errors list
    function downloadErrorsCsv() {
        if (!result?.errors?.length) return;
        const lines = ["Row,Message"];
        for (const err of result.errors) {
            const msg = typeof err.message === "string" ? err.message : JSON.stringify(err.message);
            // escape quotes and wrap the message
            const safe = `"${String(msg).replace(/"/g, '""')}"`;
            lines.push(`${err.row},${safe}`);
        }
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        a.href = url;
        a.download = `import-errors_${scope}_${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        success("Errors CSV downloaded.");
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            {/* modal */}
            <div className="relative w-full max-w-2xl rounded-2xl bg-card text-foreground shadow-2xl border border-border">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h2 className="text-lg font-semibold">Import Catalog</h2>
                    <div className="flex items-center gap-2">
                        <button
                            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm text-foreground hover:bg-white/5"
                            onClick={onDownloadTemplate}
                            disabled={busy}
                            title="Download CSV template"
                        >
                            <Download className="w-4 h-4" />
                            Template
                        </button>
                        <button className="p-1 rounded hover:bg-white/5" onClick={onClose} aria-label="Close">
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>
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
                            </select>
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground">Mode</span>
                            <select
                                className="rounded-md px-2 py-1 bg-card border border-border text-foreground"
                                value={mode}
                                onChange={(e) => setMode(e.target.value as Mode)}
                                disabled={busy}
                            >
                                <option value="upsert">Upsert (create or update)</option>
                                <option value="create">Create only</option>
                            </select>
                        </label>
                    </div>


                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-muted-foreground">Upload CSV</span>
                        <input
                            type="file"
                            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-white/5"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            disabled={busy}
                        />
                        <span className="text-xs text-muted-foreground">
                            CSV supported now. If a field contains commas, wrap it in double quotes.
                            XLSX will be enabled when backend parsing is added.
                        </span>
                    </label>

                    {error && (
                        <div className="text-sm text-error-foreground border border-error/40 bg-error/30 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}

                    {result && (
                        <div className="rounded-md border border-border bg-background">
                            <div className="px-3 py-2 border-b border-border text-sm text-muted-foreground">
                                Validation summary{result.dry_run ? " (dry run)" : ""}:
                            </div>
                            <div className="p-3 grid grid-cols-2 gap-2 text-sm">
                                <div>Created: <span className="font-medium">{result.created}</span></div>
                                <div>Updated: <span className="font-medium">{result.updated}</span></div>
                                <div>Skipped: <span className="font-medium">{result.skipped}</span></div>
                                <div>Total rows: <span className="font-medium">{result.total_rows}</span></div>
                            </div>
                            {result.errors?.length ? (
                                <div className="p-3" ref={errorsRef}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="text-sm text-muted-foreground">
                                            Errors <span className="ml-1 rounded-md bg-badge-error-bg px-2 py-0.5 text-xs text-badge-error-text">{result.errors.length}</span>
                                        </div>
                                        <button
                                            className="rounded-xl border border-border px-3 py-1.5 text-xs text-foreground hover:bg-white/5"
                                            onClick={downloadErrorsCsv}
                                            disabled={!result.errors.length || busy}
                                            title="Download errors as CSV"
                                        >
                                            Download errors CSV
                                        </button>
                                    </div>
                                    <div className="max-h-56 overflow-auto rounded border border-border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-card text-muted-foreground">
                                                <tr>
                                                    <th className="text-left px-2 py-1 border-b border-border w-20">Row</th>
                                                    <th className="text-left px-2 py-1 border-b border-border">Message</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.errors.map((e, idx) => {
                                                    const sev = classifyError(e.message); // "error" | "warn"
                                                    const rowColor =
                                                        sev === "error"
                                                            ? "border-l-2 border-error bg-error/5"
                                                            : "border-l-2 border-warning bg-warning/5";
                                                    return (
                                                        <tr key={idx} className={`${rowColor}`}>
                                                            <td className="px-2 py-1 align-top border-b border-border text-foreground">{e.row}</td>
                                                            <td className="px-2 py-1 align-top border-b border-border">
                                                                <pre className="whitespace-pre-wrap break-words text-xs text-foreground">
                                                                    {typeof e.message === "string" ? e.message : JSON.stringify(e.message, null, 2)}
                                                                </pre>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
                    <button className="rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-white/5" onClick={onClose} disabled={busy}>
                        Close
                    </button>
                    {/* Single Validate button (works for initial or re-validate) */}
                    <button
                        className="rounded-xl px-3 py-2 text-sm bg-zinc-100 text-foreground hover:bg-zinc-200 disabled:opacity-60"
                        onClick={onValidate}
                        disabled={busy || !file}
                        title={!file ? "Choose a CSV file first" : undefined}
                    >
                        {result ? "Revalidate" : "Validate"}
                    </button>

                    {/* Apply only when there are no errors AND there is work to do */}
                    {canApply ? (
                        <button
                            className="rounded-xl px-3 py-2 text-sm bg-zinc-100 text-foreground hover:bg-zinc-200 disabled:opacity-60"
                            onClick={onApply}
                            disabled={busy || !file}
                        >
                            {scope === "products" ? "Upload Products" : "Upload Variants"}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
