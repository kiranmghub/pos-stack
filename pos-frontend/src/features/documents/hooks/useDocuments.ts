// pos-frontend/src/features/documents/hooks/useDocuments.ts
import { useQuery } from "@tanstack/react-query";
import type {
  DocumentsListParams,
  DocumentsListResponse,
  Document,
} from "../api/documents";
import { listDocuments, getDocument, getDocumentFileUrl } from "../api/documents";

/**
 * Hook to list documents with pagination, filtering, and search.
 */
export function useDocuments(params: DocumentsListParams = {}) {
  // Extract refresh key if present (used internally to force refetch, not sent to API)
  const { _refresh, ...apiParams } = params as any;
  
  // Normalize params to ensure consistent query key serialization
  const normalizedParams = {
    page: apiParams.page || 1,
    page_size: apiParams.page_size || 25,
    search: apiParams.search || undefined,
    doc_type: apiParams.doc_type || undefined,
    ordering: apiParams.ordering || undefined,
  };
  
  // Build clean params for query key (without undefined values)
  const cleanParams: any = {
    page: normalizedParams.page,
    page_size: normalizedParams.page_size,
  };
  if (normalizedParams.search) cleanParams.search = normalizedParams.search;
  if (normalizedParams.doc_type) cleanParams.doc_type = normalizedParams.doc_type;
  if (normalizedParams.ordering) cleanParams.ordering = normalizedParams.ordering;
  
  // Build query key with refreshKey as a separate element (more reliable than nested in object)
  // React Query uses structural equality for arrays, so putting refreshKey as a separate element
  // makes it easier for React Query to detect the change
  const refreshKey = _refresh ?? 0; // Default to 0 if not provided (using nullish coalescing)
  const queryKey = ["documents", refreshKey, cleanParams];
  
  // Debug logging (can be enabled via browser console: window.__DEBUG_DOCUMENTS__ = true)
  if (typeof window !== "undefined" && (window as any).__DEBUG_DOCUMENTS__) {
    console.log("[useDocuments] Query key:", JSON.stringify(queryKey), "Refresh key:", refreshKey);
  }
  
  return useQuery<DocumentsListResponse>({
    queryKey,
    queryFn: () => {
      // Debug logging
      if (typeof window !== "undefined" && (window as any).__DEBUG_DOCUMENTS__) {
        console.log("[useDocuments] Fetching documents with params:", normalizedParams);
      }
      return listDocuments(normalizedParams);
    }, // API params don't include _refresh
    staleTime: 0, // Always refetch when invalidated
    refetchOnMount: "always", // Always refetch on mount (even if data exists)
    refetchOnWindowFocus: false, // Don't refetch on window focus
    gcTime: 0, // Don't cache (formerly cacheTime) - ensures fresh data
  });
}

/**
 * Hook to get a single document by ID.
 */
export function useDocument(id: number | null | undefined) {
  return useQuery<Document>({
    queryKey: ["documents", id],
    queryFn: () => {
      if (!id) throw new Error("Document ID is required");
      return getDocument(id);
    },
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get document file URL.
 * For S3: Returns signed URL with expiration.
 * For local: Returns endpoint URL.
 */
export function useDocumentFileUrl(documentId: number | null | undefined) {
  return useQuery<string | { file_url: string; expires_in?: number }>({
    queryKey: ["documents", documentId, "file-url"],
    queryFn: () => {
      if (!documentId) throw new Error("Document ID is required");
      return getDocumentFileUrl(documentId);
    },
    enabled: !!documentId,
    staleTime: 300000, // 5 minutes (signed URLs typically expire in 5-15 minutes)
  });
}

