// pos-frontend/src/features/catalog/components/VariantFormDrawer.tsx
import React from "react";
import { listProducts, createVariant, updateVariant, getProduct } from "../api";
import type { CreateVariantDto, UpdateVariantDto, ID } from "../types";
import { apiFetchJSON } from "@/lib/auth";
import type { ProductListItem } from "../types";
import { DebouncedInput } from "./DebouncedInput";

type TaxCategory = { id: ID; name: string; code: string };

// --- fresh form builder ---
function emptyVariantForm(productId?: string | number) {
  return {
    product: productId ?? "",
    name: "",
    sku: "",
    barcode: "",
    price: 0,
    cost: 0,
    on_hand: 0,
    active: true,
    image_file: null as File | null,
    image_url: "",
    tax_category: "" as string | "" | any,
    uom: "each",
  };
}


export function VariantFormDrawer({
  open,
  onClose,
  productId,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  productId?: ID;
  variant?: { id: ID } & Partial<CreateVariantDto>;
}) {
  const isEdit = !!variant?.id;

// All variant fields from models
const [form, setForm] = React.useState<CreateVariantDto & {
  image_url?: string;
  tax_category?: ID | "";
  uom?: string;
}>(
  variant
    ? {
        product: (variant as any).product ?? (productId ?? ""),
        name: variant?.name || "",
        sku: variant?.sku || "",
        barcode: variant?.barcode || "",
        price: variant?.price ? Number(variant.price) : 0,
        cost: variant?.cost ? Number(variant.cost) : 0,
        on_hand: (variant as any)?.on_hand || 0,
        active: variant?.active ?? true,
        image_file: null,
        image_url: (variant as any)?.image_url || "",
        tax_category: (variant as any)?.tax_category ?? "",
        uom: (variant as any)?.uom || "each",
      }
    : emptyVariantForm(productId)
);


  const [taxes, setTaxes] = React.useState<TaxCategory[] | null>(null);
  const [taxFetchError, setTaxFetchError] = React.useState<string | null>(null);

  // === ADD PRODUCT PICKER STATE HERE ===
  const [productQuery, setProductQuery] = React.useState("");
  const [productOptions, setProductOptions] = React.useState<ProductListItem[]>([]);
  const [loadingProducts, setLoadingProducts] = React.useState(false);
  // === END ADDITION ===


  // Image preview: file > existing variant file/url > image_url text
  const [newImage, setNewImage] = React.useState<File | null>(null);
  const previewUrl =
    newImage ? URL.createObjectURL(newImage) : (variant as any)?.image_file || form.image_url || "";

  const [productLabel, setProductLabel] = React.useState<string>("");


  // React.useEffect(() => {
  //   setForm((s) => ({ ...s, product: productId! }));
  // }, [productId]);

  // === ADD PRODUCT FETCH EFFECT AFTER STATE ===
  React.useEffect(() => {
    if (productId) return; // locked mode; no need to fetch options
    let cancelled = false;
    (async () => {
      try {
        setLoadingProducts(true);
        const res = await listProducts({ search: productQuery, page_size: 25 });
        if (!cancelled) setProductOptions(res.results ?? res);
      } finally {
        setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, productQuery]);
  // === END ADDITION ===

  React.useEffect(() => {
    (async () => {
      try {
        setTaxFetchError(null);
        const res = await apiFetchJSON("/api/v1/catalog/tax_categories");
        setTaxes(Array.isArray(res?.results) ? res.results : res);
      } catch {
        setTaxFetchError("No tax categories endpoint found; use manual ID.");
        setTaxes(null);
      }
    })();
  }, []);

  // 3a) When drawer opens for a NEW variant, start clean
React.useEffect(() => {
  if (open && !variant) {
    setForm(emptyVariantForm(productId));
    setNewImage(null);
    setProductQuery("");
  }
}, [open, variant, productId]);

// 3b) When switching into EDIT mode (variant prop changes), hydrate from variant
React.useEffect(() => {
  if (variant) {
    setForm({
      product: (variant as any).product ?? (productId ?? ""),
      name: variant?.name || "",
      sku: variant?.sku || "",
      barcode: variant?.barcode || "",
      price: variant?.price ? Number(variant.price) : 0,
      cost: variant?.cost ? Number(variant.cost) : 0,
      on_hand: (variant as any)?.on_hand || 0,
      active: variant?.active ?? true,
      image_file: null,
      image_url: (variant as any)?.image_url || "",
      tax_category: (variant as any)?.tax_category ?? "",
      uom: (variant as any)?.uom || "each",
    });
    setNewImage(null);
  }
}, [variant, productId]);

// 3c) If productId changes while creating NEW, lock the product field accordingly
React.useEffect(() => {
  if (!variant && productId) {
    setForm((s) => ({ ...s, product: productId }));
  }
}, [variant, productId]);

// Show "Product Name (CODE)" in locked mode
React.useEffect(() => {
  let cancelled = false;

  async function loadProductLabel() {
    try {
      if (!productId) {
        setProductLabel("");
        return;
      }
      const d = await getProduct(productId);
      if (!cancelled) {
        const label = d?.code ? `${d.name} (${d.code})` : d?.name ?? `Product ID: ${String(productId)}`;
        setProductLabel(label);
      }
    } catch {
      if (!cancelled) setProductLabel(`Product ID: ${String(productId)}`);
    }
  }

  loadProductLabel();
  return () => { cancelled = true; };
}, [productId]);




  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!form.product) {
        alert("Please select a product for this variant.");
        return;
      }
      const payload: UpdateVariantDto & any = {
        ...form,
        image_file: newImage || null,
      };
      if (isEdit) {
        await updateVariant(variant!.id, payload);
      } else {
        await createVariant(payload);
      }
      // Refresh product list / row counts immediately
      window.dispatchEvent(new CustomEvent("catalog:product:saved", { detail: { id: form.product } }));
      handleClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save variant");
    }
  }

  function handleClose() {
    setForm(emptyVariantForm(productId));
    setNewImage(null);
    setProductQuery("");
    onClose();
  }


  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="absolute right-0 top-0 h-full w-[560px] bg-zinc-900 text-zinc-100 shadow-2xl border-l border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h3 className="text-lg font-semibold">{isEdit ? "Edit Variant" : "New Variant"}</h3>
          <button className="rounded-lg px-3 py-1 text-sm hover:bg-white/5" onClick={handleClose}>
            Close
          </button>
        </div>

        <form className="h-[calc(100%-56px)] overflow-y-auto p-4 space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Product selection */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Product</label>

              {productId ? (
                // Locked: show read-only selected product ID
                <input
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-400"
                  value={productLabel || `Product ID: ${String(productId)}`}
                  readOnly
                  title="This variant will be created for the selected product."
                />
              ) : (
                <div className="space-y-2">
                  <DebouncedInput
                    value={productQuery}
                    onChange={setProductQuery}
                    placeholder="Search products by name or code…"
                    className="w-full"
                  />
                  <select
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                    value={String(form.product || "")}
                    onChange={(e) => setForm((s) => ({ ...s, product: e.target.value }))}
                  >
                    <option value="">{loadingProducts ? "Loading…" : "— Select a product —"}</option>
                    {productOptions.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {p.name} {p.code ? `(${p.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">SKU</label>
              <input
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.sku || ""}
                onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Barcode</label>
              <input
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.barcode || ""}
                onChange={(e) => setForm((s) => ({ ...s, barcode: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Price</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.price}
                onChange={(e) => setForm((s) => ({ ...s, price: parseFloat(e.target.value || "0") }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Cost</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.cost || 0}
                onChange={(e) => setForm((s) => ({ ...s, cost: parseFloat(e.target.value || "0") }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Unit of Measure (UOM)</label>
              <input
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
                value={form.uom || "each"}
                onChange={(e) => setForm((s) => ({ ...s, uom: e.target.value }))}
                placeholder="each, case, lb, etc."
              />
            </div>

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
                      {t.name} ({t.code})
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

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Image URL (optional)</label>
                <input
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
                  value={form.image_url || ""}
                  onChange={(e) => setForm((s) => ({ ...s, image_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Upload Image (file)</label>
                <label className="flex h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-zinc-500">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setNewImage((e.target.files && e.target.files[0]) || null)}
                  />
                  Drag & drop or click to upload
                </label>
              </div>

              {(previewUrl || newImage) && (
                <div className="md:col-span-2">
                  <div className="mt-2 flex flex-wrap gap-2">
                    <div className="overflow-hidden rounded-xl border border-zinc-800">
                      {/* @ts-ignore */}
                      <img src={previewUrl} className="h-24 w-24 object-cover" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Initial On Hand</label>
              <input
                type="number"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.on_hand || 0}
                onChange={(e) => setForm((s) => ({ ...s, on_hand: parseInt(e.target.value || "0") }))}
              />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                id="vactive"
                type="checkbox"
                className="h-4 w-4"
                checked={!!form.active}
                onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))}
              />
              <label htmlFor="vactive" className="text-sm text-zinc-200">
                Active
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-100 hover:bg-white/5"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              {isEdit ? "Save Changes" : "Create Variant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
