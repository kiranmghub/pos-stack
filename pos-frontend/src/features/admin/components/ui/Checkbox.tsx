// pos-frontend/src/features/admin/components/ui/Checkbox.tsx
import * as React from "react";
import { cn } from "@/lib/utils"; // if you don't have a cn helper, replace cn(...) with a simple join

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
    const inputRef = React.useRef<HTMLInputElement>(null);

    // expose the input ref
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // apply indeterminate to the real input
    React.useEffect(() => {
      if (inputRef.current) {
        inputRef.current.indeterminate = !!indeterminate && !checked;
      }
    }, [indeterminate, checked]);

    return (
      <label
        className={cn(
          "inline-flex items-center gap-2 cursor-pointer select-none",
          disabled && "opacity-60 cursor-not-allowed",
          className
        )}
        title={title}
      >
        {/* Visually-hidden native input for a11y/keyboard */}
        <input
          ref={inputRef}
          type="checkbox"
          className="sr-only"
          checked={!!checked}
          disabled={disabled}
          onChange={onChange}
          {...rest}
        />
        {/* Visible control */}
        <span
          className={cn(
            "grid place-content-center h-4 w-4 rounded border transition-colors",
            "border-slate-600 bg-slate-900",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
            checked && "bg-emerald-600 border-emerald-500",
            indeterminate && !checked && "bg-emerald-600 border-emerald-500"
          )}
          aria-hidden="true"
        >
          {/* check glyph */}
          <svg
            className={cn(
              "h-3 w-3 text-white transition-opacity",
              checked ? "opacity-100" : "opacity-0"
            )}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6.173 12.414l-3.89-3.89 1.414-1.415 2.476 2.476 6.131-6.131 1.414 1.414z" />
          </svg>
          {/* indeterminate bar */}
          <span
            className={cn(
              "h-0.5 w-2.5 rounded bg-white transition-opacity",
              indeterminate && !checked ? "opacity-100" : "opacity-0"
            )}
          />
        </span>
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
export default Checkbox;

// If you don't have cn helper, you can export a simple one:
// export function cn(...a:(string|false|undefined|null)[]){return a.filter(Boolean).join(" ")}
