// pos-frontend/src/features/sales/components/CustomerEditDrawer.tsx
import * as React from "react";
import type { CustomerDetail } from "../api";
import { getCustomer, updateCustomer } from "../api";
import { useNotify } from "@/lib/notify";

type CustomerEditDrawerProps = {
  customerId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (updated: CustomerDetail) => void;
  startInViewMode?: boolean;
};

export const CustomerEditDrawer: React.FC<CustomerEditDrawerProps> = ({
  customerId,
  open,
  onClose,
  onSaved,
  startInViewMode = false,
}) => {
  const { success, error } = useNotify();

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);

  const [isEditing, setIsEditing] = React.useState(false);


  // form state
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address1, setAddress1] = React.useState("");
  const [address2, setAddress2] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [marketingOptIn, setMarketingOptIn] = React.useState(false);
  const [smsOptIn, setSmsOptIn] = React.useState(false);
  const [isLoyaltyMember, setIsLoyaltyMember] = React.useState(false);
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [gender, setGender] = React.useState("");

  // load detail when opening
  React.useEffect(() => {
    if (!open || !customerId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const data = await getCustomer(customerId);
        if (!alive) return;
        setDetail(data);
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setEmail(data.email || "");
        setPhone(data.phone_number || "");
        setAddress1(data.address_line1 || "");
        setAddress2(data.address_line2 || "");
        setCity(data.city || "");
        setRegion(data.state_province || "");
        setPostalCode(data.postal_code || "");
        setCountry(data.country || "");
        setMarketingOptIn(!!data.marketing_opt_in);
        setSmsOptIn(!!data.sms_opt_in);
        setIsLoyaltyMember(!!data.is_loyalty_member);
        setDateOfBirth(data.date_of_birth || "");
        setGender(data.gender || "");
        setIsEditing(!startInViewMode);
      } catch (e: any) {
        error(e?.message || "Unable to load customer");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, customerId, startInViewMode]);

  if (!open || !customerId) return null;

    const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!detail) return;
    try {
      setSaving(true);
      const payload: Partial<CustomerDetail> = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: email.trim() || null,
        phone_number: phone.trim() || null,
        address_line1: address1.trim() || null,
        address_line2: address2.trim() || null,
        city: city.trim() || null,
        state_province: region.trim() || null,
        postal_code: postalCode.trim() || null,
        country: country.trim() || null,
        marketing_opt_in: marketingOptIn,
        sms_opt_in: smsOptIn,
        is_loyalty_member: isLoyaltyMember,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
      };
      const updated = await updateCustomer(customerId, payload);
      success("Customer updated");
      onSaved?.(updated);
      onClose();
    } catch (e: any) {
      error(e?.message || "Unable to save customer");
    } finally {
      setSaving(false);
    }
  };

  const dateJoinedLabel = detail?.created_at
    ? new Date(detail.created_at).toLocaleString()
    : "—";

  return (
    <div className="fixed inset-0 z-[85] flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Edit customer
            </div>
            <div className="text-lg font-semibold text-zinc-50">
              {detail?.full_name || "Customer"}
            </div>
            <div className="text-xs text-zinc-500">
              Joined: {dateJoinedLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-700 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form id="customer-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {loading && (
            <div className="text-sm text-zinc-400">Loading…</div>
          )}

          {!loading && (
            <>
              {/* Identity */}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
                    First name
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
                    Last name
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
                    Email
                  </label>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
                    Phone
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Address
                </div>
                <input
                  placeholder="Address line 1"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  disabled={!isEditing}
                />
                <input
                  placeholder="Address line 2"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  disabled={!isEditing}
                />
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    placeholder="City"
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={!isEditing}
                  />
                  <input
                    placeholder="State / Province"
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    disabled={!isEditing}
                  />
                  <input
                    placeholder="Postal code"
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
                <input
                  placeholder="Country (ISO 2-letter code)"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  disabled={!isEditing}
                />
              </div>

              {/* Personal */}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
                    Date of birth
                  </label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={dateOfBirth || ""}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wide text-zinc-500">
                    Gender
                  </label>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none"
                    value={gender || ""}
                    onChange={(e) => setGender(e.target.value)}
                    placeholder="Optional"
                    disabled={!isEditing}
                  />
                </div>
              </div>

              {/* Preferences & loyalty */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Consent & marketing
                  </div>
                  <label className="mt-1 flex items-center gap-2 text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                      disabled={!isEditing}
                    />
                    Email marketing opt-in
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                      checked={smsOptIn}
                      onChange={(e) => setSmsOptIn(e.target.checked)}
                      disabled={!isEditing}
                    />
                    SMS opt-in
                  </label>
                </div>

                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Loyalty
                  </div>
                  <label className="mt-1 flex items-center gap-2 text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-zinc-600 bg-zinc-900"
                      checked={isLoyaltyMember}
                      onChange={(e) => setIsLoyaltyMember(e.target.checked)}
                      disabled={!isEditing}
                    />
                    Mark as loyalty program member
                  </label>
                  <div className="text-[11px] text-zinc-500">
                    They&apos;ll earn points when making purchases, based on your
                    loyalty settings.
                  </div>
                </div>
              </div>
            </>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-sm">
        <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
        >
            {isEditing ? "Cancel" : "Close"}
        </button>

        {isEditing ? (
        <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={saving || loading}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
            {saving ? "Saving…" : "Save changes"}
        </button>
        ) : (
        <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
            Edit
        </button>
        )}


        </div>

      </div>
    </div>
  );
};
