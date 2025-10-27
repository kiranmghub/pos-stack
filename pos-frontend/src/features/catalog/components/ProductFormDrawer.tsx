import React from "react";
import { createProduct, updateProduct } from "../api";
import type { CreateProductDto, UpdateProductDto, ID } from "../types";
import { apiFetchJSON } from "@/lib/auth";

function Drawer({
  open,
  title,
  onClose,
  children,
  width = 560,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
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
          <button className="rounded-lg px-3 py-1 text-sm hover:bg-white/5" onClick={onClose}>
            Close
          </button>
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
}) {
  const isEdit = !!product?.id;

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
  const previewUrl =
    newImage
      ? URL.createObjectURL(newImage)
      : hideExisting
      ? ""
      : (product as any)?.image_file || form.image_url || "";

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
    }
  }, [open, product?.id]);

  // 🔑 Fetch product detail on Edit so preview + fields show server values (absolute URLs)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: UpdateProductDto & any = {
        name: form.name,
        code: form.code,
        category: form.category,
        description: form.description,
        active: form.active,
        image_url: form.image_url || "",
        tax_category: form.tax_category || "",
      };

      if ((form.attributes || "").trim()) {
        try {
          payload.attributes = JSON.parse(form.attributes as string);
        } catch {
          alert("Attributes must be valid JSON.");
          setBusy(false);
          return;
        }
      } else {
        payload.attributes = "{}";
      }

      if (newImage) payload.image_file = newImage;

      if (isEdit) {
        await updateProduct(product!.id!, payload);
      } else {
        await createProduct(payload);
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
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save product");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} title={isEdit ? "Edit Product" : "New Product"} onClose={onClose}>
      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Media (FIRST) */}
        <section className="space-y-3">
          <div className="text-sm font-medium">Product Image</div>

          {/* Full-width clickable image preview */}
          <div
            className="relative h-56 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 hover:bg-zinc-700/50 transition-colors"
            onClick={() => {
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
            }}
          />
        </section>

        {/* Essentials */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Code</label>
            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
              value={form.code || ""}
              onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
              value={form.category}
              onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
              placeholder="e.g., Electronics"
            />
          </div>

          <div className="flex items-center gap-2 pt-6">
            <input
              id="active"
              type="checkbox"
              className="h-4 w-4"
              checked={!!form.active}
              onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))}
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
            />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-white/5"
            onClick={onClose}
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
      </form>
    </Drawer>
  );
}
