import * as React from "react";
import {
  startReturnForSale,
  listReturnsForSale,
  getReturnById,      // NOTE: your api.ts should hit /api/v1/orders/returns/${id}
  listSales, getSale, listInventoryStores,
  deleteReturnItem, voidReturn, deleteReturn,
  type SaleRow, type SaleDetail
} from "./api";

import { useMoney } from "./useMoney";
import { SalesToolbar } from "./components/SalesToolbar";
import { SalesTable } from "./components/SalesTable";
import { SaleDrawer } from "./components/SaleDrawer";
import { SaleDrawerTabs } from "./components/SaleDrawerTabs";
import { SaleDetailsTab } from "./components/SaleDetailsTab";
import { ReturnsTab } from "./components/ReturnsTab";
import StartReturnWizardModal from "./components/StartReturnWizardModal";
import { useNotify } from "@/lib/notify"; // toasts, same as Catalogs :contentReference[oaicite:2]{index=2}



export default function SalesPage() {
  // Filters
  const [query, setQuery] = React.useState("");
  const [storeId, setStoreId] = React.useState<string>("");
  const [stores, setStores] = React.useState<Array<{ id: number; name: string; code?: string; is_active?: boolean }>>([]);
  const [status, setStatus] = React.useState<string>("");
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");

  // List / paging
  const [rows, setRows] = React.useState<SaleRow[]>([]);
  const [count, setCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [loading, setLoading] = React.useState(false);

  // Drawer + detail
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"details" | "returns">("details");

  // Returns tab (history + expansion)
  const [returns, setReturns] = React.useState<Array<any>>([]);
  const [loadingReturns, setLoadingReturns] = React.useState(false);
  const [expandedReturnId, setExpandedReturnId] = React.useState<number | null>(null);
  const [expandedReturn, setExpandedReturn] = React.useState<any | null>(null);
  const [loadingExpanded, setLoadingExpanded] = React.useState(false);

  const { success, error } = useNotify(); // toast helpers, consistent with Catalogs :contentReference[oaicite:4]{index=4}

  // Start Return wizard (full-screen)
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardDraft, setWizardDraft] = React.useState<null | { id: number; refund_total: number }>(null);


  const { safeMoney } = useMoney();

  // List loader
  async function load() {
    setLoading(true);
    try {
      const res = await listSales({
        page, page_size: pageSize, query,
        store_id: storeId || undefined,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setRows(res.results || []);
      setCount(Number(res.count || 0));
      const last = Math.max(1, Math.ceil(Number(res.count || 0) / pageSize));
      if (page > last) setPage(last);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, storeId, status, dateFrom, dateTo]);
  React.useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [query]);

  // Store dropdown
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listInventoryStores();
        if (!alive) return;
        const items = Array.isArray(data) ? data : [];
        setStores(items);
        if (storeId && !items.some(s => String(s.id) === String(storeId))) setStoreId("");
      } catch { /* keep usable */ }
    })();
    return () => { alive = false; };
  }, []);

  // Open drawer + fetch detail
  async function openDetail(id: number) {
    setOpenId(id);
    setActiveTab("details");
    setLoadingDetail(true);
    try { setDetail(await getSale(id)); } finally { setLoadingDetail(false); }
  }

  // Returns tab loader
  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!openId || activeTab !== "returns") return;
      setLoadingReturns(true);
      try {
        const data = await listReturnsForSale(openId);
        if (!alive) return;
        setReturns(Array.isArray(data) ? data : (data?.results ?? []));
      } finally {
        setLoadingReturns(false);
      }
    })();
    return () => { alive = false; };
  }, [openId, activeTab]);

  // Expand a return row
  const toggleExpandReturn = async (id: number) => {
    if (expandedReturnId === id) {
      setExpandedReturnId(null);
      setExpandedReturn(null);
      return;
    }
    setExpandedReturnId(id);
    setLoadingExpanded(true);
    try { setExpandedReturn(await getReturnById(id)); }
    catch { setExpandedReturn(null); }
    finally { setLoadingExpanded(false); }
  };


  const handleDeleteReturnItem = async (returnItemId: number) => {
    if (!expandedReturnId) return;
    if (!confirm("Delete this return line from the draft?")) return;
    await deleteReturnItem(returnItemId);
    // refresh expanded return and the list
    setExpandedReturn(await getReturnById(expandedReturnId));
    if (openId && activeTab === "returns") {
      const data = await listReturnsForSale(openId);
      setReturns(Array.isArray(data) ? data : (data?.results ?? []));
    }
  };

  const handleVoidReturn = async (returnId: number) => {
    if (!confirm("Void this draft return? This cannot be undone.")) return;
    await voidReturn(returnId);
    // refresh list; collapse expanded if it was this one
    if (expandedReturnId === returnId) {
      setExpandedReturnId(null);
      setExpandedReturn(null);
    }
    if (openId && activeTab === "returns") {
      const data = await listReturnsForSale(openId);
      setReturns(Array.isArray(data) ? data : (data?.results ?? []));
    }
  };

const handleDeleteDraftReturn = async (returnId: number) => {
  // Optimistic update: remove from UI immediately
  setReturns(prev => prev.filter(r => r.id !== returnId));

  // Collapse expanded panel if this was the open one
  if (expandedReturnId === returnId) {
    setExpandedReturnId(null);
    setExpandedReturn(null);
  }

  try {
    await deleteReturn(returnId);
    success("Draft return deleted.");
  } catch (e: any) {
    const msg = e?.message || e?.detail || "Unable to delete draft return.";
    error(msg);
    // On error, re-fetch to restore accurate state
    if (openId && activeTab === "returns") {
      const data = await listReturnsForSale(openId);
      setReturns(Array.isArray(data) ? data : (data?.results ?? []));
    }
    return;
  }

  // Background refresh to stay in sync with backend
  if (openId && activeTab === "returns") {
    const data = await listReturnsForSale(openId);
    setReturns(Array.isArray(data) ? data : (data?.results ?? []));
  }
};



  const lastPage = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <SalesToolbar
        query={query} setQuery={setQuery}
        storeId={storeId} setStoreId={setStoreId}
        stores={stores}
        status={status} setStatus={setStatus}
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
      />

      {/* Table */}
      <SalesTable
        rows={rows}
        loading={loading}
        page={page}
        pageSize={pageSize}
        count={count}
        lastPage={lastPage}
        onOpenDetail={openDetail}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />

      {/* Drawer */}
      <SaleDrawer
        openId={openId}
        title={`Sale ${detail?.receipt_no || openId}`}
        onClose={() => { setOpenId(null); setDetail(null); }}
      >
        <SaleDrawerTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "details" && detail && (
          <SaleDetailsTab
            detail={detail}
            safeMoney={safeMoney}
            onStartReturn={async () => {
              if (!detail) return;
              setWizardDraft(null); // no draft yet
              setWizardOpen(true);  // wizard will create draft on Save & Continue
            }}
          />
        )}

        {activeTab === "returns" && (
          <ReturnsTab
            returns={returns}
            loadingReturns={loadingReturns}
            expandedReturnId={expandedReturnId}
            onToggleExpand={toggleExpandReturn}
            expandedReturn={expandedReturn}
            loadingExpanded={loadingExpanded}
            safeMoney={safeMoney}
            onDeleteReturnItem={handleDeleteReturnItem}
            onVoidDraftReturn={handleVoidReturn}
            onDeleteDraftReturn={handleDeleteDraftReturn}
          />
        )}
      </SaleDrawer>

      <StartReturnWizardModal
        open={wizardOpen && !!detail}
        onClose={() => { setWizardOpen(false); setWizardDraft(null); }}
        saleDetail={detail}
        draft={wizardDraft}
        onFinalized={async () => {
          // refresh sale detail and returns list after finalize
          if (openId) setDetail(await getSale(openId));
          if (openId && activeTab === "returns") {
            const data = await listReturnsForSale(openId);
            setReturns(Array.isArray(data) ? data : (data?.results ?? []));
          }
        }}
      />

    </div>
  );
}
