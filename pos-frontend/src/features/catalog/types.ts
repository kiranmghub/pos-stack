// pos-frontend/src/features/catalog/types.ts
export type ID = string | number;

export interface Variant {
  id: ID;
  product: ID;
  name: string;
  sku: string;
  barcode?: string | null;
  price: string | number;
  cost?: string | number | null;
  on_hand: number;
  active: boolean;
  image_file?: string | null;
}

export interface CurrencyInfo {
  code: string;
  symbol?: string | null;
  precision?: number | null;
}

export interface ProductListItem {
  id: ID;
  name: string;
  code: string;
  category: string;
  active: boolean;
  price_min: string; // decimal string
  price_max: string;
  on_hand_sum: number;
  variant_count: number;
  cover_image?: string | null;
  currency?: CurrencyInfo;
}

export interface ProductDetail extends Omit<ProductListItem, "cover_image"> {
  description?: string;
  image_file?: string | null;
  variants: Variant[];
  currency?: CurrencyInfo;
}

export interface Paginated<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export type CreateProductDto = {
  name: string;
  code?: string;
  description?: string;
  category: string;
  active?: boolean;
  image_file?: File | null;
};

export type UpdateProductDto = Partial<CreateProductDto>;

export type CreateVariantDto = {
  product: ID;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost?: number;
  on_hand?: number;
  active?: boolean;
  image_file?: File | null;
};

export type UpdateVariantDto = Partial<CreateVariantDto> & { id: ID };
