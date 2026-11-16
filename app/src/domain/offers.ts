import type { Product, Unit, ListItem } from './types';
import { toBase, packsNeeded } from './units';

/** Oferta vigente e confiável (linha de active_offers). */
export interface Offer {
  id: string;
  chainId: string;
  chainName: string;
  name: string;
  brand: string | null;
  packQty: number | null;
  unit: Unit | null;
  priceCents: number;
  promoMinQty: number | null;
  promoUnitPriceCents: number | null;
  loyaltyRequired: boolean;
  conditions: string | null;
  validUntil: string;       // AAAA-MM-DD
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'tipo', 'para', 'e', 'a', 'o', 'pct', 'pacote', 'cx', 'caixa', 'un', 'und']);
export function tokens(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((t) => t && !STOP.has(t) && !/^\d+(kg|g|l|ml|un)?$/.test(t));
}

export type MatchKind = 'exata' | 'outra_embalagem' | 'texto';
export interface Match { kind: MatchKind; offer: Offer }

const sameBrand = (a: string | null, b: string | null) => !!a && !!b && tokens(a).join(' ') === tokens(b).join(' ');

/**
 * Casa uma oferta com um produto do catálogo. Conservador: na dúvida, não casa.
 * - todos os termos do nome do produto precisam aparecer no nome da oferta;
 * - se o produto tem marca e a oferta também, as marcas precisam ser iguais; marca divergente não casa;
 * - mesma embalagem => 'exata'; mesma dimensão (peso/volume) com tamanho diferente => 'outra_embalagem'.
 */
export function matchOfferToProduct(offer: Offer, product: Product): Match | null {
  const pt = tokens(product.name);
  if (pt.length === 0) return null;
  const ot = new Set([...tokens(offer.name), ...(offer.brand ? tokens(offer.brand) : [])]);
  if (!pt.every((t) => ot.has(t))) return null;
  if (product.brand && offer.brand && !sameBrand(product.brand, offer.brand)) return null;
  if (product.brand && !offer.brand && !tokens(product.brand).every((t) => ot.has(t))) return null;
  if (!offer.packQty || !offer.unit) return null;                  // sem embalagem conhecida não dá para comparar
  const a = toBase(product.packQty, product.unit), b = toBase(offer.packQty, offer.unit);
  if (a.base !== b.base) return null;
  return { kind: Math.abs(a.qty - b.qty) < 1e-9 ? 'exata' : 'outra_embalagem', offer };
}

/** Casa por texto livre quando o item da lista não tem produto do catálogo. */
export function matchOfferToText(offer: Offer, text: string): Match | null {
  const t = tokens(text);
  if (t.length === 0) return null;
  const ot = new Set([...tokens(offer.name), ...(offer.brand ? tokens(offer.brand) : [])]);
  return t.every((x) => ot.has(x)) && offer.packQty && offer.unit ? { kind: 'texto', offer } : null;
}

export interface ItemOffer {
  itemId: string;
  offer: Offer;
  kind: MatchKind;
  packs: number;
  totalCents: number;
  /** preço por kg/L/un da oferta, para comparar embalagens diferentes */
  unitCents: number | null;
}

function offerTotal(o: Offer, packs: number): number {
  const each = o.promoMinQty && o.promoUnitPriceCents && packs >= o.promoMinQty ? Math.min(o.promoUnitPriceCents, o.priceCents) : o.priceCents;
  return each * packs;
}

/**
 * Para cada item pendente da lista, a melhor oferta vigente (menor custo total para a quantidade pedida).
 * Ofertas que exigem cartão de fidelidade só entram se `allowLoyalty` for true.
 * Itens sem oferta ficam de fora — nada é estimado.
 */
export function bestOffersForList(args: {
  items: ListItem[]; products: Product[]; offers: Offer[]; allowLoyalty: boolean; today: string;
}): ItemOffer[] {
  const out: ItemOffer[] = [];
  const byId = new Map(args.products.map((p) => [p.id, p]));
  for (const it of args.items) {
    if (it.status !== 'pending') continue;
    const prod = it.productId ? byId.get(it.productId) : undefined;
    let best: ItemOffer | null = null;
    for (const o of args.offers) {
      if (o.validUntil < args.today) continue;
      if (o.loyaltyRequired && !args.allowLoyalty) continue;
      const m = prod ? matchOfferToProduct(o, prod) : matchOfferToText(o, it.name);
      if (!m || !o.packQty || !o.unit) continue;
      const packs = packsNeeded(it.qty, it.unit, { packQty: o.packQty, unit: o.unit });
      if (packs == null) continue;
      const base = toBase(o.packQty, o.unit);
      const cand: ItemOffer = { itemId: it.id, offer: o, kind: m.kind, packs, totalCents: offerTotal(o, packs), unitCents: base.qty > 0 ? o.priceCents / base.qty : null };
      // menor custo total para a quantidade pedida; empate => embalagem exata
      if (!best || cand.totalCents < best.totalCents || (cand.totalCents === best.totalCents && cand.kind === 'exata' && best.kind !== 'exata')) best = cand;
    }
    if (best) out.push(best);
  }
  return out;
}
