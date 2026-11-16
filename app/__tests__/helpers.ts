import type { PriceRecord, Product, Store } from '@/domain/types';
export const NOW = new Date('2026-11-15T12:00:00Z');
export const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

export const product = (id: string, o: Partial<Product> = {}): Product =>
  ({ id, name: id, brand: null, packQty: 1, unit: 'un', ...o });
export const store = (id: string, distanceKm: number | null = null): Store => ({ id, name: id, distanceKm });
export const price = (id: string, productId: string, storeId: string, priceCents: number, o: Partial<PriceRecord> = {}): PriceRecord => ({
  id, productId, storeId, priceCents, source: 'manual', observedAt: daysAgo(1), isPromo: false, available: true, ...o,
});
