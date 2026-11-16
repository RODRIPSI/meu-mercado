export type Unit = 'un' | 'kg' | 'g' | 'l' | 'ml';
export type BaseUnit = 'un' | 'kg' | 'l';
export type PriceSource = 'manual' | 'confirmed' | 'imported' | 'receipt' | 'demo';

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  packQty: number;
  unit: Unit;
  categoryId?: string | null;
}

export interface PriceRecord {
  id: string;
  productId: string;
  storeId: string;
  priceCents: number;            // sempre > 0; preço desconhecido = ausência de registro
  source: PriceSource;
  sourceRef?: string | null;
  observedAt: string;            // ISO
  validUntil?: string | null;    // ISO
  isPromo: boolean;
  promoMinQty?: number | null;
  promoUnitPriceCents?: number | null;
  conditions?: string | null;
  available: boolean;
}

export interface Store {
  id: string;
  name: string;
  chainName?: string;
  distanceKm: number | null;     // null = desconhecida
}

export interface ListItem {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unit: Unit;
  status: 'pending' | 'bought' | 'skipped';
  version: number;
}
