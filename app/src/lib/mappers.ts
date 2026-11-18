import type { PriceRecord, Product, Store, Unit } from '@/domain/types';

export const mapProduct = (r: any): Product => ({ id: r.id, name: r.name, brand: r.brand, packQty: Number(r.pack_qty), unit: r.unit as Unit, categoryId: r.category_id });
export const mapStore = (r: any, chains: Map<string, string>): Store => ({ id: r.id, name: r.name, chainName: chains.get(r.chain_id), distanceKm: r.distance_km == null ? null : Number(r.distance_km), active: r.active !== false, chainId: r.chain_id ?? null, address: r.address ?? null });
export const mapPrice = (r: any): PriceRecord => ({
  id: r.id, productId: r.product_id, storeId: r.store_id, priceCents: r.price_cents, source: r.source, sourceRef: r.source_ref,
  observedAt: r.observed_at, validUntil: r.valid_until, isPromo: r.is_promo, promoMinQty: r.promo_min_qty,
  promoUnitPriceCents: r.promo_unit_price_cents, conditions: r.conditions, available: r.available,
});
export const productLabel = (p: Product) => `${p.name}${p.brand ? ' · ' + p.brand : ''} ${p.packQty}${p.unit}`;
