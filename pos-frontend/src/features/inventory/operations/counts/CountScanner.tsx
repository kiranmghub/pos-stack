// pos-frontend/src/features/inventory/operations/counts/CountScanner.tsx
import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Minus } from "lucide-react";
import { useScanCountItem } from "../../hooks/useCounts";
import { cn } from "@/lib/utils";

export interface CountScannerProps {
  /** Count session ID */
  sessionId: number;
  /** On scan success callback */
  onScanSuccess?: () => void;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * CountScanner - Barcode/SKU scanner input with auto-submit
 * Security: All operations are tenant-scoped via API
 */
export function CountScanner({
  sessionId,
  onScanSuccess,
  disabled = false,
}: CountScannerProps) {
  const [scanInput, setScanInput] = useState("");
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState("");
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const scanMutation = useScanCountItem();

  // Auto-focus on mount
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleScan = async () => {
    if (!scanInput.trim() || scanning || disabled) return;

    const trimmed = scanInput.trim();
    setScanning(true);

    try {
      // Determine if it's a barcode, SKU, or variant ID
      const payload: any = { qty };
      if (location.trim()) {
        payload.location = location.trim();
      }

      // Try to parse as variant ID first (numeric)
      if (/^\d+$/.test(trimmed)) {
        payload.variant_id = parseInt(trimmed, 10);
      } else if (trimmed.length >= 8) {
        // Likely a barcode (longer strings)
        payload.barcode = trimmed;
      } else {
        // Likely a SKU (shorter alphanumeric)
        payload.sku = trimmed;
      }

      await scanMutation.mutateAsync({ id: sessionId, payload });
      setScanInput("");
      onScanSuccess?.();
    } catch (err: any) {
      console.error("Scan failed:", err);
      // Keep the input so user can retry
    } finally {
      setScanning(false);
      // Refocus input for next scan
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan();
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Scan Barcode/SKU</span>
      </div>

      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Scan or type barcode/SKU..."
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={disabled || scanning}
          className="flex-1"
          autoFocus
        />
        <div className="flex items-center gap-1 border border-border rounded-md">
          <button
            type="button"
            onClick={() => setQty(Math.max(1, qty - 1))}
            disabled={disabled || scanning || qty <= 1}
            className="px-2 py-1.5 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={disabled || scanning}
            className="w-12 text-center text-sm border-0 bg-transparent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setQty(qty + 1)}
            disabled={disabled || scanning}
            className="px-2 py-1.5 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <Button
          onClick={handleScan}
          disabled={disabled || scanning || !scanInput.trim()}
          size="sm"
        >
          {scanning ? "Scanning..." : "Add"}
        </Button>
      </div>

      <Input
        type="text"
        placeholder="Location (optional)"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        disabled={disabled || scanning}
        className="text-sm"
      />
    </div>
  );
}

