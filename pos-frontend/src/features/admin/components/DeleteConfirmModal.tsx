// src/features/admin/components/DeleteConfirmModal.tsx
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

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

  const handleDelete = async () => {
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {message}
          </DialogDescription>
        </DialogHeader>

        {subject ? <Input value={subject} readOnly className="mt-3" /> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
