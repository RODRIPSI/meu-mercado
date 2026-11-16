import type { BaseUnit, Unit, Product } from './types';

const TO_BASE: Record<Unit, { base: BaseUnit; factor: number }> = {
  un: { base: 'un', factor: 1 },
  kg: { base: 'kg', factor: 1 },
  g: { base: 'kg', factor: 1 / 1000 },
  l: { base: 'l', factor: 1 },
  ml: { base: 'l', factor: 1 / 1000 },
};

export function baseOf(unit: Unit): BaseUnit {
  return TO_BASE[unit].base;
}

export function toBase(qty: number, unit: Unit): { qty: number; base: BaseUnit } {
  const { base, factor } = TO_BASE[unit];
  return { qty: qty * factor, base };
}

/** Preço por kg / litro / unidade (em centavos, sem arredondar). null se a embalagem for inválida. */
export function unitPriceCents(
  priceCents: number,
  packQty: number,
  unit: Unit,
): { cents: number; base: BaseUnit } | null {
  if (!(priceCents > 0) || !(packQty > 0)) return null;
  const { qty, base } = toBase(packQty, unit);
  return { cents: priceCents / qty, base };
}

export function unitPriceLabel(base: BaseUnit): string {
  return base === 'un' ? 'por unidade' : base === 'kg' ? 'por kg' : 'por litro';
}

/**
 * Quantas embalagens do produto são necessárias para a quantidade pedida na lista.
 * - lista em "un": cada unidade é uma embalagem;
 * - lista em unidade de peso/volume: ceil(quantidade / conteúdo da embalagem), se a dimensão for a mesma.
 * Retorna null quando as dimensões são incompatíveis (ex.: lista em kg, produto em litros).
 */
export function packsNeeded(qty: number, unit: Unit, product: Pick<Product, 'packQty' | 'unit'>): number | null {
  if (!(qty > 0)) return null;
  if (unit === 'un') return Math.ceil(qty - 1e-9);
  const want = toBase(qty, unit);
  const pack = toBase(product.packQty, product.unit);
  if (want.base !== pack.base || pack.qty <= 0) return null;
  return Math.max(1, Math.ceil(want.qty / pack.qty - 1e-9));
}
