// pos-frontend/src/features/inventory/vendors/VendorDetail.tsx
import React, { useState } from "react";
import { Vendor } from "../api/vendors";
import { VendorScorecard } from "./VendorScorecard";
import { useVendorScorecard } from "../hooks/useVendors";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "../components";
import { Building2, Mail, Phone, MapPin, FileText, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface VendorDetailProps {
  /** Vendor data */
  vendor: Vendor | null;
  /** On edit handler */
  onEdit?: () => void;
  /** On delete handler */
  onDelete?: () => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * VendorDetail - Vendor detail view with scorecard
 * Security: All data is tenant-scoped from the API
 */
export function VendorDetail({
  vendor,
  onEdit,
  onDelete,
  isLoading = false,
}: VendorDetailProps) {
  const [scorecardDaysBack, setScorecardDaysBack] = useState<number>(90);
  const [activeTab, setActiveTab] = useState<"info" | "scorecard">("info");

  const {
    data: scorecard,
    isLoading: scorecardLoading,
    refetch: refetchScorecard,
  } = useVendorScorecard(vendor?.id || null, scorecardDaysBack);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <LoadingSkeleton variant="card" height={400} />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">Select a vendor to view details</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vendor Info Header */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{vendor.name}</h2>
              {vendor.code && (
                <div className="text-sm text-muted-foreground">Code: {vendor.code}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="outline" size="sm" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Contact Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {vendor.contact_name && (
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Contact</div>
                <div className="text-sm font-medium text-foreground">{vendor.contact_name}</div>
              </div>
            </div>
          )}
          {vendor.email && (
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="text-sm font-medium text-foreground">{vendor.email}</div>
              </div>
            </div>
          )}
          {vendor.phone && (
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Phone</div>
                <div className="text-sm font-medium text-foreground">{vendor.phone}</div>
              </div>
            </div>
          )}
          {vendor.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Address</div>
                <div className="text-sm font-medium text-foreground whitespace-pre-line">
                  {vendor.address}
                </div>
              </div>
            </div>
          )}
          {vendor.notes && (
            <div className="flex items-start gap-2 md:col-span-2">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-xs text-muted-foreground">Notes</div>
                <div className="text-sm text-foreground whitespace-pre-line">{vendor.notes}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs for Info and Scorecard */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="info">Information</TabsTrigger>
          <TabsTrigger value="scorecard">Performance Scorecard</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Vendor information is displayed above. Switch to the Performance Scorecard tab to view
              analytics.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="scorecard" className="mt-4">
          <div className="space-y-4">
            {/* Scorecard Period Selector */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Scorecard Period</h3>
                <p className="text-xs text-muted-foreground">
                  Select the time period for performance metrics
                </p>
              </div>
              <select
                value={scorecardDaysBack.toString()}
                onChange={(e) => setScorecardDaysBack(parseInt(e.target.value, 10))}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="30">Last 30 days</option>
                <option value="60">Last 60 days</option>
                <option value="90">Last 90 days</option>
                <option value="180">Last 180 days</option>
                <option value="365">Last 365 days</option>
              </select>
            </div>

            {/* Scorecard */}
            <VendorScorecard scorecard={scorecard || null} isLoading={scorecardLoading} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

