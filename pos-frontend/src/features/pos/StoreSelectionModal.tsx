// pos-frontend/src/features/pos/StoreSelectionModal.tsx
import React, { useState } from "react";
import { Store, Check, X } from "lucide-react";
import type { StoreLite } from "./api";

type Props = {
  open: boolean;
  stores: StoreLite[];
  onSelect: (storeId: number) => void;
  onCancel?: () => void;
};

export default function StoreSelectionModal({
  open,
  stores,
  onSelect,
  onCancel,
}: Props) {
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  if (!open) return null;

  const handleContinue = () => {
    if (selectedStoreId) {
      onSelect(selectedStoreId);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      if (onCancel) {
        onCancel();
      }
    }
  };

  const handleClose = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <Store className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Select Store</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose a store to access its register and start processing sales
          </p>
        </div>

        {/* Store list */}
        <div className="space-y-2 mb-6 max-h-[400px] overflow-y-auto">
          {stores.map((store) => {
            const isSelected = selectedStoreId === store.id;
            return (
              <button
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                className={`w-full rounded-lg border p-4 text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-medium text-foreground">{store.name}</div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Code: {store.code}
                    </div>
                    {store.description && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {store.description}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selectedStoreId}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

