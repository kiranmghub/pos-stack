// pos-frontend/src/features/inventory/InventoryRoute.tsx
import React, { useState, useEffect } from "react";
import AppShell, { PageHeading } from "@/components/AppShell";
import { Package } from "lucide-react";
import { OverviewDashboard } from "./dashboard";
import { StockListPage } from "./stock";
import { LedgerPage } from "./audit";
import { TransfersPage } from "./operations/transfers";
import { CountsPage } from "./operations/counts";
import { PurchaseOrdersPage } from "./operations/purchase-orders";
import { AdjustmentsPage } from "./operations/adjustments";
import { ReorderSuggestionsPage } from "./planning/reorder";
import { ForecastingDashboard } from "./planning/forecasting";
import { AtRiskItemsPage } from "./planning/at-risk";
import { InventoryHealthPage } from "./planning/health";
import { VendorsPage } from "./vendors";
import { ReservationsPage, BackordersPage, AvailabilityView } from "./multi-channel";
import { WebhooksPage, ExportSettings } from "./settings";
import { ReturnsInspectionPage } from "./operations/returns";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function InventoryRoute() {
  // Read initial tab and PO ID from URL params for deep linking
  type TabValue = "overview" | "stock" | "ledger" | "transfers" | "counts" | "purchase-orders" | "adjustments" | "reorder-suggestions" | "forecasting" | "at-risk" | "health" | "vendors" | "reservations" | "backorders" | "availability" | "webhooks" | "exports" | "returns-inspection";
  
  const readInitialState = (): { initialTab: TabValue; initialPOId: number | null } => {
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get("tab");
    const poIdParam = url.searchParams.get("poId");
    
    // Validate tab
    const validTabs: TabValue[] = ["overview", "stock", "ledger", "transfers", "counts", "purchase-orders", "adjustments", "reorder-suggestions", "forecasting", "at-risk", "health", "vendors", "reservations", "backorders", "availability", "webhooks", "exports", "returns-inspection"];
    const initialTab: TabValue = validTabs.includes(tabParam as TabValue) ? (tabParam as TabValue) : "overview";
    
    // Parse PO ID if present
    const initialPOId = poIdParam ? parseInt(poIdParam, 10) : null;
    
    return { initialTab, initialPOId };
  };
  
  const { initialTab, initialPOId } = readInitialState();
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  
  // State to pass PO ID to PurchaseOrdersPage
  const [initialSelectedPOId, setInitialSelectedPOId] = useState<number | null>(initialPOId);
  
  // Per-tab store state
  const [overviewStoreId, setOverviewStoreId] = useState<number | null>(null); // null = "All Stores"
  const [stockStoreId, setStockStoreId] = useState<number | undefined>(undefined); // required
  const [ledgerStoreId, setLedgerStoreId] = useState<number | null>(null); // null = "All Stores"
  const [transfersStoreId, setTransfersStoreId] = useState<number | null>(null); // null = "All Stores"
  const [countsStoreId, setCountsStoreId] = useState<number | null>(null); // null = "All Stores"
  const [purchaseOrdersStoreId, setPurchaseOrdersStoreId] = useState<number | null>(null); // null = "All Stores"
  const [adjustmentsStoreId, setAdjustmentsStoreId] = useState<number | null>(null); // null = "All Stores"
  const [reorderSuggestionsStoreId, setReorderSuggestionsStoreId] = useState<number | null>(null); // null = "All Stores"
  const [forecastingStoreId, setForecastingStoreId] = useState<number | null>(null); // null = "All Stores"
  const [atRiskStoreId, setAtRiskStoreId] = useState<number | null>(null); // null = "All Stores"
  const [healthStoreId, setHealthStoreId] = useState<number | null>(null); // null = "All Stores"
  const [reservationsStoreId, setReservationsStoreId] = useState<number | null>(null); // null = "All Stores"
  const [backordersStoreId, setBackordersStoreId] = useState<number | null>(null); // null = "All Stores"
  const [availabilityStoreId, setAvailabilityStoreId] = useState<number | undefined>(undefined); // required
  const [returnsInspectionStoreId, setReturnsInspectionStoreId] = useState<number | null>(null); // null = "All Stores"

  const handleKpiClick = (kpi: string) => {
    // Navigate to relevant page based on KPI clicked
    console.log("KPI clicked:", kpi);
    // TODO: Implement navigation
  };

  const handleCreateTransfer = () => {
    // TODO: Open create transfer modal
    console.log("Create transfer");
  };

  const handleStartCount = () => {
    // TODO: Open start count modal
    console.log("Start count");
  };

  const handleCreatePO = () => {
    // TODO: Open create PO modal
    console.log("Create PO");
  };

  const handleBulkAdjust = () => {
    // TODO: Open bulk adjust modal
    console.log("Bulk adjust");
  };

  const handleViewLowStock = () => {
    // TODO: Navigate to stock page with low stock filter
    console.log("View low stock");
  };

  const handleViewAtRisk = () => {
    setActiveTab("at-risk");
  };

  const handleItemClick = (item: any) => {
    // TODO: Navigate to item detail
    console.log("Item clicked:", item);
  };

  const handleMovementClick = (movement: any) => {
    // TODO: Navigate to ledger or movement detail
    console.log("Movement clicked:", movement);
  };

  // Load stores on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const storeList = await getMyStores();
        if (!alive) return;
        setStores(storeList);
        // Auto-select first store for Stock tab if available
        if (storeList.length > 0 && !stockStoreId) {
          setStockStoreId(storeList[0].id);
        }
        // Auto-select first store for Availability tab if available
        if (storeList.length > 0 && !availabilityStoreId) {
          setAvailabilityStoreId(storeList[0].id);
        }
      } catch (err) {
        console.error("Failed to load stores:", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedStockStore = stores.find((s) => s.id === stockStoreId);

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-3rem)] bg-background">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-background">
          <PageHeading
            title="Inventory"
            subtitle="Overview and stock management"
          />
        </div>
        <div className="p-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <div className="mb-6 overflow-x-auto -mx-6 px-6">
              <TabsList className="inline-flex w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="stock">Stock Management</TabsTrigger>
              <TabsTrigger value="transfers">Transfers</TabsTrigger>
              <TabsTrigger value="counts">Counts</TabsTrigger>
              <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
              <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
              <TabsTrigger value="reorder-suggestions">Reorder Suggestions</TabsTrigger>
              <TabsTrigger value="forecasting">Forecasting</TabsTrigger>
              <TabsTrigger value="at-risk">At-Risk Items</TabsTrigger>
              <TabsTrigger value="health">Health Reports</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
              <TabsTrigger value="reservations">Reservations</TabsTrigger>
              <TabsTrigger value="backorders">Backorders</TabsTrigger>
              <TabsTrigger value="availability">Availability</TabsTrigger>
              <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
              <TabsTrigger value="exports">Exports</TabsTrigger>
              <TabsTrigger value="returns-inspection">Returns Inspection</TabsTrigger>
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="overview">
              <OverviewDashboard
                stores={stores}
                storeId={overviewStoreId}
                onStoreChange={setOverviewStoreId}
                onKpiClick={handleKpiClick}
                onCreateTransfer={handleCreateTransfer}
                onStartCount={handleStartCount}
                onCreatePO={handleCreatePO}
                onBulkAdjust={handleBulkAdjust}
                onViewLowStock={() => {
                  // If viewing all stores, select first store for stock tab
                  if (overviewStoreId === null && stores.length > 0) {
                    setStockStoreId(stores[0].id);
                  } else if (overviewStoreId !== null) {
                    setStockStoreId(overviewStoreId);
                  }
                  setActiveTab("stock");
                  // TODO: Apply low stock filter
                }}
                onViewAtRisk={handleViewAtRisk}
                onItemClick={handleItemClick}
                onMovementClick={handleMovementClick}
              />
            </TabsContent>
            <TabsContent value="stock">
              <StockListPage
                stores={stores}
                storeId={stockStoreId}
                onStoreChange={setStockStoreId}
                onCreateTransfer={handleCreateTransfer}
              />
            </TabsContent>
            <TabsContent value="transfers">
              <TransfersPage
                stores={stores}
                storeId={transfersStoreId}
                onStoreChange={setTransfersStoreId}
              />
            </TabsContent>
            <TabsContent value="counts">
              <CountsPage
                stores={stores}
                storeId={countsStoreId}
                onStoreChange={setCountsStoreId}
              />
            </TabsContent>
            <TabsContent value="purchase-orders">
              <PurchaseOrdersPage
                stores={stores}
                storeId={purchaseOrdersStoreId}
                onStoreChange={setPurchaseOrdersStoreId}
                initialSelectedPOId={initialSelectedPOId}
                onPOSelected={() => {
                  // Clear initial PO ID after it's been used
                  setInitialSelectedPOId(null);
                  // Clean up URL params
                  const url = new URL(window.location.href);
                  url.searchParams.delete("poId");
                  url.searchParams.delete("tab");
                  window.history.replaceState({}, "", url.toString());
                }}
              />
            </TabsContent>
            <TabsContent value="adjustments">
              <AdjustmentsPage
                stores={stores}
                storeId={adjustmentsStoreId}
                onStoreChange={setAdjustmentsStoreId}
              />
            </TabsContent>
            <TabsContent value="reorder-suggestions">
              <ReorderSuggestionsPage
                stores={stores}
                storeId={reorderSuggestionsStoreId}
                onStoreChange={setReorderSuggestionsStoreId}
              />
            </TabsContent>
            <TabsContent value="forecasting">
              <ForecastingDashboard
                stores={stores}
                storeId={forecastingStoreId}
                onStoreChange={setForecastingStoreId}
              />
            </TabsContent>
            <TabsContent value="at-risk">
              <AtRiskItemsPage
                stores={stores}
                storeId={atRiskStoreId}
                onStoreChange={setAtRiskStoreId}
              />
            </TabsContent>
            <TabsContent value="health">
              <InventoryHealthPage
                stores={stores}
                storeId={healthStoreId}
                onStoreChange={setHealthStoreId}
              />
            </TabsContent>
            <TabsContent value="vendors">
              <VendorsPage
                stores={stores}
                storeId={null}
                onStoreChange={() => {}}
              />
            </TabsContent>
            <TabsContent value="reservations">
              <ReservationsPage
                stores={stores}
                storeId={reservationsStoreId}
                onStoreChange={setReservationsStoreId}
              />
            </TabsContent>
            <TabsContent value="backorders">
              <BackordersPage
                stores={stores}
                storeId={backordersStoreId}
                onStoreChange={setBackordersStoreId}
              />
            </TabsContent>
            <TabsContent value="availability">
              <AvailabilityView
                stores={stores}
                storeId={availabilityStoreId || undefined}
                onStoreChange={(id) => setAvailabilityStoreId(id || undefined)}
              />
            </TabsContent>
            <TabsContent value="webhooks">
              <WebhooksPage
                stores={stores}
                storeId={null}
                onStoreChange={() => {}}
              />
            </TabsContent>
            <TabsContent value="exports">
              <ExportSettings
                stores={stores}
                storeId={null}
                onStoreChange={() => {}}
              />
            </TabsContent>
            <TabsContent value="returns-inspection">
              <ReturnsInspectionPage
                stores={stores}
                storeId={returnsInspectionStoreId}
                onStoreChange={setReturnsInspectionStoreId}
              />
            </TabsContent>
            <TabsContent value="ledger">
              <LedgerPage
                stores={stores}
                storeId={ledgerStoreId}
                onStoreChange={setLedgerStoreId}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}

