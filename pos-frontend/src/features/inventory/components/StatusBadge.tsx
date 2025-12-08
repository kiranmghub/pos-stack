// pos-frontend/src/features/inventory/components/StatusBadge.tsx
import React from "react";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "draft"
  | "pending"
  | "in_progress"
  | "in_transit"
  | "partial"
  | "completed"
  | "received"
  | "cancelled"
  | "active"
  | "inactive"
  | "success"
  | "error"
  | "warning"
  | "info";

export interface StatusBadgeProps {
  /** Status text to display */
  status: string;
  /** Status variant for color coding */
  variant?: StatusVariant;
  /** Custom className */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const statusVariantMap: Record<StatusVariant, { bg: string; text: string; ring: string }> = {
  draft: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    ring: "ring-border",
  },
  pending: {
    bg: "bg-badge-info-bg",
    text: "text-badge-info-text",
    ring: "ring-info/30",
  },
  in_progress: {
    bg: "bg-badge-primary-bg",
    text: "text-badge-primary-text",
    ring: "ring-primary/30",
  },
  in_transit: {
    bg: "bg-badge-info-bg",
    text: "text-badge-info-text",
    ring: "ring-info/30",
  },
  partial: {
    bg: "bg-badge-warning-bg",
    text: "text-badge-warning-text",
    ring: "ring-warning/30",
  },
  completed: {
    bg: "bg-badge-success-bg",
    text: "text-badge-success-text",
    ring: "ring-success/30",
  },
  received: {
    bg: "bg-badge-success-bg",
    text: "text-badge-success-text",
    ring: "ring-success/30",
  },
  cancelled: {
    bg: "bg-badge-error-bg",
    text: "text-badge-error-text",
    ring: "ring-error/30",
  },
  active: {
    bg: "bg-badge-success-bg",
    text: "text-badge-success-text",
    ring: "ring-success/30",
  },
  inactive: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    ring: "ring-border",
  },
  success: {
    bg: "bg-badge-success-bg",
    text: "text-badge-success-text",
    ring: "ring-success/30",
  },
  error: {
    bg: "bg-badge-error-bg",
    text: "text-badge-error-text",
    ring: "ring-error/30",
  },
  warning: {
    bg: "bg-badge-warning-bg",
    text: "text-badge-warning-text",
    ring: "ring-warning/30",
  },
  info: {
    bg: "bg-badge-info-bg",
    text: "text-badge-info-text",
    ring: "ring-info/30",
  },
};

const sizeClasses = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-sm",
};

/**
 * StatusBadge - Displays status with color-coded badge
 * 
 * Automatically maps common status strings to variants, or uses provided variant
 */
export function StatusBadge({
  status,
  variant,
  className,
  size = "md",
}: StatusBadgeProps) {
  // Auto-detect variant from status string if not provided
  const detectedVariant: StatusVariant = variant || (() => {
    const lower = status.toLowerCase();
    if (lower.includes("draft")) return "draft";
    if (lower.includes("pending") || lower.includes("awaiting")) return "pending";
    if (lower.includes("in progress") || lower.includes("in_progress")) return "in_progress";
    if (lower.includes("in transit") || lower.includes("in_transit")) return "in_transit";
    if (lower.includes("partial")) return "partial";
    if (lower.includes("completed") || lower.includes("finalized")) return "completed";
    if (lower.includes("received")) return "received";
    if (lower.includes("cancelled") || lower.includes("cancelled")) return "cancelled";
    if (lower.includes("active")) return "active";
    if (lower.includes("inactive")) return "inactive";
    return "info";
  })();

  const colors = statusVariantMap[detectedVariant];
  const sizeClass = sizeClasses[size];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium ring-1 ring-inset",
        colors.bg,
        colors.text,
        colors.ring,
        sizeClass,
        className
      )}
    >
      {status}
    </span>
  );
}

