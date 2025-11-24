// pos-frontend/src/features/sales/useMoney.ts

export type CurrencyInfo = { code?: string; symbol?: string | null; precision?: number | null };

export function useMoney(currency?: CurrencyInfo) {
  const code = currency?.code || "USD";
  const precision = Number.isFinite(currency?.precision as number) ? Number(currency?.precision) : 2;
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  const safeMoney = (v: any) => {
    if (v === null || v === undefined || v === "") return fmt.format(0);
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    try {
      return fmt.format(n);
    } catch {
      const sym = currency?.symbol || code || "";
      return `${sym}${n.toFixed(precision)}`;
    }
  };
  return { safeMoney };
}
