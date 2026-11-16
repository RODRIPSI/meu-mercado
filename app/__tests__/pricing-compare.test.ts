import { describe, it, expect } from 'vitest';
import { priceStatus, reliability, effectiveUnitCents } from '@/domain/pricing';
import { buildCompareRows, acceptableProductIds } from '@/domain/compare';
import { NOW, daysAgo, price, product, store } from './helpers';

describe('status e confiabilidade', () => {
  it('preço novo é atual; antigo é desatualizado', () => {
    expect(priceStatus(price('a', 'p', 's', 100, { observedAt: daysAgo(2) }), NOW)).toBe('current');
    expect(priceStatus(price('a', 'p', 's', 100, { observedAt: daysAgo(20) }), NOW)).toBe('stale');
  });
  it('oferta vencida é expirada', () => {
    expect(priceStatus(price('a', 'p', 's', 100, { isPromo: true, validUntil: daysAgo(1) }), NOW)).toBe('expired');
  });
  it('promoção sem validade envelhece em 3 dias', () => {
    expect(priceStatus(price('a', 'p', 's', 100, { isPromo: true, observedAt: daysAgo(5) }), NOW)).toBe('stale');
  });
  it('confiabilidade: confirmado alta, manual média, desatualizado/demo baixa', () => {
    expect(reliability(price('a', 'p', 's', 100, { source: 'confirmed' }), NOW)).toBe('alta');
    expect(reliability(price('a', 'p', 's', 100, { source: 'manual' }), NOW)).toBe('media');
    expect(reliability(price('a', 'p', 's', 100, { observedAt: daysAgo(30) }), NOW)).toBe('baixa');
    expect(reliability(price('a', 'p', 's', 100, { source: 'demo' }), NOW)).toBe('baixa');
  });
  it('promoção por volume só vale a partir da quantidade mínima', () => {
    const p = price('a', 'p', 's', 1000, { promoMinQty: 3, promoUnitPriceCents: 800 });
    expect(effectiveUnitCents(p, 2)).toBe(1000);
    expect(effectiveUnitCents(p, 3)).toBe(800);
  });
});

describe('comparador', () => {
  const products = new Map([
    ['arroz5', product('arroz5', { packQty: 5, unit: 'kg' })],
    ['arroz1', product('arroz1', { packQty: 1, unit: 'kg' })],
  ]);
  const stores = new Map([['g', store('g')], ['a', store('a')], ['m', store('m')]]);
  it('ordena por preço por kg, não pelo preço da embalagem', () => {
    const rows = buildCompareRows({
      productIds: ['arroz5', 'arroz1'], products, stores, now: NOW,
      prices: [price('1', 'arroz5', 'g', 2899), price('2', 'arroz1', 'a', 549), price('3', 'arroz5', 'm', 2700)],
    });
    expect(rows.map((r) => r.price.id)).toEqual(['3', '2', '1']);   // R$5,40/kg < R$5,49/kg < R$5,80/kg
  });
  it('não cria linha quando não há preço (nunca R$ 0)', () => {
    const rows = buildCompareRows({ productIds: ['arroz5'], products, stores, prices: [], now: NOW });
    expect(rows).toHaveLength(0);
  });
  it('oferta vencida não é o melhor e fica por último', () => {
    const rows = buildCompareRows({
      productIds: ['arroz5'], products, stores, now: NOW,
      prices: [price('1', 'arroz5', 'g', 1000, { isPromo: true, validUntil: daysAgo(1) }), price('2', 'arroz5', 'a', 2899)],
    });
    expect(rows[0].price.id).toBe('2'); expect(rows[0].isBest).toBe(true);
    expect(rows[1].status).toBe('expired'); expect(rows[1].isBest).toBe(false);
  });
  it('indisponível é omitido', () => {
    const rows = buildCompareRows({ productIds: ['arroz5'], products, stores, now: NOW, prices: [price('1', 'arroz5', 'g', 1000, { available: false })] });
    expect(rows).toHaveLength(0);
  });
  it('marca travada ignora equivalentes', () => {
    const eq = [{ productId: 'arroz5', equivalentId: 'arroz1' }];
    expect(acceptableProductIds('arroz5', eq, true)).toEqual(['arroz5']);
    expect(acceptableProductIds('arroz1', eq, false).sort()).toEqual(['arroz1', 'arroz5']);   // simétrico
  });
});
