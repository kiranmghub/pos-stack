// pos-frontend/src/features/sales/useMoney.ts

export function useMoney() {
  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
  const safeMoney = (v: any) => {
    if (v === null || v === undefined || v === "") return fmt.format(0);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? fmt.format(n) : String(v);
  };
  return { safeMoney };
}

