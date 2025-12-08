// pos-frontend/src/features/admin/stores/StoreModal.tsx
import React, { useEffect, useState, useRef } from "react";
import type { Store } from "../adminApi";
import { StoresAPI, StoreCreatePayload, StoreUpdatePayload } from "../api/stores";
import { useNotify } from "@/lib/notify";
import { getTenantCode } from "@/lib/auth";
import { getTenantDetails } from "../api/tenant";
import { generateCode } from "@/features/onboarding/api";
import { slugifyLocal, stripTenantPrefix, CODE_PREFIXES } from "../utils/codeGeneration";
import StoreSetupPrompt from "./StoreSetupPrompt";
import StoreSetupWizard from "./StoreSetupWizard";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;      // parent refresh
  editing?: Store | null;
  forceSetupWizard?: boolean; // If true, skip prompt and go directly to wizard
};

const required = (v?: string) => (v && v.trim().length ? undefined : "Required");

// Timezone guessing function (mirrors backend logic)
function guessTimezone(country?: string, state?: string): string {
  const c = (country || "").toUpperCase();
  const s = (state || "").toUpperCase();

  // Timezone map matching backend TZ_MAP
  const tzMap: Record<string, string> = {
    "US-NEW YORK": "America/New_York",
    "US-LOS ANGELES": "America/Los_Angeles",
    "US-CHICAGO": "America/Chicago",
    "IN-MUMBAI": "Asia/Kolkata",
    "IN-DELHI": "Asia/Kolkata",
    "SG-SINGAPORE": "Asia/Singapore",
    "GB-LONDON": "Europe/London",
    "EU-BERLIN": "Europe/Berlin",
  };

  // Check country + state combination
  if (c && s && tzMap[`${c}-${s}`]) {
    return tzMap[`${c}-${s}`];
  }

  // Country-only defaults
  if (c === "IN") return "Asia/Kolkata";
  if (c === "SG") return "Asia/Singapore";
  if (c === "GB") return "Europe/London";
  if (c === "EU") return "Europe/Berlin";
  if (c === "US") return "America/New_York";

  // Fallback to browser timezone
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTz) return browserTz;
  } catch (e) {
    // Ignore errors
  }

  // Final fallback
  return "America/New_York";
}

export default function StoreModal({ open, onClose, onSaved, editing, forceSetupWizard = false }: Props) {
  const { success, error, info, warn } = useNotify();
  const isEdit = !!editing;

  const [form, setForm] = useState<StoreCreatePayload>({
    code: "",
    name: "",
    timezone: "",
    region: "",
    street: "",
    city: "",
    state: "",
    postal_code: "",
    country: "USA",
    is_active: true,
    is_primary: false,
    phone_number: "",
    mobile_number: "",
    fax_number: "",
    email: "",
    contact_person: "",
    landmark: "",
    description: "",
    geo_lat: "",
    geo_lng: "",
    opening_time: "",
    closing_time: "",
    tax_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [tenantDetails, setTenantDetails] = useState<{ code?: string; country_code?: string } | null>(null);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const codeGenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Setup wizard state
  const [showPrompt, setShowPrompt] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [createdStoreId, setCreatedStoreId] = useState<number | null>(null);
  const [createdStoreName, setCreatedStoreName] = useState<string>("");

  // Fetch tenant details on mount
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const details = await getTenantDetails();
        if (!mounted) return;
        setTenantDetails({
          code: details.code,
          country_code: details.country_code || undefined,
        });
      } catch (e) {
        console.error("Failed to fetch tenant details:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open]);

  // Auto-set country and timezone when tenant details are loaded (only for new stores)
  useEffect(() => {
    if (!open || isEdit || !tenantDetails) return;

    // Auto-set country from tenant
    if (tenantDetails.country_code) {
      setForm((f) => {
        // Convert ISO alpha-2 to full name for consistency (e.g., "US" -> "USA")
        let newCountry = tenantDetails.country_code || f.country;
        if (newCountry === "US") newCountry = "USA";
        const newTimezone = guessTimezone(newCountry, f.state);
        return {
          ...f,
          country: newCountry,
          timezone: f.timezone || newTimezone,
        };
      });
    } else {
      // If no tenant country, still try to set timezone from browser
      setForm((f) => ({
        ...f,
        timezone: f.timezone || guessTimezone(),
      }));
    }
  }, [tenantDetails, open, isEdit]);

  // Auto-generate code when name changes (only for new stores, and if code wasn't manually edited)
  useEffect(() => {
    if (!open || isEdit || codeManuallyEdited || !form.name.trim() || !tenantDetails?.code) return;

    // Clear existing timeout
    if (codeGenTimeoutRef.current) {
      clearTimeout(codeGenTimeoutRef.current);
    }

    // Debounce code generation
    codeGenTimeoutRef.current = setTimeout(async () => {
      try {
        const tenantCode = tenantDetails.code || "";
        const tenantSlugClean = slugifyLocal(stripTenantPrefix(tenantCode));
        const nameSlug = slugifyLocal(form.name);
        const prefix = CODE_PREFIXES.store;
        const parts = [prefix, tenantSlugClean, nameSlug || "store"].filter(Boolean);
        const combined = parts.join("-").replace(/--+/g, "-");

        const res = await generateCode("store", combined);
        setForm((f) => ({ ...f, code: res.code }));
      } catch (e: any) {
        console.error("Failed to generate code:", e);
        // Don't show error to user, just log it
      }
    }, 500); // 500ms debounce

    return () => {
      if (codeGenTimeoutRef.current) {
        clearTimeout(codeGenTimeoutRef.current);
      }
    };
  }, [form.name, tenantDetails, open, isEdit, codeManuallyEdited]);

  // Update timezone when country or state changes
  useEffect(() => {
    if (!open || isEdit) return;
    if (form.country || form.state) {
      const newTimezone = guessTimezone(form.country, form.state);
      setForm((f) => ({
        ...f,
        timezone: f.timezone || newTimezone,
      }));
    }
  }, [form.country, form.state, open, isEdit]);

  // Initialize form when editing or creating
  useEffect(() => {
    if (editing) {
      setForm({
        code: editing.code ?? "",
        name: editing.name ?? "",
        timezone: (editing as any)?.timezone ?? "",
        region: (editing as any)?.region ?? "",
        street: (editing as any)?.street ?? "",
        city: (editing as any)?.city ?? "",
        state: (editing as any)?.state ?? "",
        postal_code: (editing as any)?.postal_code ?? "",
        country: (editing as any)?.country ?? "USA",
        is_active: editing.is_active ?? true,
        is_primary: (editing as any)?.is_primary ?? false,
        phone_number: (editing as any)?.phone_number ?? "",
        mobile_number: (editing as any)?.mobile_number ?? "",
        fax_number: (editing as any)?.fax_number ?? "",
        email: (editing as any)?.email ?? "",
        contact_person: (editing as any)?.contact_person ?? "",
        landmark: (editing as any)?.landmark ?? "",
        description: (editing as any)?.description ?? "",
        geo_lat: (editing as any)?.geo_lat ?? "",
        geo_lng: (editing as any)?.geo_lng ?? "",
        opening_time: (editing as any)?.opening_time ?? "",
        closing_time: (editing as any)?.closing_time ?? "",
        tax_id: (editing as any)?.tax_id ?? "",
      });
      setCodeManuallyEdited(false);
      // Reset wizard state when editing
      setShowPrompt(false);
      setShowWizard(false);
      setCreatedStoreId(null);
      setCreatedStoreName("");
    } else {
      setForm({
        code: "",
        name: "",
        timezone: "",
        region: "",
        street: "",
        city: "",
        state: "",
        postal_code: "",
        country: "USA",
        is_active: true,
        is_primary: false,
        phone_number: "",
        mobile_number: "",
        fax_number: "",
        email: "",
        contact_person: "",
        landmark: "",
        description: "",
        geo_lat: "",
        geo_lng: "",
        opening_time: "",
        closing_time: "",
        tax_id: "",
      });
      setCodeManuallyEdited(false);
      // Reset wizard state when creating new
      setShowPrompt(false);
      setShowWizard(false);
      setCreatedStoreId(null);
      setCreatedStoreName("");
      // If forceSetupWizard is true, prepare to skip prompt
      if (forceSetupWizard && open) {
        // We'll set showWizard after store is created
      }
    }
  }, [editing, open, forceSetupWizard]);

  if (!open) return null;

  const onChange = (k: keyof StoreCreatePayload, v: any) => {
    setForm((f) => ({ ...f, [k]: v }));
    
    // Track if user manually edits the code field
    if (k === "code" && !isEdit) {
      setCodeManuallyEdited(true);
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    (["code", "name", "timezone", "street", "city", "state", "postal_code", "country"] as const).forEach((k) => {
      const err = required(String((form as any)[k]));
      if (err) errors[k] = err;
    });
    return errors;
  };

  const submit = async () => {
    const errors = validate();
    if (Object.keys(errors).length) {
      error("Please fill all required fields.");
      return;
    }
    setSaving(true);
    try {
      // Prepare payload - send all fields, backend will handle empty strings
      const payload: StoreCreatePayload | StoreUpdatePayload = {
        code: form.code,
        name: form.name,
        timezone: form.timezone,
        street: form.street,
        city: form.city,
        state: form.state,
        postal_code: form.postal_code,
        country: form.country,
        is_active: form.is_active,
        region: form.region || undefined,
        is_primary: form.is_primary,
        phone_number: form.phone_number || undefined,
        mobile_number: form.mobile_number || undefined,
        fax_number: form.fax_number || undefined,
        email: form.email || undefined,
        contact_person: form.contact_person || undefined,
        landmark: form.landmark || undefined,
        description: form.description || undefined,
        geo_lat: form.geo_lat ? (typeof form.geo_lat === 'string' ? parseFloat(form.geo_lat) : form.geo_lat) : undefined,
        geo_lng: form.geo_lng ? (typeof form.geo_lng === 'string' ? parseFloat(form.geo_lng) : form.geo_lng) : undefined,
        opening_time: form.opening_time || undefined,
        closing_time: form.closing_time || undefined,
        tax_id: form.tax_id || undefined,
      };

      if (isEdit && editing) {
        const saved = await StoresAPI.update(editing.id, payload);
        success(`Store "${saved.code}" updated`);
        onSaved();
        onClose();
      } else {
        const saved = await StoresAPI.create(payload as StoreCreatePayload);
        success(`Store "${saved.code}" created`);
        
        // Store the created store info for the setup wizard
        setCreatedStoreId(saved.id);
        setCreatedStoreName(saved.name);
        
        // If forceSetupWizard is true, skip prompt and go directly to wizard
        if (forceSetupWizard) {
          setShowWizard(true);
        } else {
          // Show prompt for setup wizard
          setShowPrompt(true);
        }
        // Don't close modal yet - wait for user's response or wizard completion
      }
    } catch (e: any) {
      const msg = e?.message || "Failed to save store";
      error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePromptYes = () => {
    setShowPrompt(false);
    setShowWizard(true);
  };

  const handlePromptNo = () => {
    setShowPrompt(false);
    onSaved();
    onClose();
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    setCreatedStoreId(null);
    setCreatedStoreName("");
    onSaved();
    onClose();
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    setCreatedStoreId(null);
    setCreatedStoreName("");
    onSaved();
    onClose();
  };

  return (
    <>
      {/* Store Setup Prompt */}
      <StoreSetupPrompt
        open={showPrompt}
        storeName={createdStoreName}
        onYes={handlePromptYes}
        onNo={handlePromptNo}
      />

      {/* Store Setup Wizard */}
      {createdStoreId && (
        <StoreSetupWizard
          open={showWizard}
          storeId={createdStoreId}
          storeName={createdStoreName}
          onComplete={handleWizardComplete}
          onClose={handleWizardClose}
        />
      )}

      {/* Store Modal */}
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[800px] max-h-[90vh] rounded-xl border border-border bg-card flex flex-col">
        <div className="border-b border-border p-3 flex-shrink-0">
          <h3 className="font-semibold">{isEdit ? "Edit Store" : "New Store"}</h3>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {/* Basic Information */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">Basic Information</h4>
            <div className="grid grid-cols-2 gap-3">
              {/* Swapped: Name before Code */}
              <div>
                <label className="text-sm">Name *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.name}
                  onChange={(e) => onChange("name", e.target.value)}
                  placeholder="Store name"
                />
              </div>
              <div>
                <label className="text-sm">Code *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.code}
                  onChange={(e) => onChange("code", e.target.value)}
                  placeholder="Auto-generated from name"
                />
              </div>
              <div>
                <label className="text-sm">Timezone *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.timezone}
                  onChange={(e) => onChange("timezone", e.target.value)}
                  placeholder="e.g. America/Chicago"
                />
              </div>
              <div>
                <label className="text-sm">Region</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.region}
                  onChange={(e) => onChange("region", e.target.value)}
                  placeholder="e.g. Midwest"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={(e) => onChange("is_active", e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!form.is_primary}
                    onChange={(e) => onChange("is_primary", e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">Primary Store</span>
                </label>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">Address</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm">Street *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.street}
                  onChange={(e) => onChange("street", e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div>
                <label className="text-sm">City *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.city}
                  onChange={(e) => onChange("city", e.target.value)}
                  placeholder="City"
                />
              </div>
              <div>
                <label className="text-sm">State/Province *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.state}
                  onChange={(e) => onChange("state", e.target.value)}
                  placeholder="State or Province"
                />
              </div>
              <div>
                <label className="text-sm">Postal Code *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.postal_code}
                  onChange={(e) => onChange("postal_code", e.target.value)}
                  placeholder="Postal/ZIP code"
                />
              </div>
              <div>
                <label className="text-sm">Country *</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.country}
                  onChange={(e) => onChange("country", e.target.value)}
                  placeholder="Country"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm">Landmark</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.landmark}
                  onChange={(e) => onChange("landmark", e.target.value)}
                  placeholder="Nearby landmark or reference point"
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">Contact Information</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Phone Number</label>
                <input
                  type="tel"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.phone_number}
                  onChange={(e) => onChange("phone_number", e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="text-sm">Mobile Number</label>
                <input
                  type="tel"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.mobile_number}
                  onChange={(e) => onChange("mobile_number", e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="text-sm">Fax Number</label>
                <input
                  type="tel"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.fax_number}
                  onChange={(e) => onChange("fax_number", e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="text-sm">Email</label>
                <input
                  type="email"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.email}
                  onChange={(e) => onChange("email", e.target.value)}
                  placeholder="store@example.com"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm">Contact Person</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.contact_person}
                  onChange={(e) => onChange("contact_person", e.target.value)}
                  placeholder="Name of primary contact"
                />
              </div>
            </div>
          </div>

          {/* Location (Coordinates) */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">Location (Coordinates)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Latitude</label>
                <input
                  type="number"
                  step="any"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.geo_lat}
                  onChange={(e) => onChange("geo_lat", e.target.value)}
                  placeholder="e.g. 41.8781"
                />
              </div>
              <div>
                <label className="text-sm">Longitude</label>
                <input
                  type="number"
                  step="any"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.geo_lng}
                  onChange={(e) => onChange("geo_lng", e.target.value)}
                  placeholder="e.g. -87.6298"
                />
              </div>
            </div>
          </div>

          {/* Store Hours */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">Store Hours</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Opening Time</label>
                <input
                  type="time"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.opening_time}
                  onChange={(e) => onChange("opening_time", e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm">Closing Time</label>
                <input
                  type="time"
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.closing_time}
                  onChange={(e) => onChange("closing_time", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Business Information */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">Business Information</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Tax ID</label>
                <input
                  className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
                  value={form.tax_id}
                  onChange={(e) => onChange("tax_id", e.target.value)}
                  placeholder="Tax identification number"
                />
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border">Additional Details</h4>
            <div>
              <label className="text-sm">Description</label>
              <textarea
                className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary resize-none"
                rows={3}
                value={form.description}
                onChange={(e) => onChange("description", e.target.value)}
                placeholder="Additional notes or description about the store"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-3 py-1.5 rounded-md bg-success hover:bg-success/90 text-success-foreground transition-colors"
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
