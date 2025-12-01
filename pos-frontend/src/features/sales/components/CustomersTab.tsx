// pos-frontend/src/features/sales/components/CustomersTab.tsx
import * as React from "react";
import {
  listCustomerSummaries,
  type CustomerSummaryRow,
} from "../api";
import { useMoney } from "../useMoney";
import { CustomersTable } from "./CustomersTable";

type CustomersTabProps = {
  onSelectCustomer: (id: number) => void;
  onViewCustomerDetails: (id: number) => void;
  refreshKey?: number;
  safeMoney?: (v: any) => string;
};


export const CustomersTab: React.FC<CustomersTabProps> = ({
  onSelectCustomer,
  onViewCustomerDetails,
  refreshKey,
  safeMoney: safeMoneyProp,
}) => {
  const { safeMoney: defaultMoney } = useMoney();
  const safeMoney = safeMoneyProp || defaultMoney;

  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [rows, setRows] = React.useState<CustomerSummaryRow[]>([]);
  const [count, setCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [loading, setLoading] = React.useState(false);

  const handleSelectRow = (row: CustomerSummaryRow) => {
    onSelectCustomer(row.id);
  };

  const handleViewDetails = (row: CustomerSummaryRow) => {
    onViewCustomerDetails(row.id);
  };


  const lastPage = Math.max(1, Math.ceil(count / pageSize));

  // Debounced search
  React.useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search, dateFrom, dateTo]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await listCustomerSummaries({
          page,
          page_size: pageSize,
          q: search || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        });
        if (!alive) return;
        setRows(Array.isArray(data.results) ? data.results : []);
        setCount(Number(data.count || 0));
        const last = Math.max(
          1,
          Math.ceil(Number(data.count || 0) / pageSize)
        );
        if (page > last) setPage(last);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [page, pageSize, search, dateFrom, dateTo, refreshKey]);

  const handleSelect = (row: CustomerSummaryRow) => {
    onSelectCustomer(row.id);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            Search customers
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none"
          />
        </div>
      </div>

      <CustomersTable
        rows={rows}
        loading={loading}
        page={page}
        pageSize={pageSize}
        count={count}
        lastPage={lastPage}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onSelectRow={handleSelectRow}
        onViewDetails={handleViewDetails}
        safeMoney={safeMoney}
      />

    </div>
  );
};
