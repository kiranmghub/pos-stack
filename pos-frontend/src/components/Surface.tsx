import React from "react";
import { cn } from "@/lib/utils";

type SurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  level?: 0 | 1 | 2;
};

export function Surface({ level = 0, className, ...rest }: SurfaceProps) {
  const levelClass =
    level === 0 ? "bg-background" : level === 1 ? "bg-surface-panel" : "bg-surface-raised";
  return <div className={cn(levelClass, "border border-border", className)} {...rest} />;
}
