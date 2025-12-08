// pos-frontend/src/features/admin/stores/components/RegisterFormItem.tsx
import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getTenantCode } from "@/lib/auth";
import { generateCode } from "@/features/onboarding/api";
import { slugifyLocal, stripTenantPrefix, CODE_PREFIXES } from "../../utils/codeGeneration";

export type RegisterFormData = {
  name: string;
  code: string;
  hardware_profile: Record<string, any>;
};

type Props = {
  storeId: number;
  storeName: string;
  value: RegisterFormData;
  onChange: (value: RegisterFormData) => void;
  onRemove: () => void;
  index: number;
  canRemove: boolean;
};

export default function RegisterFormItem({
  storeId,
  storeName,
  value,
  onChange,
  onRemove,
  index,
  canRemove,
}: Props) {
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [tenantCode, setTenantCode] = useState<string>("");
  const codeGenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const code = getTenantCode();
    if (code) setTenantCode(code);
  }, []);

  // Auto-generate code when name changes
  useEffect(() => {
    if (codeManuallyEdited || !value.name.trim() || !tenantCode) return;

    if (codeGenTimeoutRef.current) {
      clearTimeout(codeGenTimeoutRef.current);
    }

    codeGenTimeoutRef.current = setTimeout(async () => {
      try {
        const tenantSlugClean = slugifyLocal(stripTenantPrefix(tenantCode));
        const nameSlug = slugifyLocal(value.name);
        const prefix = CODE_PREFIXES.register;
        const parts = [prefix, tenantSlugClean, nameSlug || "register"].filter(Boolean);
        const combined = parts.join("-").replace(/--+/g, "-");

        const res = await generateCode("register", combined);
        onChange({ ...value, code: res.code });
      } catch (e: any) {
        console.error("Failed to generate code:", e);
      }
    }, 500);

    return () => {
      if (codeGenTimeoutRef.current) {
        clearTimeout(codeGenTimeoutRef.current);
      }
    };
  }, [value.name, tenantCode, codeManuallyEdited, onChange]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Register {index + 1}</h4>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm">Name</label>
          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
            placeholder="Register name"
          />
        </div>
        <div>
          <label className="text-sm">Code *</label>
          <input
            type="text"
            value={value.code}
            onChange={(e) => {
              onChange({ ...value, code: e.target.value });
              setCodeManuallyEdited(true);
            }}
            className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none border border-border focus:border-primary"
            placeholder="Auto-generated from name"
          />
        </div>
      </div>

      <div>
        <label className="text-sm">Store</label>
        <input
          type="text"
          value={storeName}
          disabled
          className="w-full mt-1 rounded-md bg-muted/50 px-3 py-2 text-sm outline-none border border-border opacity-60 cursor-not-allowed"
        />
      </div>
    </div>
  );
}

