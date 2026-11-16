import { describe, it, expect } from 'vitest';
import { validateOffer, parseValidityText, fingerprintKey, reaisToCents, type RawOffer } from '../../supabase/functions/_shared/offers';
import { bestOffersForList, matchOfferToProduct, tokens, type Offer } from '../src/domain/offers';
import type { Product, ListItem } from '../src/domain/types';

const ctx = { flyerValidFrom: '2026-11-14', flyerValidUntil: '2026-11-17', today: '2026-11-15' };
const good: RawOffer = { name: 'Arroz Tio João Tipo 1', brand: 'Tio João', pack_qty: 5, unit: 'kg', price_reais: 24.9, unit_price_reais: 4.98, unit_price_unit: 'kg', confidence: 0.95, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.2 }, raw_text: 'ARROZ TIO JOÃO 5KG R$24,90' };

describe('validateOffer', () => {
  it('aceita oferta completa e coerente', () => {
    const v = validateOffer(good, ctx);
    expect(v.review_status).toBe('auto_ok');
    expect(v.price_cents).toBe(2490);
    expect(v.valid_until).toBe('2026-11-17');           // herdada do encarte
    expect(v.warnings).toContain('validade_herdada_do_encarte');
  });
  it('sem preço => revisão e preço nulo (nunca zero)', () => {
    const v = validateOffer({ ...good, price_reais: null }, ctx);
    expect(v.review_status).toBe('needs_review'); expect(v.price_cents).toBeNull(); expect(v.issues).toContain('sem_preco');
    expect(validateOffer({ ...good, price_reais: 0 }, ctx).price_cents).toBeNull();
  });
  it('preço implausível não é gravado', () => {
    const v = validateOffer({ ...good, price_reais: 2490 }, ctx);
    expect(v.issues).toContain('preco_implausivel'); expect(v.price_cents).toBeNull();
    expect(validateOffer({ ...good, price_reais: 0.05 }, ctx).issues).toContain('preco_implausivel');
  });
  it('preço por kg incoerente com preço e embalagem vai para revisão', () => {
    expect(validateOffer({ ...good, unit_price_reais: 9.98 }, ctx).issues).toContain('preco_unitario_incoerente');
    expect(validateOffer({ ...good, pack_qty: 500, unit: 'g', price_reais: 2.49, unit_price_reais: 4.98 }, ctx).issues).not.toContain('preco_unitario_incoerente');
  });
  it('baixa confiança ou ausente => revisão', () => {
    expect(validateOffer({ ...good, confidence: 0.5 }, ctx).issues).toContain('baixa_confianca');
    expect(validateOffer({ ...good, confidence: null }, ctx).issues).toContain('sem_confianca');
  });
  it('sem validade em lugar nenhum => revisão', () => {
    const v = validateOffer(good, { today: '2026-11-15' });
    expect(v.issues).toContain('sem_validade'); expect(v.review_status).toBe('needs_review');
  });
  it('validade própria prevalece; vencida e incoerente são sinalizadas', () => {
    expect(validateOffer({ ...good, valid_until: '2026-11-16' }, ctx).valid_until).toBe('2026-11-16');
    expect(validateOffer({ ...good, valid_until: '2026-11-10' }, ctx).issues).toContain('ja_vencida');
    expect(validateOffer({ ...good, valid_from: '2026-11-20', valid_until: '2026-11-16' }, ctx).issues).toContain('validade_incoerente');
  });
  it('promoção por volume incompleta é descartada e sinalizada', () => {
    const v = validateOffer({ ...good, promo_min_qty: 3 }, ctx);
    expect(v.issues).toContain('promocao_incompleta'); expect(v.promo_min_qty).toBeNull();
    const ok = validateOffer({ ...good, promo_min_qty: 3, promo_unit_price_reais: 22.9 }, ctx);
    expect(ok.promo_min_qty).toBe(3); expect(ok.promo_unit_price_cents).toBe(2290);
  });
  it('bbox inválido é ignorado com aviso', () => {
    const v = validateOffer({ ...good, bbox: { x: 2, y: 0, w: 1, h: 1 } }, ctx);
    expect(v.bbox).toBeNull(); expect(v.warnings).toContain('sem_posicao');
  });
  it('fidelidade e condições são preservadas', () => {
    const v = validateOffer({ ...good, loyalty_required: true, conditions: 'com Cartão Guanabara' }, ctx);
    expect(v.loyalty_required).toBe(true); expect(v.conditions).toMatch(/Cartão/);
  });
});

describe('utilitários', () => {
  it('lê a validade do texto do encarte', () => {
    expect(parseValidityText('Promoção válida de 14/11/2026 até 17/11/2026, enquanto durarem nossos estoques.')).toEqual({ from: '2026-11-14', until: '2026-11-17' });
    expect(parseValidityText('sem datas')).toBeNull();
    expect(parseValidityText('de 17/11/2026 até 14/11/2026')).toBeNull();
  });
  it('fingerprint é estável e ignora acento/caixa', () => {
    const a = fingerprintKey('c1', { name: 'Feijão Carioca', brand: 'Camil', pack_qty: 1, unit: 'kg', price_cents: 799, valid_until: '2026-11-17' });
    const b = fingerprintKey('c1', { name: 'FEIJAO  carioca', brand: 'camil', pack_qty: 1, unit: 'kg', price_cents: 799, valid_until: '2026-11-17' });
    expect(a).toBe(b);
    expect(fingerprintKey('c1', { name: 'Feijão Carioca', brand: 'Camil', pack_qty: 1, unit: 'kg', price_cents: 849, valid_until: '2026-11-17' })).not.toBe(a);
  });
  it('reaisToCents nunca devolve zero', () => {
    expect(reaisToCents(0)).toBeNull(); expect(reaisToCents(-1)).toBeNull(); expect(reaisToCents(NaN)).toBeNull(); expect(reaisToCents(4.99)).toBe(499);
  });
});

const offer = (o: Partial<Offer>): Offer => ({ id: 'o', chainId: 'c', chainName: 'Guanabara', name: 'Arroz Tio João Tipo 1', brand: 'Tio João', packQty: 5, unit: 'kg', priceCents: 2490, promoMinQty: null, promoUnitPriceCents: null, loyaltyRequired: false, conditions: null, validUntil: '2026-11-17', ...o });
const prod = (p: Partial<Product>): Product => ({ id: 'p1', name: 'Arroz', brand: 'Tio João', packQty: 5, unit: 'kg', ...p });
const item = (i: Partial<ListItem>): ListItem => ({ id: 'i1', productId: 'p1', name: 'Arroz', qty: 1, unit: 'un', status: 'pending', version: 1, ...i });

describe('casamento oferta × lista', () => {
  it('casa produto igual; marca diferente não casa', () => {
    expect(matchOfferToProduct(offer({}), prod({}))?.kind).toBe('exata');
    expect(matchOfferToProduct(offer({ brand: 'Camil' }), prod({}))).toBeNull();
  });
  it('embalagem diferente da mesma dimensão é marcada; dimensões incompatíveis não casam', () => {
    expect(matchOfferToProduct(offer({ packQty: 1, unit: 'kg' }), prod({}))?.kind).toBe('outra_embalagem');
    expect(matchOfferToProduct(offer({ packQty: 1, unit: 'l' }), prod({}))).toBeNull();
  });
  it('sem embalagem na oferta não casa (nada é presumido)', () => {
    expect(matchOfferToProduct(offer({ packQty: null, unit: null }), prod({}))).toBeNull();
  });
  it('escolhe a menor oferta para a quantidade e respeita fidelidade', () => {
    const offers = [offer({ id: 'a', priceCents: 2490 }), offer({ id: 'b', priceCents: 2290, loyaltyRequired: true })];
    const sem = bestOffersForList({ items: [item({})], products: [prod({})], offers, allowLoyalty: false, today: '2026-11-15' });
    expect(sem[0].offer.id).toBe('a');
    const com = bestOffersForList({ items: [item({})], products: [prod({})], offers, allowLoyalty: true, today: '2026-11-15' });
    expect(com[0].offer.id).toBe('b'); expect(com[0].totalCents).toBe(2290);
  });
  it('promoção por volume só vale na quantidade mínima', () => {
    const o = offer({ promoMinQty: 3, promoUnitPriceCents: 2000 });
    expect(bestOffersForList({ items: [item({ qty: 2 })], products: [prod({})], offers: [o], allowLoyalty: true, today: '2026-11-15' })[0].totalCents).toBe(2 * 2490);
    expect(bestOffersForList({ items: [item({ qty: 3 })], products: [prod({})], offers: [o], allowLoyalty: true, today: '2026-11-15' })[0].totalCents).toBe(3 * 2000);
  });
  it('ignora ofertas vencidas e itens sem oferta', () => {
    expect(bestOffersForList({ items: [item({})], products: [prod({})], offers: [offer({ validUntil: '2026-11-10' })], allowLoyalty: true, today: '2026-11-15' })).toEqual([]);
    expect(bestOffersForList({ items: [item({ productId: null, name: 'Sabão em pó' })], products: [], offers: [offer({})], allowLoyalty: true, today: '2026-11-15' })).toEqual([]);
  });
  it('item de texto livre casa por termos', () => {
    const r = bestOffersForList({ items: [item({ productId: null, name: 'arroz tio joão', qty: 5, unit: 'kg' })], products: [], offers: [offer({})], allowLoyalty: true, today: '2026-11-15' });
    expect(r[0].kind).toBe('texto'); expect(r[0].packs).toBe(1);
  });
  it('tokens ignora medidas e palavras vazias', () => { expect(tokens('Arroz Tio João 5kg Tipo 1')).toEqual(['arroz', 'tio', 'joao']); });
});
