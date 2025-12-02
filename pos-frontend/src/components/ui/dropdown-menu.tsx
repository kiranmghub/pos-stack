// pos-frontend/src/components/ui/dropdown-menu.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function DropdownMenu({ trigger, children, align = "right", className }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {trigger}
      </div>
      {open && (
        <div
          className={cn(
            "absolute z-50 mt-2 min-w-[200px] rounded-lg border border-border bg-card shadow-lg",
            align === "right" ? "right-0" : "left-0",
            className
          )}
          style={{ 
            animation: "fadeIn 0.15s ease-out forwards"
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: "default" | "destructive";
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
  variant = "default",
}: DropdownMenuItemProps) {
  return (
    <div
      onClick={() => {
        onClick?.();
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors",
        "hover:bg-muted",
        variant === "destructive" && "text-destructive hover:bg-destructive/10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator() {
  return <div className="h-px bg-border my-1" />;
}

export function DropdownMenuHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-3 py-2 border-b border-border", className)}>
      {children}
    </div>
  );
}

