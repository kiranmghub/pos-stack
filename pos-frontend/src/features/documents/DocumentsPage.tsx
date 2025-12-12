// pos-frontend/src/features/documents/DocumentsPage.tsx
import React, { useState, useEffect, useMemo } from "react";
import { useNotify } from "@/lib/notify";
import { apiFetch } from "@/lib/auth";
import { useDocuments } from "./hooks/useDocuments";
import { DocumentsTable } from "./components/DocumentsTable";
import { DocumentFilters } from "./components/DocumentFilters";
import { DocumentUploadModal } from "./components/DocumentUploadModal";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { deleteDocument, type Document } from "./api/documents";
import DeleteConfirmModal from "@/features/admin/components/DeleteConfirmModal";

export default function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("");
  const [ordering, setOrdering] = useState("-created_at");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<Document | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Refresh key to force React Query refetch

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Build query params object (memoized for stable reference)
  // Include refreshKey to force refetch when it changes
  const queryParams = useMemo(() => ({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    doc_type: docType || undefined,
    ordering: ordering || undefined,
    _refresh: refreshKey, // Hidden refresh key (won't be sent to API, just used for query key)
  }), [page, pageSize, debouncedSearch, docType, ordering, refreshKey]);

  // Fetch documents
  const { data, isLoading, error } = useDocuments(queryParams);

  const { success, error: notifyError } = useNotify();

  // Extract unique document types from results for filter dropdown
  const availableDocTypes = useMemo(() => {
    if (!data?.results) return [];
    const types = new Set<string>();
    data.results.forEach((doc) => {
      if (doc.doc_type) {
        types.add(doc.doc_type);
      }
    });
    return Array.from(types).sort();
  }, [data?.results]);

  // Handle file open/download
  const handleOpenFile = async (doc: Document) => {
    try {
      // Fetch the file with authentication using apiFetch
      const response = await apiFetch(doc.file_url);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to fetch file: ${response.status} ${errorText}`);
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = URL.createObjectURL(blob);
      
      // Open in new tab
      const newWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
      
      // Clean up blob URL after a delay (once the window has loaded it)
      if (newWindow) {
        newWindow.addEventListener("beforeunload", () => {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        });
        // Also clean up after 10 seconds as fallback
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } else {
        // If popup was blocked, revoke immediately
        URL.revokeObjectURL(blobUrl);
        notifyError("Please allow popups to view documents");
      }
    } catch (err: any) {
      console.error("Error opening file:", err);
      const errorMessage = err?.message || "Failed to open document";
      if (notifyError && typeof notifyError === "function") {
        notifyError(errorMessage);
      } else {
        console.error("Notification system not available:", errorMessage);
      }
    }
  };

  // Handle delete
  const handleDelete = (doc: Document) => {
    // Check if document is linked to POs before showing delete modal
    if (doc.related_pos && doc.related_pos.length > 0) {
      notifyError(
        `Cannot delete document. This document is linked to ${doc.related_pos.length} purchase order(s). Please remove the document from all purchase orders before deleting.`
      );
      return;
    }
    setDeletingDoc(doc);
  };

  const handleConfirmDelete = async () => {
    if (!deletingDoc) return;

    try {
      // Delete the document
      await deleteDocument(deletingDoc.id);
      
      // Show success notification
      success(`Document "${deletingDoc.label}" deleted successfully`);
      
      // Increment refresh key to trigger React Query refetch
      // This changes the query key (refreshKey is now a separate element in the query key array),
      // forcing React Query to treat it as a new query and refetch
      setRefreshKey(prev => {
        const newKey = prev + 1;
        console.log("[DocumentsPage] Refresh key changed:", prev, "->", newKey);
        return newKey;
      });
    } catch (error) {
      // Error handling is done in DeleteConfirmModal
      throw error;
    }
    
    // Note: DeleteConfirmModal will handle closing the modal via onClose callback in its finally block
  };

  // Show error
  useEffect(() => {
    if (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Failed to load documents. Please try again."
      );
    }
  }, [error, notifyError]);

  return (
    <div className="space-y-6">
      {/* Header with Upload Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all tenant-related documents, invoices, and files
          </p>
        </div>
        <Button onClick={() => setUploadModalOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Filters */}
      <DocumentFilters
        search={search}
        docType={docType}
        ordering={ordering}
        availableDocTypes={availableDocTypes}
        onSearchChange={setSearch}
        onDocTypeChange={(value) => {
          setDocType(value);
          setPage(1); // Reset to first page when filter changes
        }}
        onOrderingChange={setOrdering}
      />

      {/* Table */}
      <DocumentsTable
        documents={data?.results || []}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        count={data?.count || 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1); // Reset to first page when page size changes
        }}
        onOpenFile={handleOpenFile}
        onDelete={handleDelete}
      />

      {/* Upload Modal */}
      <DocumentUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => {
          // Increment refresh key to trigger React Query refetch
          setRefreshKey(prev => {
            const newKey = prev + 1;
            console.log("[DocumentsPage] Upload success - Refresh key changed:", prev, "->", newKey);
            return newKey;
          });
          setPage(1); // Reset to first page to see new upload
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deletingDoc}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone. The document will be permanently removed from your records."
        subject={
          deletingDoc
            ? `${deletingDoc.label}${deletingDoc.file_name ? ` (${deletingDoc.file_name})` : ""}`
            : undefined
        }
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingDoc(null)}
      />
    </div>
  );
}

