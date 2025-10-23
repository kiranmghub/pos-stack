// pos-frontend/src/features/admin/components/ui/Checkbox.tsx
// Temporary proxy to shadcn checkbox to avoid touching all call sites.
// In components/ui/Checkbox.tsx, add a 2-line header comment noting it proxies shadcn and is a temporary adapter.
// This prevents future confusion and reminds us to replace call sites with @/ui/checkbox directly later.
"use client";
import * as React from "react";
import { Checkbox as Base } from "@/ui/checkbox";

type Props = {
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  title?: string;
  "aria-label"?: string;
};

const Checkbox = React.forwardRef<HTMLInputElement, Props>(
  ({ checked, indeterminate, disabled, onChange, className, title, ...rest }, ref) => {
    return (
      <label title={title} className={disabled ? "opacity-60" : ""}>
        <Base
          ref={ref as any}
          checked={indeterminate ? "indeterminate" : !!checked}
          className={[
            "h-4 w-4 border",
            "border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=indeterminate]:bg-emerald-600",
            className || "",
          ].join(" ")}
          onCheckedChange={(v) => {
            const fake = { target: { checked: v === true } } as unknown as React.ChangeEvent<HTMLInputElement>;
            onChange?.(fake);
          }}
          disabled={disabled}
          aria-label={rest["aria-label"]}
        />
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";
export default Checkbox;
