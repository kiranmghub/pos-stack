// pos-frontend/src/features/inventory/operations/transfers/TransferStatusBadge.tsx
import React from "react";
import { StatusBadge, type StatusVariant } from "../../components/StatusBadge";

export type TransferStatus = "DRAFT" | "SENT" | "IN_TRANSIT" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface TransferStatusBadgeProps {
  /** Transfer status */
  status: TransferStatus;
  /** Custom className */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const statusLabelMap: Record<TransferStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  IN_TRANSIT: "In Transit",
  PARTIAL_RECEIVED: "Partial Received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

const statusVariantMap: Record<TransferStatus, StatusVariant> = {
  DRAFT: "draft",
  SENT: "pending",
  IN_TRANSIT: "in_transit",
  PARTIAL_RECEIVED: "partial",
  RECEIVED: "completed",
  CANCELLED: "cancelled",
};

/**
 * TransferStatusBadge - Displays transfer status with appropriate color coding
 * Security: Display-only component
 */
export function TransferStatusBadge({
  status,
  className,
  size = "md",
}: TransferStatusBadgeProps) {
  return (
    <StatusBadge
      status={statusLabelMap[status]}
      variant={statusVariantMap[status]}
      size={size}
      className={className}
    />
  );
}

