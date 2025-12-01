import * as React from "react";
import {
  startReturnForSale,
  listReturnsForSale,
  getReturnById,      // NOTE: your api.ts should hit /api/v1/orders/returns/${id}
  listSales, getSale, listInventoryStores, listReturns, listPayments, listRefunds, getPaymentSummary, getDiscountSummary, listDiscountSales,
  getTaxSummary, listTaxSales,
  deleteReturnItem, voidReturn, deleteReturn,
  type SaleRow, type SaleDetail, type ReturnListRow, type PaymentListRow, type RefundListRow, type DiscountRuleSummary, type TaxRuleSummary, type AuditLogEntry, type CurrencyInfo,
  listAuditLogs, getAuditLog,
} from "./api";

import { useMoney } from "./useMoney";
import { SalesToolbar } from "./components/SalesToolbar";
import { SalesTable } from "./components/SalesTable";
import { SaleDrawer } from "./components/SaleDrawer";
import { SaleDrawerTabs } from "./components/SaleDrawerTabs";
import { SaleDetailsTab } from "./components/SaleDetailsTab";
import { ReturnsTab } from "./components/ReturnsTab";
import { ReturnsToolbar } from "./components/ReturnsToolbar";
import { ReturnsManagementTable } from "./components/ReturnsManagementTable";
import { PaymentsToolbar } from "./components/PaymentsToolbar";
import { PaymentsTable } from "./components/PaymentsTable";
import { RefundsTable } from "./components/RefundsTable";
import { DiscountsToolbar } from "./components/DiscountsToolbar";
import { DiscountRulesTable } from "./components/DiscountRulesTable";
import { DiscountSalesTable } from "./components/DiscountSalesTable";
import { TaxesToolbar } from "./components/TaxesToolbar";
import { TaxRuleTable } from "./components/TaxRuleTable";
import { TaxSalesTable } from "./components/TaxSalesTable";
import StartReturnWizardModal from "./components/StartReturnWizardModal";
import { CustomersTab } from "./components/CustomersTab";
import { AuditFilters } from "./components/AuditFilters";
import { AuditTimeline } from "./components/AuditTimeline";
import { AuditDrawer } from "./components/AuditDrawer";
import { CustomerDrawer } from "./components/CustomerDrawer";
import { useNotify } from "@/lib/notify"; // toasts, same as Catalogs :contentReference[oaicite:2]{index=2}
import { getRole } from "@/lib/auth";
import { ensureAuthedFetch } from "@/components/AppShell";
import { CustomerEditDrawer } from "./components/CustomerEditDrawer";




type MainSalesTab =
  | "overview"
  | "returns"
  | "payments"
  | "discounts"
  | "customers"
  | "taxes"
  | "audit"
  | "analytics"
  | "risk"
  | "attachments"
  | "exports";

export default function SalesPage() {
  // Filters
  const [query, setQuery] = React.useState("");
  const [storeId, setStoreId] = React.useState<string>("");
  const [stores, setStores] = React.useState<Array<{ id: number; name: string; code?: string; is_active?: boolean }>>([]);
  const [status, setStatus] = React.useState<string>("");
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");
  const [returnQuery, setReturnQuery] = React.useState("");
  const [returnQueryFilter, setReturnQueryFilter] = React.useState("");
  const [returnStoreId, setReturnStoreId] = React.useState<string>("");
  const [returnStatus, setReturnStatus] = React.useState<string>("");
  const [returnDateFrom, setReturnDateFrom] = React.useState<string>("");
  const [returnDateTo, setReturnDateTo] = React.useState<string>("");
  const [paymentStoreId, setPaymentStoreId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentDateFrom, setPaymentDateFrom] = React.useState("");
  const [paymentDateTo, setPaymentDateTo] = React.useState("");
  const [refundStoreId, setRefundStoreId] = React.useState("");
  const [refundMethod, setRefundMethod] = React.useState("");
  const [refundDateFrom, setRefundDateFrom] = React.useState("");
  const [refundDateTo, setRefundDateTo] = React.useState("");
  const [discountStoreId, setDiscountStoreId] = React.useState("");
  const [discountDateFrom, setDiscountDateFrom] = React.useState("");
  const [discountDateTo, setDiscountDateTo] = React.useState("");

  // List / paging
  const [rows, setRows] = React.useState<SaleRow[]>([]);
  const [count, setCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [loading, setLoading] = React.useState(false);
  const [returnRows, setReturnRows] = React.useState<ReturnListRow[]>([]);
  const [returnCount, setReturnCount] = React.useState(0);
  const [returnPage, setReturnPage] = React.useState(1);
  const [returnPageSize, setReturnPageSize] = React.useState(20);
  const [loadingReturnList, setLoadingReturnList] = React.useState(false);
  const [returnsReloadKey, setReturnsReloadKey] = React.useState(0);
  const [paymentRows, setPaymentRows] = React.useState<PaymentListRow[]>([]);
  const [paymentCount, setPaymentCount] = React.useState(0);
  const [paymentPage, setPaymentPage] = React.useState(1);
  const [paymentPageSize, setPaymentPageSize] = React.useState(20);
  const [loadingPayments, setLoadingPayments] = React.useState(false);
  const [refundRows, setRefundRows] = React.useState<RefundListRow[]>([]);
  const [refundCount, setRefundCount] = React.useState(0);
  const [refundPage, setRefundPage] = React.useState(1);
  const [refundPageSize, setRefundPageSize] = React.useState(20);
  const [loadingRefunds, setLoadingRefunds] = React.useState(false);
  const [paymentSummary, setPaymentSummary] = React.useState<{
    payments_by_method: Record<string, string>;
    refunds_by_method: Record<string, string>;
    total_collected: string;
    total_refunded: string;
    net_total: string;
  } | null>(null);
  const [loadingPaymentSummary, setLoadingPaymentSummary] = React.useState(false);
  const [discountSummary, setDiscountSummaryData] = React.useState<{
    total_discount: string;
    rules: DiscountRuleSummary[];
  } | null>(null);
  const [loadingDiscountSummary, setLoadingDiscountSummary] = React.useState(false);
  const [selectedDiscountRule, setSelectedDiscountRule] = React.useState<DiscountRuleSummary | null>(null);
  const [discountSalesRows, setDiscountSalesRows] = React.useState<SaleRow[]>([]);
  const [discountSalesCount, setDiscountSalesCount] = React.useState(0);
  const [discountSalesPage, setDiscountSalesPage] = React.useState(1);
  const [discountSalesPageSize, setDiscountSalesPageSize] = React.useState(10);
  const [loadingDiscountSales, setLoadingDiscountSales] = React.useState(false);
  const [discountSearch, setDiscountSearch] = React.useState("");
  const [taxStoreId, setTaxStoreId] = React.useState("");
  const [taxDateFrom, setTaxDateFrom] = React.useState("");
  const [taxDateTo, setTaxDateTo] = React.useState("");
  const [taxSummary, setTaxSummary] = React.useState<{
    total_tax: string;
    taxed_sales: number;
    rules: TaxRuleSummary[];
  } | null>(null);
  const [loadingTaxSummary, setLoadingTaxSummary] = React.useState(false);
  const [taxRuleSearch, setTaxRuleSearch] = React.useState("");
  const [selectedTaxRule, setSelectedTaxRule] = React.useState<TaxRuleSummary | null>(null);
  const [taxSalesRows, setTaxSalesRows] = React.useState<SaleRow[]>([]);
  const [taxSalesCount, setTaxSalesCount] = React.useState(0);
  const [taxSalesPage, setTaxSalesPage] = React.useState(1);
  const [taxSalesPageSize, setTaxSalesPageSize] = React.useState(10);
  const [loadingTaxSales, setLoadingTaxSales] = React.useState(false);
  const [auditAction, setAuditAction] = React.useState("");
  const [auditSeverity, setAuditSeverity] = React.useState("");
  const [auditDateFrom, setAuditDateFrom] = React.useState("");
  const [auditDateTo, setAuditDateTo] = React.useState("");
  const [auditPage, setAuditPage] = React.useState(1);
  const [auditPageSize, setAuditPageSize] = React.useState(20);
  const [auditCount, setAuditCount] = React.useState(0);
  const [auditLogs, setAuditLogs] = React.useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = React.useState(false);
  const [selectedAudit, setSelectedAudit] = React.useState<AuditLogEntry | null>(null);

  // Drawer + detail
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<SaleDetail | null>(null);
  const [customersRefreshKey, setCustomersRefreshKey] = React.useState(0);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"details" | "returns">("details");
  const [mainTab, setMainTab] = React.useState<MainSalesTab>("overview");
  const [editingCustomerId, setEditingCustomerId] = React.useState<number | null>(null);
  const [openCustomerId, setOpenCustomerId] = React.useState<number | null>(null);

  const role = (getRole() || "").toLowerCase();
  const canViewPayments = React.useMemo(
    () => ["owner", "admin", "finance"].includes(role),
    [role]
  );
  const canViewDiscounts = React.useMemo(
    () => ["owner", "admin", "manager"].includes(role),
    [role]
  );
  const canViewTaxes = React.useMemo(
    () => ["owner", "admin"].includes(role),
    [role]
  );
  const canViewAudit = React.useMemo(
    () => ["owner", "admin", "auditor"].includes(role),
    [role]
  );

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

  const [currency, setCurrency] = React.useState<CurrencyInfo>({ code: "USD", symbol: "$", precision: 2 });
  const { safeMoney } = useMoney(currency);

  React.useEffect(() => {
    if (
      (mainTab === "payments" && !canViewPayments) ||
      (mainTab === "discounts" && !canViewDiscounts) ||
      (mainTab === "taxes" && !canViewTaxes) ||
      (mainTab === "audit" && !canViewAudit)
    ) {
      setMainTab("overview");
    }
  }, [canViewPayments, canViewDiscounts, canViewTaxes, canViewAudit, mainTab]);

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
      const cur = (res as any).currency || (res.results && res.results[0]?.currency) || null;
      if (cur) {
        setCurrency({
          code: cur.code || cur.currency_code || "USD",
          symbol: cur.symbol || undefined,
          precision: cur.precision ?? currency.precision ?? 2,
        });
      } else if (res.results?.[0]?.currency_code) {
        setCurrency((prev) => ({ ...prev, code: res.results[0].currency_code || prev.code }));
      }
      const last = Math.max(1, Math.ceil(Number(res.count || 0) / pageSize));
      if (page > last) setPage(last);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, storeId, status, dateFrom, dateTo]);
  React.useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [query]);
  React.useEffect(() => {
    if (mainTab !== "returns") return;
    const t = setTimeout(() => {
      setReturnPage(1);
      setReturnQueryFilter(returnQuery);
    }, 250);
    return () => clearTimeout(t);
  }, [returnQuery, mainTab]);

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
    try {
      const d = await getSale(id);
      setDetail(d);
      const cur = (d as any).currency || (d as any).receipt_data?.currency || null;
      if (cur) {
        setCurrency({
          code: cur.code || cur.currency_code || "USD",
          symbol: cur.symbol || undefined,
          precision: cur.precision ?? currency.precision ?? 2,
        });
      } else if ((d as any).currency_code) {
        setCurrency((prev) => ({ ...prev, code: (d as any).currency_code || prev.code }));
      }
    } finally { setLoadingDetail(false); }
  }

  // Open drawer + jump directly to Returns tab
  async function openReturns(id: number) {
    await openDetail(id);       // loads detail & opens drawer
    setActiveTab("returns");    // then switch to Returns tab
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

  React.useEffect(() => {
    if (mainTab !== "returns") return;
    let alive = true;
    setLoadingReturnList(true);
    (async () => {
      try {
        const data = await listReturns({
          page: returnPage,
          page_size: returnPageSize,
          query: returnQueryFilter || undefined,
          store_id: returnStoreId || undefined,
          status: returnStatus || undefined,
          date_from: returnDateFrom || undefined,
          date_to: returnDateTo || undefined,
        });
        if (!alive) return;
        setReturnRows(data.results || []);
        setReturnCount(Number(data.count || 0));
        const total = Number(data.count || 0);
        const last = Math.max(1, Math.ceil(total / returnPageSize));
        if (returnPage > last) setReturnPage(last);
      } finally {
        if (alive) setLoadingReturnList(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mainTab, returnPage, returnPageSize, returnStoreId, returnStatus, returnDateFrom, returnDateTo, returnQueryFilter, returnsReloadKey]);

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

  const handleVoidReturn = async (returnId: number, notify = true) => {
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
    setReturnsReloadKey((k) => k + 1);
    if (notify) success("Return voided.");
  };

  const handleDeleteDraftReturn = async (returnId: number, notify = true) => {
    // Optimistic update: remove from UI immediately
    setReturns(prev => prev.filter(r => r.id !== returnId));

    // Collapse expanded panel if this was the open one
    if (expandedReturnId === returnId) {
      setExpandedReturnId(null);
      setExpandedReturn(null);
    }

    try {
      await deleteReturn(returnId);
      if (notify) success("Draft return deleted.");
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
    setReturnsReloadKey((k) => k + 1);
  };

  const handleOpenReturnRow = async (row: ReturnListRow) => {
    await openDetail(row.sale);
    setActiveTab("returns");
    setExpandedReturnId(row.id);
    setLoadingExpanded(true);
    try {
      setExpandedReturn(await getReturnById(row.id));
    } catch {
      setExpandedReturn(null);
    } finally {
      setLoadingExpanded(false);
    }
  };

  const handleResumeDraft = async (row: ReturnListRow) => {
    setWizardDraft({ id: row.id, refund_total: Number(row.refund_total || 0) });
    await handleOpenReturnRow(row);
    setWizardOpen(true);
  };

  const handleOpenPaymentRow = async (row: PaymentListRow) => {
    await openDetail(row.sale_id);
    setActiveTab("details");
  };

  const handleStartRefundFromPayment = async (row: PaymentListRow) => {
    await openDetail(row.sale_id);
    setWizardDraft(null);
    setWizardOpen(true);
  };

  const handleCopyPaymentReference = async (row: PaymentListRow) => {
    if (!row.txn_ref) {
      error("No reference on this payment.");
      return;
    }
    try {
      await navigator.clipboard.writeText(row.txn_ref);
      success("Reference copied.");
    } catch {
      error("Could not copy reference.");
    }
  };

  const handleOpenRefundRow = async (row: RefundListRow) => {
    await openDetail(row.sale_id);
    setActiveTab("returns");
    setExpandedReturnId(row.return_ref_id);
    setLoadingExpanded(true);
    try {
      setExpandedReturn(await getReturnById(row.return_ref_id));
    } catch {
      setExpandedReturn(null);
    } finally {
      setLoadingExpanded(false);
    }
  };

  const handleOpenRefundSale = async (row: RefundListRow) => {
    await openDetail(row.sale_id);
    setActiveTab("details");
  };

  const handleOpenDiscountSale = async (row: SaleRow) => {
    await openDetail(row.id);
  };

  const handleSelectAuditEntry = async (entry: AuditLogEntry) => {
    try {
      const fresh = await getAuditLog(entry.id);
      setSelectedAudit(fresh);
    } catch {
      setSelectedAudit(entry);
    }
  };

  const handleCopyRefundReference = async (row: RefundListRow) => {
    if (!row.external_ref) {
      error("No reference on this refund.");
      return;
    }
    try {
      await navigator.clipboard.writeText(row.external_ref);
      success("Reference copied.");
    } catch {
      error("Could not copy reference.");
    }
  };

  React.useEffect(() => {
    if (mainTab !== "discounts" || !canViewDiscounts) return;
    let alive = true;
    setLoadingDiscountSummary(true);
    (async () => {
      try {
        const data = await getDiscountSummary({
          store_id: discountStoreId || undefined,
          date_from: discountDateFrom || undefined,
          date_to: discountDateTo || undefined,
        });
        if (!alive) return;
        setDiscountSummaryData(data);
      } finally {
        if (alive) setLoadingDiscountSummary(false);
      }
    })();
    return () => { alive = false; };
  }, [mainTab, canViewDiscounts, discountStoreId, discountDateFrom, discountDateTo]);

  React.useEffect(() => {
    if (mainTab !== "discounts" || !canViewDiscounts || !selectedDiscountRule) return;
    let alive = true;
    setLoadingDiscountSales(true);
    (async () => {
      try {
        const data = await listDiscountSales({
          rule_code: selectedDiscountRule.code,
          store_id: discountStoreId || undefined,
          date_from: discountDateFrom || undefined,
          date_to: discountDateTo || undefined,
          page: discountSalesPage,
          page_size: discountSalesPageSize,
        });
        if (!alive) return;
        setDiscountSalesRows(data.results || []);
        setDiscountSalesCount(Number(data.count || 0));
      } catch {
        if (!alive) return;
        setDiscountSalesRows([]);
        setDiscountSalesCount(0);
      } finally {
        if (alive) setLoadingDiscountSales(false);
      }
    })();
    return () => { alive = false; };
  }, [
    mainTab,
    canViewDiscounts,
    selectedDiscountRule,
    discountStoreId,
    discountDateFrom,
    discountDateTo,
    discountSalesPage,
    discountSalesPageSize,
  ]);

  React.useEffect(() => {
    if (mainTab !== "taxes" || !canViewTaxes) return;
    let alive = true;
    setLoadingTaxSummary(true);
    (async () => {
      try {
        const data = await getTaxSummary({
          store_id: taxStoreId || undefined,
          date_from: taxDateFrom || undefined,
          date_to: taxDateTo || undefined,
        });
        if (!alive) return;
        setTaxSummary(data);
      } finally {
        if (alive) setLoadingTaxSummary(false);
      }
    })();
    return () => { alive = false; };
  }, [mainTab, canViewTaxes, taxStoreId, taxDateFrom, taxDateTo]);

  React.useEffect(() => {
    if (mainTab !== "taxes" || !canViewTaxes || !selectedTaxRule) return;
    let alive = true;
    setLoadingTaxSales(true);
    (async () => {
      try {
        const data = await listTaxSales({
          rule_code: selectedTaxRule.code,
          store_id: taxStoreId || undefined,
          date_from: taxDateFrom || undefined,
          date_to: taxDateTo || undefined,
          page: taxSalesPage,
          page_size: taxSalesPageSize,
        });
        if (!alive) return;
        setTaxSalesRows(data.results || []);
        setTaxSalesCount(Number(data.count || 0));
      } finally {
        if (alive) setLoadingTaxSales(false);
      }
    })();
    return () => { alive = false; };
  }, [
    mainTab,
    canViewTaxes,
    selectedTaxRule,
    taxStoreId,
    taxDateFrom,
    taxDateTo,
    taxSalesPage,
    taxSalesPageSize,
  ]);

  React.useEffect(() => {
    if (mainTab !== "audit" || !canViewAudit) return;
    let alive = true;
    setLoadingAudit(true);
    (async () => {
      try {
        const data = await listAuditLogs({
          action: auditAction || undefined,
          severity: auditSeverity || undefined,
          date_from: auditDateFrom || undefined,
          date_to: auditDateTo || undefined,
          page: auditPage,
          page_size: auditPageSize,
        });
        if (!alive) return;
        setAuditLogs(data.results || []);
        setAuditCount(Number(data.count || 0));
      } finally {
        if (alive) setLoadingAudit(false);
      }
    })();
    return () => { alive = false; };
  }, [mainTab, canViewAudit, auditAction, auditSeverity, auditDateFrom, auditDateTo, auditPage, auditPageSize]);

  const latestDraft = React.useMemo(
    () => returnRows.find((row) => row.status === "draft"),
    [returnRows]
  );

  const returnDraftCount = React.useMemo(
    () => returnRows.filter((row) => row.status === "draft").length,
    [returnRows]
  );
  const returnFinalizedCount = React.useMemo(
    () => returnRows.filter((row) => row.status === "finalized").length,
    [returnRows]
  );
  const returnVoidCount = React.useMemo(
    () => returnRows.filter((row) => row.status === "void").length,
    [returnRows]
  );
  const returnRefundTotal = React.useMemo(
    () => returnRows.reduce((sum, row) => sum + Number(row.refund_total || 0), 0),
    [returnRows]
  );

  const paymentTotalsByMethod = React.useMemo(() => {
    const base = paymentSummary?.payments_by_method || {};
    const result: Record<string, number> = {};
    Object.entries(base).forEach(([k, v]) => { result[k] = Number(v || 0); });
    return result;
  }, [paymentSummary]);

  const refundTotalsByMethod = React.useMemo(() => {
    const base = paymentSummary?.refunds_by_method || {};
    const result: Record<string, number> = {};
    Object.entries(base).forEach(([k, v]) => { result[k] = Number(v || 0); });
    return result;
  }, [paymentSummary]);

  const paymentTotalCollected = Number(paymentSummary?.total_collected || 0);
  const refundTotalAmount = Number(paymentSummary?.total_refunded || 0);
  const netPaymentTotal = Number(paymentSummary?.net_total || 0);
  const totalDiscountAmount = Number(discountSummary?.total_discount || 0);
  const filteredDiscountRules = React.useMemo(() => {
    const rules = discountSummary?.rules || [];
    const q = discountSearch.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((rule) => rule.name.toLowerCase().includes(q) || rule.code.toLowerCase().includes(q));
  }, [discountSummary, discountSearch]);
  const filteredTaxRules = React.useMemo(() => {
    const q = taxRuleSearch.trim().toLowerCase();
    const rules = taxSummary?.rules || [];
    if (!q) return rules;
    return rules.filter(
      (rule) => rule.name.toLowerCase().includes(q) || rule.code.toLowerCase().includes(q)
    );
  }, [taxSummary, taxRuleSearch]);

  const buildPaymentsQuery = React.useCallback(
    (kind: "payments" | "refunds") => {
      const params = new URLSearchParams();
      params.set("kind", kind);
      if (kind === "payments") {
        if (paymentStoreId) params.set("store_id", paymentStoreId);
        if (paymentMethod) params.set("method", paymentMethod);
        if (paymentDateFrom) params.set("date_from", paymentDateFrom);
        if (paymentDateTo) params.set("date_to", paymentDateTo);
      } else {
        if (refundStoreId) params.set("store_id", refundStoreId);
        if (refundMethod) params.set("method", refundMethod);
        if (refundDateFrom) params.set("date_from", refundDateFrom);
        if (refundDateTo) params.set("date_to", refundDateTo);
      }
      return params.toString();
    },
    [paymentStoreId, paymentMethod, paymentDateFrom, paymentDateTo, refundStoreId, refundMethod, refundDateFrom, refundDateTo]
  );

  const handleExportPayments = async (kind: "payments" | "refunds") => {
    try {
      const qs = buildPaymentsQuery(kind);
      const res = await ensureAuthedFetch(`/api/v1/orders/payments/export?${qs}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    } catch {
      error("Could not export file.");
    }
  };

  const handleDiscountExport = async (kind: "summary" | "sales", ruleCode?: string) => {
    try {
      if (kind === "sales" && !ruleCode) {
        error("Select a rule to export sales.");
        return;
      }
      const params = new URLSearchParams();
      if (kind === "summary") {
        if (discountStoreId) params.set("store_id", discountStoreId);
        if (discountDateFrom) params.set("date_from", discountDateFrom);
        if (discountDateTo) params.set("date_to", discountDateTo);
      } else {
        params.set("rule_code", ruleCode!);
        if (discountStoreId) params.set("store_id", discountStoreId);
        if (discountDateFrom) params.set("date_from", discountDateFrom);
        if (discountDateTo) params.set("date_to", discountDateTo);
      }
      params.set("kind", kind);
      const res = await ensureAuthedFetch(`/api/v1/orders/discounts/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "summary" ? "discount_summary.csv" : `discount_sales_${ruleCode}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 2000);
    } catch {
      error("Could not export discounts.");
    }
  };

  React.useEffect(() => {
    if (mainTab !== "payments") return;
    let alive = true;
    setLoadingPayments(true);
    (async () => {
      try {
        const data = await listPayments({
          page: paymentPage,
          page_size: paymentPageSize,
          store_id: paymentStoreId || undefined,
          method: paymentMethod || undefined,
          date_from: paymentDateFrom || undefined,
          date_to: paymentDateTo || undefined,
        });
        if (!alive) return;
        setPaymentRows(data.results || []);
        setPaymentCount(Number(data.count || 0));
        const last = Math.max(1, Math.ceil(Number(data.count || 0) / paymentPageSize));
        if (paymentPage > last) setPaymentPage(last);
      } finally {
        if (alive) setLoadingPayments(false);
      }
    })();
    return () => { alive = false; };
  }, [mainTab, paymentPage, paymentPageSize, paymentStoreId, paymentMethod, paymentDateFrom, paymentDateTo]);

  React.useEffect(() => {
    if (mainTab !== "payments") return;
    let alive = true;
    setLoadingRefunds(true);
    (async () => {
      try {
        const data = await listRefunds({
          page: refundPage,
          page_size: refundPageSize,
          store_id: refundStoreId || undefined,
          method: refundMethod || undefined,
          date_from: refundDateFrom || undefined,
          date_to: refundDateTo || undefined,
        });
        if (!alive) return;
        setRefundRows(data.results || []);
        setRefundCount(Number(data.count || 0));
        const last = Math.max(1, Math.ceil(Number(data.count || 0) / refundPageSize));
        if (refundPage > last) setRefundPage(last);
      } finally {
        if (alive) setLoadingRefunds(false);
      }
    })();
    return () => { alive = false; };
  }, [mainTab, refundPage, refundPageSize, refundStoreId, refundMethod, refundDateFrom, refundDateTo]);

  React.useEffect(() => {
    if (mainTab !== "payments") return;
    let alive = true;
    setLoadingPaymentSummary(true);
    (async () => {
      try {
        const data = await getPaymentSummary({
          store_id: paymentStoreId || undefined,
          method: paymentMethod || undefined,
          date_from: paymentDateFrom || undefined,
          date_to: paymentDateTo || undefined,
        });
        if (!alive) return;
        setPaymentSummary(data);
      } catch {
        if (!alive) return;
        setPaymentSummary(null);
      } finally {
        if (alive) setLoadingPaymentSummary(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mainTab, paymentStoreId, paymentMethod, paymentDateFrom, paymentDateTo]);



  const lastPage = Math.max(1, Math.ceil(count / pageSize));
  const returnLastPage = Math.max(1, Math.ceil(returnCount / returnPageSize));
  const paymentLastPage = Math.max(1, Math.ceil(paymentCount / paymentPageSize));
  const refundLastPage = Math.max(1, Math.ceil(refundCount / refundPageSize));

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-background">
    <div className="space-y-4 px-4 py-6">
      {/* Main tabs per roadmap */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-background/70 p-1">
        {[
          { id: "overview", label: "Overview", ready: true },
          { id: "returns", label: "Returns", ready: true },
          { id: "payments", label: "Payments", ready: canViewPayments },
          { id: "discounts", label: "Discounts", ready: canViewDiscounts },
          { id: "customers", label: "Customers", ready: true },
          { id: "taxes", label: "Taxes", ready: canViewTaxes },
          { id: "audit", label: "Audit", ready: canViewAudit },
          { id: "analytics", label: "Analytics", ready: false },
          { id: "risk", label: "Risk", ready: false },
          { id: "attachments", label: "Attachments", ready: false },
          { id: "exports", label: "Exports", ready: false },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => tab.ready && setMainTab(tab.id as MainSalesTab)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mainTab === tab.id
              ? "bg-blue-600 text-white shadow"
              : tab.ready
                ? "text-muted-foreground hover:bg-white/5"
                : "text-muted-foreground cursor-not-allowed"
              }`}
            disabled={!tab.ready}
          >
            {tab.label}
            {!tab.ready && (
              <span className="ml-1 text-[10px] uppercase tracking-wide">
                {tab.id === "payments" ? "locked" : "soon"}
              </span>
            )}
          </button>
        ))}
      </div>

      {mainTab === "overview" && (
        <>
          <SalesToolbar
            query={query} setQuery={setQuery}
            storeId={storeId} setStoreId={setStoreId}
            stores={stores}
            status={status} setStatus={setStatus}
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
          />

          {rows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/60 border border-border rounded-xl p-4">
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Sales</div>
                <div className="text-lg font-semibold text-foreground">
                  {safeMoney(rows.reduce((sum, r) => sum + Number(r.total || 0), 0))}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Tax</div>
                <div className="text-lg font-semibold text-blue-300">
                  {safeMoney(rows.reduce((sum, r) => sum + Number(r.tax_total || 0), 0))}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Refunded</div>
                <div className="text-lg font-semibold text-amber-300">
                  {safeMoney(
                    rows.reduce((sum, r) => sum + (r.total_returns > 0 ? 1 : 0), 0)
                  )}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipts</div>
                <div className="text-lg font-semibold text-foreground">{rows.length}</div>
              </div>
            </div>
          )}

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
            onOpenReturns={openReturns}
            safeMoney={safeMoney}
          />
        </>
      )}

      {mainTab === "returns" && (
        <div className="space-y-3">
          <div className="grid gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground md:grid-cols-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Drafts (page)</div>
              <div className="mt-1 text-2xl font-semibold text-amber-200 tabular-nums">{returnDraftCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Finalized (page)</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-200 tabular-nums">{returnFinalizedCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Void (page)</div>
              <div className="mt-1 text-2xl font-semibold text-rose-200 tabular-nums">{returnVoidCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Refund total (page)</div>
              <div className="mt-1 text-2xl font-semibold text-blue-200 tabular-nums">{safeMoney(returnRefundTotal)}</div>
            </div>
          </div>

          <ReturnsToolbar
            query={returnQuery}
            setQuery={setReturnQuery}
            storeId={returnStoreId}
            setStoreId={setReturnStoreId}
            stores={stores}
            status={returnStatus}
            setStatus={setReturnStatus}
            dateFrom={returnDateFrom}
            setDateFrom={setReturnDateFrom}
            dateTo={returnDateTo}
            setDateTo={setReturnDateTo}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {[
                { label: "All", value: "" },
                { label: "Drafts", value: "draft" },
                { label: "Finalized", value: "finalized" },
                { label: "Void", value: "void" },
              ].map((chip) => (
                <button
                  key={chip.value || "all"}
                  type="button"
                  onClick={() => setReturnStatus(chip.value)}
                  className={`rounded-full px-3 py-1 font-medium ${returnStatus === chip.value
                    ? "bg-blue-600 text-white"
                    : "bg-card text-muted-foreground border border-border hover:bg-white/5"
                    }`}
                >
                  {chip.label}
                  {chip.value === "draft" ? (
                    <span className="ml-1 text-[10px] text-amber-200">{returnDraftCount}</span>
                  ) : chip.value === "finalized" ? (
                    <span className="ml-1 text-[10px] text-emerald-200">{returnFinalizedCount}</span>
                  ) : chip.value === "void" ? (
                    <span className="ml-1 text-[10px] text-rose-200">{returnVoidCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
            {latestDraft && (
              <button
                type="button"
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-amber-400"
                onClick={() => handleResumeDraft(latestDraft)}
              >
                Resume latest draft
              </button>
            )}
          </div>
          <ReturnsManagementTable
            rows={returnRows}
            loading={loadingReturnList}
            page={returnPage}
            pageSize={returnPageSize}
            count={returnCount}
            lastPage={returnLastPage}
            onPageChange={setReturnPage}
            onPageSizeChange={(size) => {
              setReturnPageSize(size);
              setReturnPage(1);
            }}
            onSelect={handleOpenReturnRow}
            safeMoney={safeMoney}
            onResumeDraft={handleResumeDraft}
            onVoidDraft={(row) => handleVoidReturn(row.id, true)}
            onDeleteDraft={(row) => handleDeleteDraftReturn(row.id, true)}
          />
        </div>
      )}

      {mainTab === "payments" && (
        canViewPayments ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground md:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Collected (page)</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-200 tabular-nums">
                  {loadingPaymentSummary ? "…" : safeMoney(paymentTotalCollected)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Refunded (page)</div>
                <div className="mt-1 text-2xl font-semibold text-rose-200 tabular-nums">
                  {loadingPaymentSummary ? "…" : safeMoney(refundTotalAmount)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Net (page)</div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${netPaymentTotal >= 0 ? "text-emerald-200" : "text-rose-200"}`}>
                  {loadingPaymentSummary ? "…" : safeMoney(netPaymentTotal)}
                </div>
              </div>
              <div className="text-left">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">By method (page)</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {["CASH", "CARD", "STORE_CREDIT", "OTHER"].map((method) => {
                    const amount = paymentTotalsByMethod[method] || 0;
                    return (
                      <span key={method} className="rounded-full border border-white/10 px-2 py-0.5 text-white/80">
                        {method.replace("_", " ")} · {loadingPaymentSummary ? "…" : safeMoney(amount)}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Exports:</span>
              <button
                type="button"
                className="rounded-md border border-white/20 px-3 py-1 text-white hover:bg-white/10"
                onClick={() => handleExportPayments("payments")}
              >
                Download payments CSV
              </button>
              <button
                type="button"
                className="rounded-md border border-white/20 px-3 py-1 text-white hover:bg-white/10"
                onClick={() => handleExportPayments("refunds")}
              >
                Download refunds CSV
              </button>
            </div>

            <PaymentsToolbar
              title="Payments filters"
              storeId={paymentStoreId}
              setStoreId={setPaymentStoreId}
              stores={stores}
              method={paymentMethod}
              setMethod={setPaymentMethod}
              dateFrom={paymentDateFrom}
              setDateFrom={setPaymentDateFrom}
              dateTo={paymentDateTo}
              setDateTo={setPaymentDateTo}
            />

            <PaymentsTable
              rows={paymentRows}
              loading={loadingPayments}
              page={paymentPage}
              pageSize={paymentPageSize}
              count={paymentCount}
              lastPage={paymentLastPage}
              onPageChange={setPaymentPage}
              onPageSizeChange={(size) => {
                setPaymentPageSize(size);
                setPaymentPage(1);
              }}
              onSelect={handleOpenPaymentRow}
              onStartRefund={handleStartRefundFromPayment}
              onCopyReference={handleCopyPaymentReference}
              safeMoney={safeMoney}
            />

            <PaymentsToolbar
              title="Refunds filters"
              storeId={refundStoreId}
              setStoreId={setRefundStoreId}
              stores={stores}
              method={refundMethod}
              setMethod={setRefundMethod}
              dateFrom={refundDateFrom}
              setDateFrom={setRefundDateFrom}
              dateTo={refundDateTo}
              setDateTo={setRefundDateTo}
            />

            <RefundsTable
              rows={refundRows}
              loading={loadingRefunds}
              page={refundPage}
              pageSize={refundPageSize}
              count={refundCount}
              lastPage={refundLastPage}
              onPageChange={setRefundPage}
              onPageSizeChange={(size) => {
                setRefundPageSize(size);
                setRefundPage(1);
              }}
              onSelect={handleOpenRefundRow}
              onViewSale={handleOpenRefundSale}
              onCopyReference={handleCopyRefundReference}
              safeMoney={safeMoney}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
            You don’t have permission to view Payments & Refunds. Ask an owner or finance admin to grant access.
          </div>
        )
      )}

      {mainTab === "discounts" && (
        canViewDiscounts ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground md:grid-cols-3">
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total discount</div>
                <div className="mt-1 text-2xl font-semibold text-amber-200 tabular-nums">
                  {loadingDiscountSummary ? "…" : safeMoney(totalDiscountAmount)}
                </div>
              </div>
              <div className="text-center md:col-span-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Top rules</div>
                <div className="mt-1 flex flex-wrap justify-center gap-2 text-xs text-foreground">
                  {(discountSummary?.rules || []).slice(0, 3).map((rule) => (
                    <span key={rule.code} className="rounded-full border border-amber-500/30 px-2 py-0.5 text-amber-100">
                      {rule.name} · {safeMoney(Number(rule.total_discount_amount || 0))}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <DiscountsToolbar
              storeId={discountStoreId}
              setStoreId={setDiscountStoreId}
              stores={stores}
              dateFrom={discountDateFrom}
              setDateFrom={setDiscountDateFrom}
              dateTo={discountDateTo}
              setDateTo={setDiscountDateTo}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <input
                className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Search rule by name or code"
                value={discountSearch}
                onChange={(e) => setDiscountSearch(e.target.value)}
              />
              <button
                type="button"
                className="rounded-md border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10"
                onClick={() => handleDiscountExport("summary")}
              >
                Download summary CSV
              </button>
            </div>

            <DiscountRulesTable
              rows={filteredDiscountRules}
              loading={loadingDiscountSummary}
              onSelect={(rule) => {
                setSelectedDiscountRule(rule);
                setDiscountSalesPage(1);
              }}
            />

            {selectedDiscountRule && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div>
                    Sales using <span className="font-semibold">{selectedDiscountRule.name}</span>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-blue-300 hover:text-blue-200"
                    onClick={() => setSelectedDiscountRule(null)}
                  >
                    Clear selection
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span></span>
                  <button
                    type="button"
                    className="rounded-md border border-white/20 px-3 py-1 text-white hover:bg-white/10"
                    onClick={() => handleDiscountExport("sales", selectedDiscountRule.code)}
                  >
                    Download sales CSV
                  </button>
                </div>
                <DiscountSalesTable
                  rows={discountSalesRows}
                  loading={loadingDiscountSales}
                  page={discountSalesPage}
                  pageSize={discountSalesPageSize}
                  count={discountSalesCount}
                  lastPage={Math.max(1, Math.ceil(discountSalesCount / discountSalesPageSize))}
                  onPageChange={setDiscountSalesPage}
                  onPageSizeChange={(size) => {
                    setDiscountSalesPageSize(size);
                    setDiscountSalesPage(1);
                  }}
                  onOpenSale={handleOpenDiscountSale}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
            You don’t have permission to view Discounts & Promotions.
          </div>
        )
      )}

      {mainTab === "customers" && (
        <CustomersTab
          onSelectCustomer={(id) => setOpenCustomerId(id)}               // row click -> view drawer
          onViewCustomerDetails={(id) => setEditingCustomerId(id)}       // "View details" -> edit drawer
          refreshKey={customersRefreshKey}
          safeMoney={safeMoney}
        />
      )}


      {mainTab === "taxes" && (
        canViewTaxes ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-2xl border border-cyan-500/30 bg-card px-4 py-3 text-sm text-cyan-100 md:grid-cols-3">
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">Total tax</div>
                <div className="mt-2 text-3xl font-bold text-cyan-300 tabular-nums">
                  {loadingTaxSummary ? "…" : safeMoney(Number(taxSummary?.total_tax || 0))}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">Taxed receipts</div>
                <div className="mt-2 text-3xl font-bold text-white tabular-nums">
                  {loadingTaxSummary ? "…" : taxSummary?.taxed_sales || 0}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">Compliance tips</div>
                <div className="mt-2 text-xs text-cyan-100/70">
                  Review filings for spikes, confirm jurisdiction codes, and export rule-level worksheets before closing the period.
                </div>
              </div>
            </div>

            <TaxesToolbar
              storeId={taxStoreId}
              setStoreId={setTaxStoreId}
              stores={stores}
              dateFrom={taxDateFrom}
              setDateFrom={setTaxDateFrom}
              dateTo={taxDateTo}
              setDateTo={setTaxDateTo}
            />

            <TaxRuleTable
              rows={filteredTaxRules}
              loading={loadingTaxSummary}
              onSelect={(rule) => {
                setSelectedTaxRule(rule);
                setTaxSalesPage(1);
              }}
              searchQuery={taxRuleSearch}
              setSearchQuery={setTaxRuleSearch}
            />

            {selectedTaxRule && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-cyan-100">
                  <div>
                    Filings for <span className="font-semibold">{selectedTaxRule.name}</span>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-cyan-300 hover:text-cyan-200"
                    onClick={() => setSelectedTaxRule(null)}
                  >
                    Clear selection
                  </button>
                </div>
                <TaxSalesTable
                  rows={taxSalesRows}
                  loading={loadingTaxSales}
                  page={taxSalesPage}
                  pageSize={taxSalesPageSize}
                  count={taxSalesCount}
                  lastPage={Math.max(1, Math.ceil(taxSalesCount / taxSalesPageSize))}
                  onPageChange={setTaxSalesPage}
                  onPageSizeChange={(size) => {
                    setTaxSalesPageSize(size);
                    setTaxSalesPage(1);
                  }}
                  onOpenSale={handleOpenDiscountSale}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
            You don’t have permission to view Taxes & Compliance.
          </div>
        )
      )}

      {mainTab === "audit" && (
        canViewAudit ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-2xl border border-fuchsia-500/40 bg-card px-4 py-3 text-sm text-fuchsia-100 md:grid-cols-3">
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-[0.3em] text-fuchsia-200/70">Events</div>
                <div className="mt-2 text-3xl font-bold text-white tabular-nums">{auditCount}</div>
              </div>
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-[0.3em] text-fuchsia-200/70">Critical</div>
                <div className="mt-2 text-3xl font-bold text-rose-300 tabular-nums">
                  {auditLogs.filter((log) => log.severity === "critical").length}
                </div>
              </div>
              <div className="text-xs text-fuchsia-100/80 md:text-left">
                Track approvals, overrides, and anomaly alerts across all stores. Each audit row links to the full sale or return record for deeper investigation.
              </div>
            </div>
            <AuditFilters
              action={auditAction}
              setAction={setAuditAction}
              severity={auditSeverity}
              setSeverity={setAuditSeverity}
              dateFrom={auditDateFrom}
              setDateFrom={setAuditDateFrom}
              dateTo={auditDateTo}
              setDateTo={setAuditDateTo}
            />
            <AuditTimeline entries={auditLogs} loading={loadingAudit} onSelect={handleSelectAuditEntry} />
          </div>
        ) : (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
            You don’t have permission to view Audit & Activity.
          </div>
        )
      )}

      <AuditDrawer
        entry={selectedAudit}
        onClose={() => setSelectedAudit(null)}
        onOpenSale={(id) => {
          setSelectedAudit(null);
          openDetail(id);
        }}
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
              setWizardDraft(null);
              setWizardOpen(true);
            }}
            onOpenCustomer={(customerId) => setOpenCustomerId(customerId)}
            onViewCustomerDetails={(customerId) => setEditingCustomerId(customerId)}
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
          if (openId) {
            const d = await getSale(openId);
            setDetail(d);
            const cur = (d as any).currency || (d as any).receipt_data?.currency || null;
            if (cur) {
              setCurrency({
                code: cur.code || cur.currency_code || "USD",
                symbol: cur.symbol || undefined,
                precision: cur.precision ?? currency.precision ?? 2,
              });
            } else if ((d as any).currency_code) {
              setCurrency((prev) => ({ ...prev, code: (d as any).currency_code || prev.code }));
            }
          }
          if (openId && activeTab === "returns") {
            const data = await listReturnsForSale(openId);
            setReturns(Array.isArray(data) ? data : (data?.results ?? []));
          }
          // NEW: refresh customers summary + drawer
          setCustomersRefreshKey((x) => x + 1);
        }}
        safeMoney={safeMoney}
      />

      <CustomerDrawer
        customerId={openCustomerId}
        open={openCustomerId != null}
        onClose={() => setOpenCustomerId(null)}
        onOpenSale={(id) => openDetail(id)}
        refreshKey={customersRefreshKey}
        safeMoney={safeMoney}
      />

      <CustomerEditDrawer
        customerId={editingCustomerId}
        open={editingCustomerId != null}
        startInViewMode={true}
        onClose={() => setEditingCustomerId(null)}
        onSaved={() => {
          setCustomersRefreshKey((x) => x + 1);
        }}
      />



    </div>
    </div>
  );
}
