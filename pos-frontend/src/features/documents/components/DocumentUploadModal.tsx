// pos-frontend/src/features/documents/components/DocumentUploadModal.tsx
import React, { useState } from "react";
import { X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// Note: Select component may not exist, using native select for now
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
import { DocumentUploadDropzone } from "./DocumentUploadDropzone";
import { uploadDocument, type UploadDocumentParams } from "../api/documents";
import { useNotify } from "@/lib/notify";

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const DOC_TYPES = [
  "VENDOR_INVOICE",
  "LICENSE",
  "GST",
  "PAN",
  "TAX_RETURN",
  "CONTRACT",
  "OTHER",
];

export function DocumentUploadModal({
  open,
  onClose,
  onSuccess,
}: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const notify = useNotify();

  React.useEffect(() => {
    if (!open) {
      // Reset form when modal closes
      setFile(null);
      setLabel("");
      setDocType("");
      setDescription("");
      setUploading(false);
      setError("");
    }
  }, [open]);

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    if (!label.trim()) {
      setError("Label is required");
      return;
    }

    setError("");
    setUploading(true);

    try {
      const params: UploadDocumentParams = {
        file,
        label: label.trim(),
        doc_type: docType || undefined,
        description: description.trim() || undefined,
      };

      await uploadDocument(params);
      notify.success("Document uploaded successfully");

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to upload document";
      setError(errorMessage);
      notify.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-card text-foreground shadow-2xl border border-border max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Upload Document</h2>
          <button
            className="p-1 rounded hover:bg-white/5"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* File Upload */}
          <div>
            <Label className="text-sm font-medium mb-2 block">File *</Label>
            <DocumentUploadDropzone
              onFileSelect={setFile}
              selectedFile={file}
              onRemove={() => setFile(null)}
              disabled={uploading}
            />
          </div>

          {/* Label */}
          <div>
            <Label htmlFor="label" className="text-sm font-medium">
              Label *
            </Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Invoice ABC-001"
              disabled={uploading}
              className="mt-1"
              maxLength={160}
            />
          </div>

          {/* Document Type */}
          <div>
            <Label htmlFor="docType" className="text-sm font-medium">
              Document Type
            </Label>
            <select
              id="docType"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={uploading}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">None (optional)</option>
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={uploading}
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-destructive border border-destructive/40 bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || !file || !label.trim()}
          >
            {uploading ? (
              <>
                <Upload className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

