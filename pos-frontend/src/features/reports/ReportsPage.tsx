// pos-frontend/src/features/reports/ReportsPage.tsx
import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SalesReportsTab } from "./tabs/SalesReportsTab";
import { ProductReportsTab } from "./tabs/ProductReportsTab";
import { FinancialReportsTab } from "./tabs/FinancialReportsTab";
import { CustomerReportsTab } from "./tabs/CustomerReportsTab";
import { EmployeeReportsTab } from "./tabs/EmployeeReportsTab";
import { ReturnsReportsTab } from "./tabs/ReturnsReportsTab";

type ReportTab = "sales" | "products" | "financial" | "customers" | "employees" | "returns";

/**
 * Main Reports page component with tabbed interface.
 * Manages filter state (store, date range) shared across all report tabs.
 */
export default function ReportsPage() {
  // Initialize state with empty values (matches Sales page pattern exactly)
  // Sales page doesn't read from or write to URL params
  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [storeId, setStoreId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-background">
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)} variant="default">
          <div className="mb-6 overflow-x-auto -mx-6 px-6">
            <TabsList className="inline-flex w-max">
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="financial">Financial</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="returns">Returns</TabsTrigger>
            </TabsList>
          </div>

          <ErrorBoundary>
            <TabsContent value="sales" className="mt-0">
              <SalesReportsTab
                storeId={storeId}
                setStoreId={setStoreId}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
              />
            </TabsContent>
          </ErrorBoundary>

          <ErrorBoundary>
            <TabsContent value="products" className="mt-0">
              <ProductReportsTab
                storeId={storeId}
                setStoreId={setStoreId}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
              />
            </TabsContent>
          </ErrorBoundary>

          <ErrorBoundary>
            <TabsContent value="financial" className="mt-0">
              <FinancialReportsTab
                storeId={storeId}
                setStoreId={setStoreId}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
              />
            </TabsContent>
          </ErrorBoundary>

          <ErrorBoundary>
            <TabsContent value="customers" className="mt-0">
              <CustomerReportsTab
                storeId={storeId}
                setStoreId={setStoreId}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
              />
            </TabsContent>
          </ErrorBoundary>

          <ErrorBoundary>
            <TabsContent value="employees" className="mt-0">
              <EmployeeReportsTab
                storeId={storeId}
                setStoreId={setStoreId}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
              />
            </TabsContent>
          </ErrorBoundary>

          <ErrorBoundary>
            <TabsContent value="returns" className="mt-0">
              <ReturnsReportsTab
                storeId={storeId}
                setStoreId={setStoreId}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
              />
            </TabsContent>
          </ErrorBoundary>
        </Tabs>
      </div>
    </div>
  );
}

