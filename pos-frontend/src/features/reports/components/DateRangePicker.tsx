// pos-frontend/src/features/reports/components/DateRangePicker.tsx
import React, { useMemo } from "react";
import { Calendar } from "lucide-react";

type DatePreset = "today" | "last7days" | "last30days" | "thisMonth" | "lastMonth" | "custom";

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  preset?: DatePreset;
  onPresetChange?: (preset: DatePreset) => void;
}

/**
 * DateRangePicker component with preset options for common date ranges.
 * Handles date validation and provides preset buttons for quick selection.
 */
export function DateRangePicker({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  preset = "custom",
  onPresetChange,
}: DateRangePickerProps) {
  const presets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const last7Days = new Date(today);
    last7Days.setDate(today.getDate() - 6);
    
    const last30Days = new Date(today);
    last30Days.setDate(today.getDate() - 29);
    
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    lastMonthEnd.setHours(23, 59, 59, 999);

    return {
      today: {
        from: today.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      },
      last7days: {
        from: last7Days.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      },
      last30days: {
        from: last30Days.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      },
      thisMonth: {
        from: thisMonthStart.toISOString().split("T")[0],
        to: today.toISOString().split("T")[0],
      },
      lastMonth: {
        from: lastMonthStart.toISOString().split("T")[0],
        to: lastMonthEnd.toISOString().split("T")[0],
      },
    };
  }, []);

  const handlePresetClick = (presetKey: DatePreset) => {
    if (presetKey === "custom") {
      if (onPresetChange) {
        onPresetChange("custom");
      }
      return;
    }

    const presetDates = presets[presetKey as keyof typeof presets];
    if (presetDates) {
      onDateFromChange(presetDates.from);
      onDateToChange(presetDates.to);
      if (onPresetChange) {
        onPresetChange(presetKey);
      }
    }
  };

  const isValidRange = dateFrom && dateTo && dateFrom <= dateTo;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Date Range</span>
      </div>
      
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "today", label: "Today" },
          { key: "last7days", label: "Last 7 Days" },
          { key: "last30days", label: "Last 30 Days" },
          { key: "thisMonth", label: "This Month" },
          { key: "lastMonth", label: "Last Month" },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handlePresetClick(key as DatePreset)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              preset === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date inputs */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              onDateFromChange(e.target.value);
              if (onPresetChange) {
                onPresetChange("custom");
              }
            }}
            max={dateTo || undefined}
            className="w-full rounded-md border border-border bg-card text-sm text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              onDateToChange(e.target.value);
              if (onPresetChange) {
                onPresetChange("custom");
              }
            }}
            min={dateFrom || undefined}
            className="w-full rounded-md border border-border bg-card text-sm text-foreground px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {!isValidRange && dateFrom && dateTo && (
        <p className="text-xs text-destructive">
          Start date must be before or equal to end date
        </p>
      )}
    </div>
  );
}

