import React from "react";
import { createProduct, updateProduct } from "../api";
import type { CreateProductDto, UpdateProductDto, ID } from "../types";
import { apiFetchJSON } from "@/lib/auth";
import { uploadProductImage, generateProductCode } from "../api";
import { useNotify } from "@/lib/notify";


function fmt(dt?: string) {
  if (!dt) return "";
  const d = new Date(dt);
  return isNaN(d as any) ? dt : d.toLocaleString();
}


function Drawer({
  open,
  title,
  onClose,
  children,
  width = 560,
  headerRight,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  headerRight?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="absolute right-0 top-0 h-full bg-zinc-900 text-zinc-100 shadow-2xl border-l border-zinc-800"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="flex items-center gap-2">
            {headerRight}
            <button className="rounded-lg px-3 py-1 text-sm hover:bg-white/5" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="h-[calc(100%-56px)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

type TaxCategory = { id: ID; name: string; code?: string };

export function ProductFormDrawer({
  open,
  onClose,
  product,
  mode: initialMode = "edit",
}: {
  open: boolean;
  onClose: () => void;
  product?: {
    id: ID;
    name?: string;
    code?: string;
    category?: string;
    description?: string;
    active?: boolean;
    image_file?: string | null;
    image_url?: string;
    attributes?: Record<string, unknown>;
    tax_category?: ID | null;
  };
  mode?: "view" | "edit";
}) {
  const isEdit = !!product?.id;
  const [mode, setMode] = React.useState<"view" | "edit">(initialMode);

  React.useEffect(() => setMode(initialMode), [initialMode]);
  // Force reset mode each time the drawer is opened with a new product or reopened
  React.useEffect(() => {
    if (open) {
      setMode(initialMode);
    }
  }, [open, initialMode, product?.id]);

  const isView = mode === "view";

  const { error, success } = useNotify();
  const [errors, setErrors] = React.useState<{ [k: string]: string | undefined }>({});


  const [form, setForm] = React.useState<CreateProductDto & {
    image_url?: string;
    attributes?: string;
    tax_category?: ID | "";
  }>({
    name: product?.name || "",
    code: product?.code || "",
    category: product?.category || "",
    description: product?.description || "",
    active: product?.active ?? true,
    image_file: null,
    image_url: product?.image_url || "",
    attributes: product?.attributes ? JSON.stringify(product?.attributes, null, 2) : "",
    tax_category: (product as any)?.tax_category ?? "",
  });

  const [busy, setBusy] = React.useState(false);
  const [taxes, setTaxes] = React.useState<TaxCategory[] | null>(null);
  const [taxFetchError, setTaxFetchError] = React.useState<string | null>(null);

  // image preview: prefer new file > existing server image > image_url text
  const [newImage, setNewImage] = React.useState<File | null>(null);
  const [hideExisting, setHideExisting] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string>("");

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Hydrate form when switching edit target
  React.useEffect(() => {
    setForm({
      name: product?.name || "",
      code: product?.code || "",
      category: product?.category || "",
      description: product?.description || "",
      active: product?.active ?? true,
      image_file: null,
      image_url: (product as any)?.image_url || "",
      attributes: (product as any)?.attributes ? JSON.stringify((product as any)?.attributes, null, 2) : "",
      tax_category: (product as any)?.tax_category ?? "",
    });
    setNewImage(null);
    setHideExisting(false);
    setErrors({});
  }, [product?.id]);

  // Reset when opening a brand-new form
  React.useEffect(() => {
    if (open && !product?.id) {
      setForm({
        name: "",
        code: "",
        category: "",
        description: "",
        active: true,
        image_file: null,
        image_url: "",
        attributes: "",
        tax_category: "",
      });
      setNewImage(null);
      setHideExisting(false);
      setErrors({});
    }
  }, [open, product?.id]);

  // 🔑 Fetch product detail on Edit so preview + fields show server values (absolute URLs)
  const [meta, setMeta] = React.useState<{ created_at?: string; updated_at?: string }>({});
  React.useEffect(() => {
    if (!open || !product?.id) return;
    (async () => {
      try {
        const detail = await apiFetchJSON(`/api/catalog/products/${product.id}/`);
        setForm((s) => ({
          ...s,
          name: detail.name || "",
          code: detail.code || "",
          category: detail.category || "",
          description: detail.description || "",
          active: detail.active ?? true,
          image_url: detail.image_url || detail.image_file || "",
          attributes: detail.attributes ? JSON.stringify(detail.attributes, null, 2) : "",
          tax_category: detail.tax_category || "",
        }));
        setNewImage(null);
        setHideExisting(false);
        setMeta({ created_at: detail.created_at, updated_at: detail.updated_at });
      } catch (err) {
        console.error("Failed to load product detail", err);
      }
    })();
  }, [open, product?.id]);

  // Load tax categories
  React.useEffect(() => {
    (async () => {
      try {
        setTaxFetchError(null);
        const res = await apiFetchJSON("/api/v1/catalog/tax_categories");
        setTaxes(Array.isArray(res?.results) ? res.results : res);
      } catch (e: any) {
        setTaxFetchError("No tax categories endpoint found; using manual ID input.");
        setTaxes(null);
      }
    })();
  }, []);

  // Keep a stable object URL for the thumbnail and revoke old ones (mirror Variant)
  React.useEffect(() => {
    if (newImage) {
      const url = URL.createObjectURL(newImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    // otherwise fall back to existing server image (if any) or typed URL
    const fallback =
      hideExisting
        ? ""
        : (product as any)?.image_file ||
          (product as any)?.image_url ||
          (typeof form.image_url === "string" ? form.image_url : "") ||
          "";
    setPreviewUrl(fallback);
  }, [newImage, hideExisting, product, form.image_url]);


  async function parseApiError(err: any) {
    if (err?.data) return err.data;
    if (err?.payload) return err.payload;
    if (err?.response?.data) return err.response.data;
    if (typeof err?.json === "function") { try { return await err.json(); } catch {} }
    if (typeof err?.response?.json === "function") { try { return await err.response.json(); } catch {} }
    const maybe = err?.message || err?.body || err?.responseText;
    if (typeof maybe === "string") { try { return JSON.parse(maybe); } catch {} }
    return null;
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // client-side required checks (our UI, not the browser)
    const missing: Record<string, string> = {};
    if (!form.name?.trim()) missing.name = "Name is required.";
    if (!form.code?.trim()) missing.code = "Code is required.";
    if (Object.keys(missing).length) {
      setErrors((prev) => ({ ...prev, ...missing, _non_field: undefined }));
      error("Please fix the highlighted fields."); // use useNotify()
      return;
    }
    setBusy(true);
    try {
      // 1) Build pure JSON payload (no File here)
      const payload: UpdateProductDto & any = {
        name: form.name,
        code: form.code,
        category: form.category,
        description: form.description,
        active: form.active,
        image_url: form.image_url || "",
        tax_category: form.tax_category || "",
        // ⚠️ Send attributes as a string; backend parses robustly
        attributes: (form.attributes || "").trim(),
      };

      // 2) Create/Update JSON first
      let saved: any;
      if (isEdit) {
        saved = await updateProduct(product!.id!, payload); // returns detail with id
      } else {
        saved = await createProduct(payload); // returns detail with id
      }

      // 3) If user picked a file, upload it via the image endpoint
      if (newImage) {
        const r = await uploadProductImage(saved.id, newImage);
        // update local preview immediately
        setForm((s) => ({ ...s, image_url: r?.image_url || s.image_url }));
        setNewImage(null);
      }

      // 4) Reset for new-product flow
      if (!isEdit) {
        setForm({
          name: "",
          code: "",
          category: "",
          description: "",
          active: true,
          image_file: null,
          image_url: "",
          attributes: "",
          tax_category: "",
        });
        setHideExisting(false);
      }

      // ✅ Dispatch event so ProductTable knows to refresh
      window.dispatchEvent(
        new CustomEvent("catalog:product:saved", {
          detail: { id: saved.id },
        })
      );

      success(
        isEdit
        ? (newImage ? "Product updated and image uploaded" : "Product updated")
        : (newImage ? "Product created and image uploaded" : "Product created")
      );

      onClose();
    } catch (err: any) {
      console.error("Product save failed", err);
      const data = await parseApiError(err);

      if (data && typeof data === "object") {
        const nf = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors;
        const codeMsg = Array.isArray(data.code) ? data.code[0] : data.code;
        const nameMsg = Array.isArray(data.name) ? data.name[0] : data.name;

        // Infer from set-level messages if needed
        const inferredCodeMsg =
          !codeMsg && nf && /(code|tenant[^,]*,?\s*code)/i.test(String(nf))
            ? "This code already exists within your tenant."
            : undefined;

        const inferredNameMsg =
          !nameMsg && nf && /(name|tenant[^,]*,?\s*name)/i.test(String(nf))
            ? "A product with this name already exists in your tenant."
            : undefined;

        setErrors({
          code: codeMsg || inferredCodeMsg,
          name: nameMsg || inferredNameMsg,
          _non_field: data.detail || (!inferredCodeMsg && !inferredNameMsg && nf) || undefined,
        });
      }

      error(
        (data && (data.detail || data.code?.[0] || data.code || data.name?.[0] || data.name)) ||
        "Could not save product."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    // Clear any stale inline errors before closing (exactly like Variant does)
    setErrors({});
    onClose();
  }



  return (
    <Drawer
        open={open}
        title={isView ? "Product Details" : isEdit ? "Edit Product" : "New Product"}
        onClose={handleClose}
        headerRight={
          isView ? (
            <button
              type="button"
              className="rounded-lg px-3 py-1 text-sm text-indigo-300 hover:bg-indigo-600/10"
              onClick={() => setMode("edit")}
            >
              Edit
            </button>
          ) : null
        }
      >
      <form className="space-y-6" onSubmit={handleSubmit} noValidate>


        {errors._non_field && (
          <div className="rounded-md border border-red-600 bg-red-950/50 p-2 text-sm text-red-200 mb-2">
            {errors._non_field}
          </div>
        )}

        {/* Media (FIRST) */}
        <section className="space-y-3">
          <div className="text-sm font-medium">Product Image</div>

          {/* Full-width clickable image preview */}
          <div
            className="relative h-56 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 hover:bg-zinc-700/50 transition-colors"
            onClick={() => {
              if (isView) return;
              if (!previewUrl) fileInputRef.current?.click();
            }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                className="h-full w-full object-cover cursor-pointer"
                alt="Product preview"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center cursor-pointer text-4xl text-zinc-500">
                +
              </div>
            )}

            {previewUrl && (
              !isView && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  className="rounded-lg bg-zinc-900/80 px-3 py-1 text-sm text-zinc-100 hover:bg-indigo-600 hover:text-white transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-zinc-900/80 px-3 py-1 text-sm text-zinc-100 hover:bg-red-600 hover:text-white transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNewImage(null);
                    setForm((s) => ({ ...s, image_url: "" }));
                    setHideExisting(true);
                  }}
                >
                  Delete
                </button>
              </div>
              )
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = (e.target.files && e.target.files[0]) || null;
              setNewImage(f);
              setHideExisting(false);
              if (fileInputRef.current) fileInputRef.current.value = ""; // mirror Variant behavior
            }}
            disabled={isView}
          />
        </section>

        {/* Essentials */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              className={`w-full rounded-xl border px-3 py-2 text-sm bg-zinc-900 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 ${
                errors.name ? "border-red-500" : "border-zinc-700"
              }`}
              value={form.name}
              onChange={(e) => {
                setForm((s) => ({ ...s, name: e.target.value }));
                setErrors((e2) => ({ ...e2, name: undefined, _non_field: undefined }));
              }}
              disabled={isView}
            />
            {errors.name && <div className="mt-1 text-xs text-red-400">{errors.name}</div>}
          </div>

          <div>
            {/* <label className="mb-1 block text-sm font-medium">Code</label> */}
             <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium">Code</span>
              {!isView && (
                <button
                  type="button"
                  className="text-xs text-indigo-300 hover:text-indigo-200"
                  onClick={async () => {
                    try {
                      const r = await generateProductCode(form.name || "");
                      setForm((s) => ({ ...s, code: r.code || s.code }));
                    } catch (e) { error("Failed to generate code"); }
                  }}
                >
                  Generate
                </button>
              )}
            </div>
            <input
              className={`w-full rounded-xl border px-3 py-2 text-sm bg-zinc-900 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 ${
                errors.code ? "border-red-500" : "border-zinc-700"
              }`}
              value={form.code || ""}
              onChange={(e) => {
                setForm((s) => ({ ...s, code: e.target.value }));
                setErrors((e2) => ({ ...e2, code: undefined, _non_field: undefined }));
              }}
              disabled={isView}
            />
            {errors.code && <div className="mt-1 text-xs text-red-400">{errors.code}</div>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
              value={form.category}
              onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
              placeholder="e.g., Electronics"
              disabled={isView}
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              id="active"
              type="checkbox"
              className="h-4 w-4"
              checked={!!form.active}
              onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))}
              disabled={isView}
            />
            <label htmlFor="active" className="text-sm">
              Active
            </label>
          </div>
        </section>

        {/* Tax */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tax Category</label>
            {taxes ? (
              <select
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                value={String(form.tax_category || "")}
                onChange={(e) => setForm((s) => ({ ...s, tax_category: e.target.value || "" }))}
                disabled={isView}
              >
                <option value="">— None —</option>
                {taxes.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {t.name}{t.code ? ` (${t.code})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <input
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  placeholder="Tax Category ID (optional)"
                  value={String(form.tax_category || "")}
                  onChange={(e) => setForm((s) => ({ ...s, tax_category: e.target.value }))}
                  disabled={isView}
                />
                {taxFetchError && <div className="text-xs text-zinc-400">{taxFetchError}</div>}
              </div>
            )}
          </div>
        </section>

        {/* Description & Attributes */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
              rows={4}
              value={form.description || ""}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              disabled={isView}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Attributes (JSON)</label>
            <textarea
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
              rows={6}
              placeholder='e.g. {"brand":"Acme","color":"black"}'
              value={form.attributes || ""}
              onChange={(e) => setForm((s) => ({ ...s, attributes: e.target.value }))}
              disabled={isView}
            />
          </div>
        </section>

        {isView && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="text-zinc-400">
                <div className="text-xs uppercase tracking-wide">Created</div>
                <div className="text-zinc-200">{fmt(meta.created_at)}</div>
              </div>
              <div className="text-zinc-400">
                <div className="text-xs uppercase tracking-wide">Updated</div>
                <div className="text-zinc-200">{fmt(meta.updated_at)}</div>
              </div>
            </div>
          </div>
        )}

        {!isView && (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-white/5"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              disabled={busy}
            >
              {isEdit ? "Save Changes" : "Create Product"}
            </button>
          </div>
        )}
      </form>
    </Drawer>
  );
}
