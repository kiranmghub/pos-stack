// pos-frontend/src/features/catalog/components/ImageDropzone.tsx
import React from "react";

export function ImageDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  return (
    <label className="flex h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border/70 text-sm text-muted-foreground hover:border-primary/50">
      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(Array.from(e.target.files || []))} />
      Drag & drop or click to upload
    </label>
  );
}
