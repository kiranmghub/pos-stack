// pos-frontend/src/features/inventory/hooks/useLedger.ts
import { useQuery } from "@tanstack/react-query";
import { getLedgerList, type LedgerListParams } from "../api/ledger";

/**
 * React Query hook for ledger list
 * Security: Tenant-scoped via API
 */
export function useLedgerList(params: LedgerListParams) {
  return useQuery({
    queryKey: ["inventory", "ledger", params],
    queryFn: () => getLedgerList(params),
    staleTime: 30000, // 30 seconds
  });
}

