import React from "react";
import { createProduct, updateProduct } from "../api";
import type { CreateProductDto, UpdateProductDto, ID } from "../types";

function Drawer({ open, title, onClose, children, width = 540 }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full bg-white shadow-2xl" style={{ width }}>
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="rounded-lg px-3 py-1 text-sm hover:bg-zinc-100" onClick={onClose}>Close</button>
        </div>
        <div className="h-[calc(100%-56px)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function ProductFormDrawer({ open, onClose, product }: { open: boolean; onClose: () => void; product?: { id: ID } & Partial<CreateProductDto> }) {
  const isEdit = !!product?.id;
  const [form, setForm] = React.useState<CreateProductDto>({ name: product?.name || "", code: product?.code || "", category: product?.category || "", description: product?.description || "", active: product?.active ?? true, image_file: null });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setForm({ name: product?.name || "", code: product?.code || "", category: product?.category || "", description: product?.description || "", active: product?.active ?? true, image_file: null });
  }, [product?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isEdit) await updateProduct(product!.id!, form as UpdateProductDto);
      else await createProduct(form);
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
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Code / Barcode</label>
            <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.code || ""} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="active" type="checkbox" className="h-4 w-4" checked={!!form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} />
            <label htmlFor="active" className="text-sm">Active</label>
          </div>
        </section>

        <section>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea className="w-full rounded-xl border px-3 py-2 text-sm" rows={4} value={form.description || ""} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
        </section>

        <div className="flex justify-end gap-3">
          <button type="button" className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50" onClick={onClose}>Cancel</button>
          <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500" disabled={busy}>{isEdit ? "Save Changes" : "Create Product"}</button>
        </div>
      </form>
    </Drawer>
  );
}
