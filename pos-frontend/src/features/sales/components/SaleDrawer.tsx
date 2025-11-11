// pos-frontend/src/features/sales/components/SaleDrawer.tsx

import * as React from "react";

export function SaleDrawer(props: { openId: number|null; title: string; onClose: () => void; children: React.ReactNode }) {
  const { openId, title, onClose, children } = props;
  if (openId === null) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-zinc-900 border-l border-zinc-800 shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">{title}</div>
            <button className="rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/5" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="p-5 space-y-4 overflow-auto h-full">{children}</div>
      </div>
    </div>
  );
}
