// pos-frontend/src/features/admin/settings/SettingsTab.tsx
import React, { useState, useEffect, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { useNotify } from "@/lib/notify";
import { getTenantDetails, uploadTenantLogo, type TenantDetails } from "../api/tenant";

export default function SettingsTab() {
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newLogo, setNewLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success, error } = useNotify();

  useEffect(() => {
    loadTenant();
  }, []);

  async function loadTenant() {
    setLoading(true);
    try {
      const data = await getTenantDetails();
      setTenant(data);
      // Set preview from existing logo (prefer logo_file_url over logo_url)
      const logoUrl = data.logo_file_url || data.logo_url;
      if (logoUrl) {
        setPreviewUrl(logoUrl);
      } else {
        setPreviewUrl(null);
      }
    } catch (err: any) {
      error(err.message || "Failed to load tenant details");
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        error("Please select an image file");
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        error("Image size must be less than 5MB");
        return;
      }
      setNewLogo(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleUpload() {
    if (!newLogo) return;

    setUploading(true);
    try {
      const result = await uploadTenantLogo(newLogo);
      success("Logo uploaded successfully");
      setNewLogo(null);
      // Reload tenant to get updated logo URL
      await loadTenant();
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      // Dispatch event to notify AppShell to refresh logo
      window.dispatchEvent(new CustomEvent("tenant:logo:uploaded"));
    } catch (err: any) {
      error(err.message || "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  }

  function handleRemovePreview() {
    setNewLogo(null);
    setPreviewUrl(tenant?.logo_file_url || tenant?.logo_url || null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Failed to load tenant details
      </div>
    );
  }

  const currentLogoUrl = tenant.logo_file_url || tenant.logo_url;
  const hasNewLogo = newLogo !== null;

  return (
    <div className="space-y-6">
      {/* Tenant Information */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Tenant Information</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Tenant Name
            </label>
            <div className="text-sm font-medium">{tenant.name}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Tenant Code
            </label>
            <div className="text-sm font-medium uppercase">{tenant.code}</div>
          </div>
          {tenant.email && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Email
              </label>
              <div className="text-sm">{tenant.email}</div>
            </div>
          )}
          {tenant.business_phone && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Business Phone
              </label>
              <div className="text-sm">{tenant.business_phone}</div>
            </div>
          )}
        </div>
      </div>

      {/* Logo Upload */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Tenant Logo</h2>
        <div className="space-y-4">
          {/* Current Logo Preview */}
          {(currentLogoUrl || previewUrl) && (
            <div className="flex items-start gap-4">
              <div className="relative">
                <img
                  src={previewUrl || currentLogoUrl || ""}
                  alt="Tenant logo"
                  className="h-32 w-32 rounded-lg object-contain border border-border bg-muted/20 p-2"
                  onError={(e) => {
                    console.error("Failed to load logo image:", previewUrl || currentLogoUrl);
                    // Don't hide, just show error state
                    (e.target as HTMLImageElement).style.opacity = "0.5";
                  }}
                />
                {hasNewLogo && (
                  <button
                    onClick={handleRemovePreview}
                    className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:bg-destructive/90"
                    title="Remove new logo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  {hasNewLogo
                    ? "New logo preview (click Upload to save)"
                    : "Current tenant logo"}
                </p>
                {currentLogoUrl && !hasNewLogo && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Logo will be displayed in the header and throughout the application
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Upload Area */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              {currentLogoUrl ? "Replace Logo" : "Upload Logo"}
            </label>
            <label className="flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-6 w-6" />
                <span>Drag & drop or click to upload</span>
                <span className="text-xs">PNG, JPG, GIF up to 5MB</span>
              </div>
            </label>
          </div>

          {/* Upload Button */}
          {hasNewLogo && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload Logo
                  </>
                )}
              </button>
              <button
                onClick={handleRemovePreview}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

