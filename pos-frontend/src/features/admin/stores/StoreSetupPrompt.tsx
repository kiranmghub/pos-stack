// pos-frontend/src/features/admin/stores/StoreSetupPrompt.tsx
import React from "react";

type Props = {
  open: boolean;
  storeName: string;
  onYes: () => void;
  onNo: () => void;
};

export default function StoreSetupPrompt({ open, storeName, onYes, onNo }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50">
      <div className="w-[500px] rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-lg">Store Created Successfully!</h3>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-foreground">
            Your store <span className="font-semibold">"{storeName}"</span> has been created.
          </p>
          <p className="text-sm text-muted-foreground">
            Would you like to set up a register and user for this store? This will allow you to start processing sales right away.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <button
            onClick={onNo}
            className="px-4 py-2 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
          >
            No, Thanks
          </button>
          <button
            onClick={onYes}
            className="px-4 py-2 rounded-md bg-success hover:bg-success/90 text-success-foreground transition-colors"
          >
            Yes, Set Up
          </button>
        </div>
      </div>
    </div>
  );
}

