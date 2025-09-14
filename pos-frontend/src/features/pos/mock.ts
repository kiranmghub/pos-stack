// src/features/pos/mock.ts
export type Product = {
  id: number;
  name: string;
  price: number;
  sku: string;
  barcode?: string;
  category: string;
  image?: string;
  tax_rate: number; // e.g., 0.0825
};

export type Category = { id: string; name: string };

const categories: Category[] = [
  { id: "ALL", name: "All" },
  { id: "DRINKS", name: "Drinks" },
  { id: "BAKERY", name: "Bakery" },
  { id: "SNACKS", name: "Snacks" },
  { id: "GROCERY", name: "Grocery" },
];

const products: Product[] = [
  { id: 1, name: "Latte", price: 3.5, sku: "LAT-12", category: "DRINKS", tax_rate: 0.0825 },
  { id: 2, name: "Espresso", price: 2.5, sku: "ESP-11", category: "DRINKS", tax_rate: 0.0825 },
  { id: 3, name: "Croissant", price: 2.1, sku: "CRO-21", category: "BAKERY", tax_rate: 0.0825 },
  { id: 4, name: "Muffin Blueberry", price: 2.25, sku: "MUF-31", category: "BAKERY", tax_rate: 0.0825 },
  { id: 5, name: "Chips Sea Salt", price: 1.75, sku: "CHP-41", category: "SNACKS", tax_rate: 0.0825 },
  { id: 6, name: "Sandwich Turkey", price: 5.5, sku: "SAN-51", category: "SNACKS", tax_rate: 0.0825 },
  { id: 7, name: "Milk 1L", price: 2.8, sku: "MLK-61", category: "GROCERY", tax_rate: 0.0825, barcode: "040000000061" },
  { id: 8, name: "Eggs Dozen", price: 3.3, sku: "EGG-71", category: "GROCERY", tax_rate: 0.0825, barcode: "040000000071" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockFetchCategories(): Promise<Category[]> {
  await wait(150);
  return categories;
}

export async function mockSearchProducts(opts: { query?: string; category?: string }): Promise<Product[]> {
  await wait(150);
  let list = products;
  if (opts.category && opts.category !== "ALL") {
    list = list.filter((p) => p.category === opts.category);
  }
  if (opts.query && opts.query.trim()) {
    const q = opts.query.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q))
    );
  }
  return list.slice(0, 60);
}

export async function mockLookupByBarcode(barcode: string): Promise<Product | null> {
  await wait(80);
  return products.find((p) => p.barcode === barcode) || null;
}

export type CartLine = { product: Product; qty: number; line_discount?: number };

export function computeTotals(lines: CartLine[]) {
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty - (l.line_discount || 0), 0);
  const tax = lines.reduce((s, l) => s + (l.product.price * l.qty - (l.line_discount || 0)) * l.product.tax_rate, 0);
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

export async function mockCheckout(payload: {
  lines: CartLine[];
  payment: { type: "CASH" | "CARD" | "SPLIT"; amount: number };
}) {
  // pretend to post to server
  await wait(400);
  const { total } = computeTotals(payload.lines);
  if (payload.payment.amount + 0.0001 < total) {
    throw new Error("Insufficient payment amount");
  }
  // return a fake sale number
  return { sale_number: Math.floor(100000 + Math.random() * 900000) };
}
