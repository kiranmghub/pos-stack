import React from "react";
import { createVariant, updateVariant } from "../api";
import type { CreateVariantDto, UpdateVariantDto, ID } from "../types";

export function VariantFormDrawer({ open, onClose, productId, variant }: { open: boolean; onClose: () => void; productId?: ID; variant?: { id: ID } & Partial<CreateVariantDto> }) {
  const isEdit = !!variant?.id;
  const [form, setForm] = React.useState<CreateVariantDto>({
    product: productId!,
    name: variant?.name || "",
    sku: variant?.sku || "",
    barcode: variant?.barcode || "",
    price: variant?.price ? Number(variant.price) : 0,
    cost: variant?.cost ? Number(variant.cost) : 0,
    on_hand: variant?.on_hand || 0,
    active: variant?.active ?? true,
    image_file: null,
  });

  React.useEffect(() => { setForm((s) => ({ ...s, product: productId! })); }, [productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (isEdit) await updateVariant(variant!.id, form as UpdateVariantDto);
      else await createVariant(form);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save variant");
    }
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[520px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-lg font-semibold">{isEdit ? "Edit Variant" : "New Variant"}</h3>
          <button className="rounded-lg px-3 py-1 text-sm hover:bg-zinc-100" onClick={onClose}>Close</button>
        </div>
        <form className="h-[calc(100%-56px)] overflow-y-auto p-4 space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">SKU</label>
              <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.sku || ""} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Barcode</label>
              <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.barcode || ""} onChange={(e) => setForm((s) => ({ ...s, barcode: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Price</label>
              <input type="number" step="0.01" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.price} onChange={(e) => setForm((s) => ({ ...s, price: parseFloat(e.target.value || "0") }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Cost</label>
              <input type="number" step="0.01" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.cost || 0} onChange={(e) => setForm((s) => ({ ...s, cost: parseFloat(e.target.value || "0") }))} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">On Hand</label>
              <input type="number" className="w-full rounded-xl border px-3 py-2 text-sm" value={form.on_hand || 0} onChange={(e) => setForm((s) => ({ ...s, on_hand: parseInt(e.target.value || "0") }))} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="vactive" type="checkbox" className="h-4 w-4" checked={!!form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} />
              <label htmlFor="vactive" className="text-sm">Active</label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50" onClick={onClose}>Cancel</button>
            <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">{isEdit ? "Save Changes" : "Create Variant"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}