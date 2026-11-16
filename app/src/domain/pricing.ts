import type { PriceRecord, PriceSource } from './types';

export const STALE_AFTER_DAYS = 14;        // preço comum sem nova verificação
export const STALE_PROMO_AFTER_DAYS = 3;   // promoção sem validade informada

export type PriceStatus = 'expired' | 'stale' | 'current' | 'unavailable';
export type Reliability = 'alta' | 'media' | 'baixa';

const DAY = 86_400_000;
const ts = (iso: string) => new Date(iso).getTime();

export function priceStatus(p: PriceRecord, now: Date = new Date()): PriceStatus {
  if (!p.available) return 'unavailable';
  if (p.validUntil && ts(p.validUntil) < now.getTime()) return 'expired';   // oferta vencida
  const ageDays = (now.getTime() - ts(p.observedAt)) / DAY;
  const limit = p.isPromo && !p.validUntil ? STALE_PROMO_AFTER_DAYS : STALE_AFTER_DAYS;
  return ageDays > limit ? 'stale' : 'current';
}

export function sourceLabel(s: PriceSource): string {
  return { manual: 'Informado manualmente', confirmed: 'Confirmado', imported: 'Importado', receipt: 'Nota fiscal', demo: 'DEMONSTRAÇÃO' }[s];
}

/** Confiabilidade: confirmado/nota recente = alta; manual/importado recente = média; qualquer desatualizado ou demo = baixa. */
export function reliability(p: PriceRecord, now: Date = new Date()): Reliability {
  const st = priceStatus(p, now);
  if (st !== 'current' || p.source === 'demo') return 'baixa';
  return p.source === 'confirmed' || p.source === 'receipt' ? 'alta' : 'media';
}

/** Preço unitário efetivo da embalagem para N embalagens (promoção por volume). */
export function effectiveUnitCents(p: PriceRecord, packs: number): number {
  if (p.promoMinQty && p.promoUnitPriceCents && packs >= p.promoMinQty) {
    return Math.min(p.promoUnitPriceCents, p.priceCents);
  }
  return p.priceCents;
}

export function totalCents(p: PriceRecord, packs: number): number {
  return effectiveUnitCents(p, packs) * packs;
}
