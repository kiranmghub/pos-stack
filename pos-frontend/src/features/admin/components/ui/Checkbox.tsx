// pos-frontend/src/features/admin/components/ui/Checkbox.tsx
// Temporary proxy to shadcn checkbox to avoid touching all call sites.
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





// import * as React from "react";

// type Props = {
//   checked?: boolean;
//   indeterminate?: boolean;
//   disabled?: boolean;
//   onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
//   className?: string;
//   title?: string;
//   "aria-label"?: string;
// };

// const Checkbox = React.forwardRef<HTMLInputElement, Props>(
//   ({ checked, indeterminate, disabled, onChange, className, title, ...rest }, ref) => {
//     const inputRef = React.useRef<HTMLInputElement>(null);

//     React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

//     React.useEffect(() => {
//       if (inputRef.current) {
//         inputRef.current.indeterminate = !!indeterminate && !checked;
//       }
//     }, [indeterminate, checked]);

//     const showDash = !!indeterminate && !checked;

//     return (
//       <label
//         title={title}
//         className={[
//           "inline-flex items-center gap-2 select-none",
//           disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
//           className || "",
//         ].join(" ")}
//           onKeyDown={(e) => {
//             if (e.key === " " || e.key === "Enter") {
//               e.preventDefault();
//               (inputRef.current as HTMLInputElement)?.click();
//             }
//           }}
//           tabIndex={disabled ? -1 : 0}
//       >
//         {/* A11y / keyboard */}
//         <input
//           ref={inputRef}
//           type="checkbox"
//           className="peer sr-only"
//           checked={!!checked}
//           disabled={disabled}
//           onChange={onChange}
//           {...rest}
//         />

//         {/* Visible box */}
//         <span
//           className={[
//             "relative grid place-content-center h-4 w-4 rounded border transition-all",
//             "border-slate-600 bg-slate-900",
//             // peer-checked paints green
//             "peer-checked:bg-emerald-600 peer-checked:border-emerald-500",
//             // focus ring on keyboard nav
//             "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
//             // render a white ✓ when checked
//             "after:content-[''] peer-checked:after:content-['✓'] after:text-white after:text-[10px] after:leading-none after:transition-opacity",
//           ].join(" ")}
//           aria-hidden="true"
//         >
//           {/* Indeterminate white bar */}
//           {showDash && (
//             <span className="absolute h-0.5 w-2.5 rounded bg-white" />
//           )}
//         </span>
//       </label>
//     );
//   }
// );

// Checkbox.displayName = "Checkbox";
// export default Checkbox;
