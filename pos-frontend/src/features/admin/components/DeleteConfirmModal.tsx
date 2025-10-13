// src/features/admin/components/DeleteConfirmModal.tsx
import React, { useState } from "react";

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  subject?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export default function DeleteConfirmModal({
  open,
  title = "Confirm Delete",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  subject,
  onConfirm,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="w-[26rem] rounded-xl bg-slate-900 border border-slate-700 shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-red-400">{title}</h2>
        <p className="text-sm text-slate-300">
          {subject ? (
            <>
              Are you sure you want to delete <span className="font-semibold text-slate-100">"{subject}"</span>? This action cannot be undone.
            </>
          ) : (
            message
          )}
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={handleDelete}
            className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white"
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
