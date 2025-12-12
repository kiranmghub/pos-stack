// pos-frontend/src/features/documents/components/DocumentUploadDropzone.tsx
import React, { useCallback } from "react";
import { Upload, File, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentUploadDropzoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onRemove: () => void;
  disabled?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
}

export function DocumentUploadDropzone({
  onFileSelect,
  selectedFile,
  onRemove,
  disabled = false,
  accept = ".pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.tif,.bmp",
  maxSize = 10 * 1024 * 1024, // 10MB default
}: DocumentUploadDropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file size
      if (file.size > maxSize) {
        return `File size exceeds maximum of ${(maxSize / (1024 * 1024)).toFixed(0)}MB`;
      }

      // Check file type
      const extension = file.name.split(".").pop()?.toLowerCase();
      const allowedExtensions = [
        "pdf",
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "tiff",
        "tif",
        "bmp",
      ];

      if (!extension || !allowedExtensions.includes(extension)) {
        return "Invalid file type. Allowed: PDF, JPEG, PNG, GIF, WebP, TIFF, BMP";
      }

      return null;
    },
    [maxSize]
  );

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError("");
      onFileSelect(file);
    },
    [validateFile, onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [disabled, handleFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div className="space-y-2">
      {!selectedFile ? (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() =>
            !disabled && document.getElementById("file-input")?.click()
          }
        >
          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm font-medium mb-1">
            Drag and drop a file here, or click to select
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, JPEG, PNG, GIF, WebP, TIFF, BMP (max{" "}
            {(maxSize / (1024 * 1024)).toFixed(0)}MB)
          </p>
          <input
            id="file-input"
            type="file"
            accept={accept}
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
          <File className="h-8 w-8 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-50"
            aria-label="Remove file"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive border border-destructive/40 bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

