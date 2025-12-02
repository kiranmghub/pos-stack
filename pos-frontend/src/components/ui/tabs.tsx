// pos-frontend/src/components/ui/tabs.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tabsListVariants = cva(
  "inline-flex items-center gap-1 rounded-xl border border-border bg-background/70 p-1",
  {
    variants: {
      variant: {
        default: "flex w-full items-center gap-1 rounded-xl border border-border bg-background/70 p-1",
        pills: "gap-2 border-0 bg-transparent p-0",
        underline: "gap-4 border-b border-border bg-transparent p-0 rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: [
          "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow",
          "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50",
        ],
        pills: [
          "data-[state=active]:bg-surface-raised data-[state=active]:text-foreground data-[state=active]:shadow",
          "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted",
        ],
        underline: [
          "rounded-none border-b-2 border-transparent px-1 pb-2",
          "data-[state=active]:border-primary data-[state=active]:text-foreground",
          "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:border-muted-foreground/50",
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  variant?: "default" | "pills" | "underline";
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  variant?: "default" | "pills" | "underline";
  children: React.ReactNode;
  className?: string;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ value, onValueChange, variant = "default", children, className, ...props }, ref) => {
    return (
      <TabsContext.Provider value={{ value, onValueChange, variant }}>
        <div ref={ref} className={cn("w-full", className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = "Tabs";

export interface TabsListProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof tabsListVariants> {
  className?: string;
}

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, variant, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    const effectiveVariant = variant ?? context?.variant ?? "default";
    
    return (
      <div
        ref={ref}
        className={cn(tabsListVariants({ variant: effectiveVariant }), className)}
        role="tablist"
        {...props}
      />
    );
  }
);
TabsList.displayName = "TabsList";

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof tabsTriggerVariants> {
  value: string;
  icon?: React.ReactNode;
  className?: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, icon, className, variant, children, disabled, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) {
      throw new Error("TabsTrigger must be used within Tabs");
    }

    const effectiveVariant = variant ?? context.variant ?? "default";
    const isActive = context.value === value;
    const state = isActive ? "active" : "inactive";

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-controls={`tabpanel-${value}`}
        data-state={state}
        disabled={disabled}
        onClick={() => !disabled && context.onValueChange(value)}
        className={cn(tabsTriggerVariants({ variant: effectiveVariant }), className)}
        {...props}
      >
        {icon && <span className="inline-flex items-center">{icon}</span>}
        {children && <span>{children}</span>}
      </button>
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  className?: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, className, children, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) {
      throw new Error("TabsContent must be used within Tabs");
    }

    if (context.value !== value) {
      return null;
    }

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`tabpanel-${value}`}
        aria-labelledby={`tab-${value}`}
        className={cn("mt-4", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = "TabsContent";

// Simplified API for common use cases
export interface TabItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SimpleTabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: "default" | "pills" | "underline";
  className?: string;
  listClassName?: string;
}

export const SimpleTabs = React.forwardRef<HTMLDivElement, SimpleTabsProps>(
  ({ tabs, value, onValueChange, variant = "default", className, listClassName, ...props }, ref) => {
    return (
      <Tabs value={value} onValueChange={onValueChange} variant={variant} className={className} ref={ref} {...props}>
        <TabsList variant={variant} className={listClassName}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} icon={tab.icon} disabled={tab.disabled}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    );
  }
);
SimpleTabs.displayName = "SimpleTabs";

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants };

