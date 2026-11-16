import type { BaseUnit, PriceRecord, Product, Store } from './types';
import { unitPriceCents } from './units';
import { priceStatus, reliability, type PriceStatus, type Reliability } from './pricing';

export interface CompareRow {
  price: PriceRecord;
  product: Product;
  store: Store;
  unitPrice: { cents: number; base: BaseUnit } | null;
  status: PriceStatus;
  reliability: Reliability;
  isBest: boolean;
}

export interface Equivalence { productId: string; equivalentId: string }

/** Conjunto de produtos aceitáveis no lugar de `productId`. Marca travada => só o próprio produto. Relação é simétrica. */
export function acceptableProductIds(
  productId: string,
  equivalences: Equivalence[],
  brandLocked: boolean,
): string[] {
  if (brandLocked) return [productId];
  const out = new Set([productId]);
  for (const e of equivalences) {
    if (e.productId === productId) out.add(e.equivalentId);
    if (e.equivalentId === productId) out.add(e.productId);
  }
  return [...out];
}

/**
 * Linhas do comparador para um conjunto de produtos aceitáveis.
 * Só ranqueia preços de mesma dimensão (kg com kg, litro com litro). Ofertas vencidas e indisponíveis ficam de fora do "melhor".
 * Nunca cria linha para preço ausente.
 */
export function buildCompareRows(args: {
  productIds: string[];
  products: Map<string, Product>;
  stores: Map<string, Store>;
  prices: PriceRecord[];
  now?: Date;
}): CompareRow[] {
  const now = args.now ?? new Date();
  const ids = new Set(args.productIds);
  const rows: CompareRow[] = [];
  for (const price of args.prices) {
    if (!ids.has(price.productId)) continue;
    const product = args.products.get(price.productId);
    const store = args.stores.get(price.storeId);
    if (!product || !store) continue;
    const status = priceStatus(price, now);
    if (status === 'unavailable') continue;
    rows.push({
      price, product, store, status,
      unitPrice: unitPriceCents(price.priceCents, product.packQty, product.unit),
      reliability: reliability(price, now),
      isBest: false,
    });
  }
  const rank = (r: CompareRow) => (r.status === 'expired' ? 2 : r.unitPrice ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || (a.unitPrice?.cents ?? Infinity) - (b.unitPrice?.cents ?? Infinity));
  const first = rows.find((r) => r.status !== 'expired' && r.unitPrice);
  if (first) {
    for (const r of rows) {
      if (r.status !== 'expired' && r.unitPrice && r.unitPrice.base === first.unitPrice!.base
          && r.unitPrice.cents === first.unitPrice!.cents) r.isBest = true;
    }
  }
  return rows;
}
