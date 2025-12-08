// pos-frontend/src/features/inventory/audit/LedgerFilterPresets.tsx
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Trash2, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterPreset {
  id: string;
  name: string;
  filters: {
    storeId: number | null;
    searchQuery: string;
    selectedRefTypes: string[];
    dateFrom: string | null;
    dateTo: string | null;
    variantId: number | null;
    refId: number | null;
  };
  createdAt: string;
}

export interface LedgerFilterPresetsProps {
  /** Current filter values */
  currentFilters: {
    storeId: number | null;
    searchQuery: string;
    selectedRefTypes: string[];
    dateFrom: string | null;
    dateTo: string | null;
    variantId: number | null;
    refId: number | null;
  };
  /** On preset apply handler */
  onApplyPreset: (preset: FilterPreset) => void;
  /** On preset save handler */
  onSavePreset: (name: string, filters: FilterPreset["filters"]) => void;
  /** On preset delete handler */
  onDeletePreset: (presetId: string) => void;
}

const STORAGE_KEY = "inventory_ledger_filter_presets";

/**
 * LedgerFilterPresets - Component for managing saved filter presets
 * Security: Presets are stored in localStorage (client-side only)
 */
export function LedgerFilterPresets({
  currentFilters,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: LedgerFilterPresetsProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  // Load presets from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPresets(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error("Failed to load filter presets:", error);
    }
  }, []);

  // Save presets to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error("Failed to save filter presets:", error);
    }
  }, [presets]);

  const handleSavePreset = () => {
    if (!presetName.trim()) return;

    const newPreset: FilterPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: presetName.trim(),
      filters: { ...currentFilters },
      createdAt: new Date().toISOString(),
    };

    setPresets([...presets, newPreset]);
    onSavePreset(newPreset.name, newPreset.filters);
    setPresetName("");
    setShowSaveDialog(false);
  };

  const handleDeletePreset = (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPresets(presets.filter((p) => p.id !== presetId));
    onDeletePreset(presetId);
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    onApplyPreset(preset);
    setShowPresets(false);
  };

  const hasActiveFilters = Object.values(currentFilters).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== "";
  });

  return (
    <>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPresets(!showPresets)}
          className="h-8"
        >
          <Filter className="h-4 w-4 mr-2" />
          Presets
          {presets.length > 0 && (
            <span className="ml-2 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-xs">
              {presets.length}
            </span>
          )}
        </Button>

        {/* Presets dropdown */}
        {showPresets && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowPresets(false)}
            />
            <div className="absolute top-full left-0 mt-2 w-64 rounded-lg border border-border bg-card shadow-lg z-50">
              <div className="p-2 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Saved Presets</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPresets(false)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowSaveDialog(true);
                      setShowPresets(false);
                    }}
                    className="w-full h-8 text-xs"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save Current Filters
                  </Button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {presets.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No saved presets
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                          "hover:bg-accent flex items-center justify-between group"
                        )}
                      >
                        <span className="font-medium text-foreground truncate flex-1">
                          {preset.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePreset(preset.id, e)}
                          className={cn(
                            "ml-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                            "hover:bg-destructive/10 text-destructive"
                          )}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Save Preset Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Filter Preset</DialogTitle>
            <DialogDescription>
              Save your current filter settings for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g., Low Stock Adjustments"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && presetName.trim()) {
                    handleSavePreset();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Current filters will be saved:
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {currentFilters.storeId && <li>Store: {currentFilters.storeId}</li>}
                {currentFilters.searchQuery && <li>Search: {currentFilters.searchQuery}</li>}
                {currentFilters.selectedRefTypes.length > 0 && (
                  <li>Types: {currentFilters.selectedRefTypes.join(", ")}</li>
                )}
                {currentFilters.dateFrom && <li>From: {currentFilters.dateFrom.split("T")[0]}</li>}
                {currentFilters.dateTo && <li>To: {currentFilters.dateTo.split("T")[0]}</li>}
                {currentFilters.variantId && <li>Variant ID: {currentFilters.variantId}</li>}
                {currentFilters.refId && <li>Ref ID: {currentFilters.refId}</li>}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

