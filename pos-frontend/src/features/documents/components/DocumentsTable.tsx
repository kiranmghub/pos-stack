// pos-frontend/src/features/documents/components/DocumentsTable.tsx
import React from "react";
import { Link } from "react-router-dom";
import { FileText, ExternalLink, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Document } from "../api/documents";

interface DocumentsTableProps {
  documents: Document[];
  loading: boolean;
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onOpenFile: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DocumentsTable({
  documents,
  loading,
  page,
  pageSize,
  count,
  onPageChange,
  onPageSizeChange,
  onOpenFile,
  onDelete,
}: DocumentsTableProps) {
  const lastPage = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Label</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Type</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">File</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Size</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Uploaded By</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Date</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Related POs</th>
              <th className="px-4 py-3 text-center text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>
                  Loading documents...
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>
                  No documents found.
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-border/60 hover:bg-muted/40 transition-colors"
                >
                  {/* Label */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <div className="font-medium text-foreground">{doc.label}</div>
                        {doc.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                            {doc.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-foreground">
                      {doc.doc_type || "OTHER"}
                    </span>
                  </td>

                  {/* File Name */}
                  <td className="px-4 py-3">
                    <div className="text-muted-foreground truncate max-w-xs">
                      {doc.file_name || "—"}
                    </div>
                  </td>

                  {/* Size */}
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatFileSize(doc.file_size)}
                  </td>

                  {/* Uploaded By */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {doc.uploaded_by?.username || "—"}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(doc.created_at)}
                  </td>

                  {/* Related POs */}
                  <td className="px-4 py-3">
                    {doc.related_pos && doc.related_pos.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {doc.related_pos.map((po) => (
                          <Link
                            key={po.id}
                            to={`/inventory?tab=purchase-orders&poId=${po.id}`}
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            PO #{po.po_number}
                            {po.link_type === "metadata" && (
                              <span className="text-xs text-muted-foreground">(matched)</span>
                            )}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFile(doc);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        title="View/Download document"
                      >
                        <Download className="h-3.5 w-3.5" />
                        View
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(doc);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/20 bg-card px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {count > 0 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, count)} of {count} documents
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-muted-foreground">
                Page {page} of {lastPage}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= lastPage}
                className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

