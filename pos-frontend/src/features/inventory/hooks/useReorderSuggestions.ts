// pos-frontend/src/features/inventory/hooks/useReorderSuggestions.ts
import { useQuery } from "@tanstack/react-query";
import {
  getReorderSuggestionsList,
  type ReorderSuggestionListParams,
} from "../api/reorderSuggestions";

/**
 * React Query hook for reorder suggestions list
 * Security: Tenant-scoped via API
 */
export function useReorderSuggestionsList(params: ReorderSuggestionListParams) {
  return useQuery({
    queryKey: ["inventory", "reorder-suggestions", params],
    queryFn: () => getReorderSuggestionsList(params),
    staleTime: 60000, // 60 seconds (suggestions don't change frequently)
  });
}

