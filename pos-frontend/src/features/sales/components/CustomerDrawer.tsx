// pos-frontend/src/features/sales/components/CustomerDrawer.tsx
import * as React from "react";
import {
  getCustomer,
  listCustomerSales,
  getLoyaltyAccount,
  listLoyaltyHistory,
  type CustomerDetail,
  type CustomerSaleRow,
  type LoyaltyAccount,
  type LoyaltyTx,
} from "../api";
import { useMoney } from "../useMoney";

type CustomerDrawerProps = {
  customerId: number | null;
  open: boolean;
  onClose: () => void;
  onOpenSale?: (saleId: number) => void;
  refreshKey?: number;
  onEditCustomer?: (id: number) => void;
  safeMoney?: (v: any) => string;
};

type CustomerDrawerTab = "overview" | "purchases" | "loyalty";

export const CustomerDrawer: React.FC<CustomerDrawerProps> = ({
  customerId,
  open,
  onClose,
  onOpenSale,
  refreshKey,
  safeMoney: safeMoneyProp,
}) => {
  const { safeMoney: defaultMoney } = useMoney();
  const safeMoney = safeMoneyProp || defaultMoney;

  const [activeTab, setActiveTab] = React.useState<CustomerDrawerTab>("overview");
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const [sales, setSales] = React.useState<CustomerSaleRow[]>([]);
  const [salesCount, setSalesCount] = React.useState(0);
  const [salesPage, setSalesPage] = React.useState(1);
  const [salesPageSize, setSalesPageSize] = React.useState(10);
  const [loadingSales, setLoadingSales] = React.useState(false);

  const [account, setAccount] = React.useState<LoyaltyAccount | null>(null);
  const [history, setHistory] = React.useState<LoyaltyTx[]>([]);
  const [loadingLoyalty, setLoadingLoyalty] = React.useState(false);

  const salesLastPage = Math.max(1, Math.ceil(salesCount / salesPageSize));

  // Reset when opening
  React.useEffect(() => {
    if (!open || !customerId) return;
    setActiveTab("overview");
    setDetail(null);
    setSales([]);
    setHistory([]);
    setAccount(null);
  }, [open, customerId]);

  // Load customer detail
  React.useEffect(() => {
    if (!open || !customerId) return;
    let alive = true;
    (async () => {
      setLoadingDetail(true);
      try {
        const data = await getCustomer(customerId);
        if (!alive) return;
        setDetail(data);
      } finally {
        if (alive) setLoadingDetail(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, customerId, refreshKey]);

  // Load sales when tab active
  React.useEffect(() => {
    if (!open || !customerId || activeTab !== "purchases") return;
    let alive = true;
    (async () => {
      setLoadingSales(true);
      try {
        const data = await listCustomerSales(customerId, {
          page: salesPage,
          page_size: salesPageSize,
        });
        if (!alive) return;
        setSales(data.results || []);
        setSalesCount(Number(data.count || 0));
        const last = Math.max(
          1,
          Math.ceil(Number(data.count || 0) / salesPageSize)
        );
        if (salesPage > last) setSalesPage(last);
      } finally {
        if (alive) setLoadingSales(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, customerId, activeTab, salesPage, salesPageSize, refreshKey]);

  // Load loyalty when tab active
  React.useEffect(() => {
    if (!open || !customerId || activeTab !== "loyalty") return;
    let alive = true;
    (async () => {
      setLoadingLoyalty(true);
      try {
        const acct = await getLoyaltyAccount(customerId);
        const histData = await listLoyaltyHistory(customerId, {
          page: 1,
          page_size: 50,
        });
        if (!alive) return;
        setAccount(acct);
        setHistory(histData.results || []);
      } finally {
        if (alive) setLoadingLoyalty(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, customerId, activeTab, refreshKey]);

  if (!open || !customerId) return null;

  const name = detail?.full_name || "Customer";

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-border bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Customer
            </div>
            <div className="text-lg font-semibold text-white">
              {name}
            </div>
            {detail?.email && (
              <div className="text-xs text-muted-foreground">{detail.email}</div>
            )}
            {detail?.phone_number && (
              <div className="text-xs text-muted-foreground">
                {detail.phone_number}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border px-3 py-2 text-xs">
          {[
            { id: "overview", label: "Overview" },
            { id: "purchases", label: "Purchases" },
            { id: "loyalty", label: "Loyalty" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as CustomerDrawerTab)}
              className={`rounded-md px-3 py-1 font-medium ${
                activeTab === tab.id
                  ? "bg-card text-foreground shadow"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {activeTab === "overview" && (
            <div className="space-y-4">
              {loadingDetail && (
                <div className="text-sm text-muted-foreground">Loading…</div>
              )}

              {detail && (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/60 p-3 text-sm">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Spend
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-white tabular-nums">
                        {safeMoney(detail.total_spend || 0)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Returns:{" "}
                        <span className="text-warning">
                          {safeMoney(detail.total_returns || 0)}
                        </span>{" "}
                        · Net:{" "}
                        <span className="text-success">
                          {safeMoney(detail.net_spend || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/60 p-3 text-sm">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Activity
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-white tabular-nums">
                        {detail.visits_count} visits
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last purchase:{" "}
                        {detail.last_purchase_date
                          ? new Date(
                              detail.last_purchase_date
                            ).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/60 p-3 text-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Contact & address
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {detail.email && <div>Email: {detail.email}</div>}
                      {detail.phone_number && (
                        <div>Phone: {detail.phone_number}</div>
                      )}
                      {(detail.address_line1 ||
                        detail.city ||
                        detail.region ||
                        detail.postal_code ||
                        detail.country) && (
                        <div className="mt-1">
                          <div>Address:</div>
                          <div className="text-muted-foreground">
                            {detail.address_line1}
                            {detail.address_line2
                              ? `, ${detail.address_line2}`
                              : ""}
                            {(detail.city || detail.region || detail.postal_code) && (
                              <>
                                <br />
                                {[detail.city, detail.region, detail.postal_code]
                                  .filter(Boolean)
                                  .join(", ")}
                              </>
                            )}
                            {detail.country && (
                              <>
                                <br />
                                {detail.country}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "purchases" && (
            <div className="space-y-3">
              {loadingSales && (
                <div className="text-sm text-muted-foreground">Loading purchases…</div>
              )}
              {!loadingSales && sales.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No purchases found for this customer.
                </div>
              )}
              {sales.length > 0 && (
                <>
                  <div className="overflow-x-auto rounded-lg border border-border bg-muted/60">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Store</th>
                          <th className="px-3 py-2 text-left">Receipt</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((s) => (
                          <tr
                            key={s.id}
                            className="cursor-pointer border-t border-border hover:bg-muted/60"
                            onClick={() => onOpenSale && onOpenSale(s.id)}
                          >
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {new Date(s.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {s.store_name || s.store_code || "—"}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {s.receipt_no || s.id}
                            </td>
                            <td className="px-3 py-2 text-right text-sm tabular-nums text-foreground">
                              {safeMoney(s.total || 0)}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">
                              <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">
                                {s.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      Page {salesPage} of {salesLastPage} · {salesCount} sales
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                        value={salesPageSize}
                        onChange={(e) => {
                          setSalesPageSize(Number(e.target.value));
                          setSalesPage(1);
                        }}
                      >
                        {[10, 20, 50].map((n) => (
                          <option key={n} value={n}>
                            {n} / page
                          </option>
                        ))}
                      </select>
                      <div className="inline-flex overflow-hidden rounded-md border border-border">
                        <button
                          type="button"
                          className="px-2 py-1 disabled:opacity-40"
                          onClick={() =>
                            setSalesPage(Math.max(1, salesPage - 1))
                          }
                          disabled={salesPage <= 1}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="border-l border-border px-2 py-1 disabled:opacity-40"
                          onClick={() =>
                            setSalesPage(Math.min(salesLastPage, salesPage + 1))
                          }
                          disabled={salesPage >= salesLastPage}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "loyalty" && (
            <div className="space-y-3">
              {loadingLoyalty && (
                <div className="text-sm text-muted-foreground">
                  Loading loyalty account…
                </div>
              )}

              {!loadingLoyalty && !account && history.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No loyalty account or history for this customer yet.
                </div>
              )}

              {account && (
                <div className="rounded-lg border border-border bg-muted/60 p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Loyalty
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-white tabular-nums">
                    {account.points_balance} pts
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Tier:{" "}
                    <span className="font-medium">
                      {account.tier || "—"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Member since: {account.created_at ? new Date(account.created_at).toLocaleString() : "—"}
                  </div>
                </div>
              )}

              {history.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border bg-muted/60">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">When</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Points</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2 text-left">Sale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((tx) => (
                        <tr
                          key={tx.id}
                          className="border-t border-border text-xs hover:bg-muted/60"
                        >
                          <td className="px-3 py-2 text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                tx.type === "EARN"
                                  ? "bg-badge-success-bg text-badge-success-text"
                                  : tx.type === "RETURN"
                                  ? "bg-badge-warning-bg text-badge-warning-text"
                                  : "bg-muted/40 text-foreground"
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">
                            {tx.points > 0 ? `+${tx.points}` : tx.points}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">
                            {tx.balance_after}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {tx.sale_id ? (
                              <button
                                type="button"
                                className="text-xs text-info hover:text-info/80"
                                onClick={() =>
                                  onOpenSale && onOpenSale(tx.sale_id!)
                                }
                              >
                                Sale #{tx.sale_id}
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
