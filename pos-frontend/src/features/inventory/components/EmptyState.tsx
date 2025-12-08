// pos-frontend/src/features/inventory/components/EmptyState.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { Package, Inbox, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  /** Icon to display */
  icon?: React.ReactNode;
  /** Title text */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Custom className */
  className?: string;
  /** Variant type for default icons */
  variant?: "default" | "search" | "error" | "empty";
}

const defaultIcons = {
  default: Package,
  search: Search,
  error: AlertCircle,
  empty: Inbox,
};

/**
 * EmptyState - Displays an empty state message with optional actions
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  variant = "default",
}: EmptyStateProps) {
  const DefaultIcon = defaultIcons[variant];
  const displayIcon = icon || <DefaultIcon className="h-12 w-12" />;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="mb-4 text-muted-foreground">{displayIcon}</div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex gap-3">
          {action && (
            <Button onClick={action.onClick} variant="default">
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant="outline">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

