// pos-frontend/src/features/inventory/components/LoadingSkeleton.tsx
import React from "react";
import { cn } from "@/lib/utils";

export interface LoadingSkeletonProps {
  /** Custom className */
  className?: string;
  /** Number of lines (for text skeleton) */
  lines?: number;
  /** Variant type */
  variant?: "text" | "circular" | "rectangular" | "card";
  /** Width (for rectangular/card) */
  width?: string | number;
  /** Height (for rectangular/card) */
  height?: string | number;
}

/**
 * LoadingSkeleton - Displays a loading skeleton placeholder
 */
export function LoadingSkeleton({
  className,
  lines = 1,
  variant = "rectangular",
  width,
  height,
}: LoadingSkeletonProps) {
  const baseClasses = "animate-pulse bg-muted rounded";

  if (variant === "text") {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              baseClasses,
              i === lines - 1 ? "w-3/4" : "w-full",
              "h-4"
            )}
          />
        ))}
      </div>
    );
  }

  if (variant === "circular") {
    return (
      <div
        className={cn(
          baseClasses,
          "rounded-full",
          width || "w-12",
          height || "h-12",
          className
        )}
        style={{
          width: typeof width === "number" ? `${width}px` : width,
          height: typeof height === "number" ? `${height}px` : height,
        }}
      />
    );
  }

  if (variant === "card") {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-4 space-y-3",
          className
        )}
      >
        <div className={cn(baseClasses, "h-4 w-1/3")} />
        <div className={cn(baseClasses, "h-8 w-1/2")} />
        <div className={cn(baseClasses, "h-3 w-2/3")} />
      </div>
    );
  }

  // rectangular (default)
  return (
    <div
      className={cn(
        baseClasses,
        width || "w-full",
        height || "h-20",
        className
      )}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

/**
 * LoadingSkeletonTable - Skeleton for table rows
 */
export function LoadingSkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <LoadingSkeleton
              key={colIdx}
              variant="rectangular"
              height={40}
              className="flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

