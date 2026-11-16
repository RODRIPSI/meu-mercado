import { describe, it, expect } from 'vitest';
import { optimize, type DemandItem } from '@/domain/optimizer';
import { NOW, daysAgo, price, product, store } from './helpers';

const products = new Map([
  ['arroz', product('arroz', { packQty: 5, unit: 'kg' })],
  ['feijao', product('feijao', { packQty: 1, unit: 'kg' })],
  ['leite', product('leite', { packQty: 1, unit: 'l' })],
]);
const items: DemandItem[] = [
  { id: 'i1', name: 'Arroz', qty: 1, unit: 'un', acceptable: ['arroz'] },
  { id: 'i2', name: 'Feijão', qty: 2, unit: 'un', acceptable: ['feijao'] },
  { id: 'i3', name: 'Leite', qty: 6, unit: 'un', acceptable: ['leite'] },
];
// Mercado G: tudo, total 2800+2*900+6*500 = 7600. Mercado A: arroz barato, sem leite. Mercado M: feijão e leite baratos.
const prices = [
  price('g1', 'arroz', 'G', 2800), price('g2', 'feijao', 'G', 900), price('g3', 'leite', 'G', 500),
  price('a1', 'arroz', 'A', 2000), price('a2', 'feijao', 'A', 1000),
  price('m1', 'feijao', 'M', 700), price('m2', 'leite', 'M', 400), price('m3', 'arroz', 'M', 3000),
];
const stores = [store('G', 2), store('A', 3), store('M', 4)];
const base = { items, products, stores, prices, now: NOW };

describe('Modo A – um mercado', () => {
  it('escolhe o mercado com lista completa mais barata (M: 3000+1400+2400=6800)', () => {
    const r = optimize({ ...base, mode: 'A' });
    expect(r.best!.storeIds).toEqual(['M']);
    expect(r.best!.totalCents).toBe(6800);
    expect(r.best!.partial).toBe(false);
  });
  it('mercado sem todos os itens fica atrás e é marcado como parcial', () => {
    const r = optimize({ ...base, mode: 'A' });
    const a = r.ranking.find((p) => p.storeIds[0] === 'A')!;
    expect(a.partial).toBe(true);
    expect(a.missing.map((m) => m.itemId)).toEqual(['i3']);
    expect(r.ranking.indexOf(a)).toBeGreaterThan(r.ranking.findIndex((p) => p.storeIds[0] === 'G'));
  });
});

describe('Modo C – máxima economia', () => {
  it('combina arroz do A + feijão/leite do M (2000+1400+2400=5800)', () => {
    const r = optimize({ ...base, mode: 'C' });
    expect(r.best!.totalCents).toBe(5800);
    expect([...r.best!.storeIds].sort()).toEqual(['A', 'M']);
    expect(r.basis.savingsVsBestSingleCents).toBe(1000);   // vs M sozinho (6800)
  });
  it('respeita o máximo de paradas', () => {
    const r = optimize({ ...base, mode: 'C', maxStops: 1 });
    expect(r.best!.storeIds).toHaveLength(1);
  });
});

describe('Modo B – equilibrado (até 2 mercados, considera deslocamento)', () => {
  it('sem custo de km, a parada extra (R$3) ainda compensa quando a economia é maior', () => {
    const r = optimize({ ...base, mode: 'B' });
    expect(r.best!.storeIds).toHaveLength(2);
    expect(r.best!.totalCents).toBe(5800 + 300);
  });
  it('deslocamento caro faz um único mercado vencer', () => {
    // 2*km*R$/km: ida e volta de A(3km)+M(4km) a R$5/km = 3000+4000 centavos
    const r = optimize({ ...base, mode: 'B', costPerKmCents: 500 });
    expect(r.best!.storeIds).toHaveLength(1);
  });
  it('nunca passa de 2 paradas', () => {
    expect(optimize({ ...base, mode: 'B' }).best!.storeIds.length).toBeLessThanOrEqual(2);
  });
});

describe('dados insuficientes e honestidade', () => {
  it('item sem preço em nenhum mercado => comparação parcial, nunca zero', () => {
    const r = optimize({ ...base, mode: 'C', items: [...items, { id: 'i4', name: 'Café', qty: 1, unit: 'un', acceptable: [] }] });
    expect(r.best!.partial).toBe(true);
    expect(r.best!.missing.map((m) => m.itemId)).toContain('i4');
    expect(r.basis.savingsVsBestSingleCents).toBeNull();
    expect(r.basis.priceAssumptions.join(' ')).toMatch(/parcial/i);
  });
  it('sem nenhum preço => sem plano', () => {
    expect(optimize({ ...base, mode: 'A', prices: [] }).best).toBeNull();
  });
  it('ignora oferta vencida e indisponível', () => {
    const r = optimize({
      ...base, mode: 'C',
      prices: [price('x', 'arroz', 'A', 100, { isPromo: true, validUntil: daysAgo(1) }), price('y', 'arroz', 'G', 2800), price('z', 'arroz', 'M', 50, { available: false })],
      items: [items[0]],
    });
    expect(r.best!.totalCents).toBe(2800);
  });
  it('sinaliza preço desatualizado e dados de demonstração', () => {
    const r = optimize({ ...base, mode: 'A', items: [items[0]], prices: [price('x', 'arroz', 'G', 2800, { observedAt: daysAgo(40), source: 'demo' })] });
    expect(r.best!.staleUsed).toBe(1);
    expect(r.best!.demoUsed).toBe(true);
    expect(r.basis.priceAssumptions.join(' ')).toMatch(/DEMONSTRAÇÃO/);
  });
  it('maxPriceAgeDays descarta preço velho', () => {
    const r = optimize({ ...base, mode: 'A', maxPriceAgeDays: 7, items: [items[0]], prices: [price('x', 'arroz', 'G', 2800, { observedAt: daysAgo(40) })] });
    expect(r.best).toBeNull();
  });
});

describe('embalagens, equivalentes e promoção por volume', () => {
  it('lista pede 10 kg e embalagem é 5 kg => 2 embalagens', () => {
    const r = optimize({ ...base, mode: 'A', items: [{ id: 'i1', name: 'Arroz', qty: 10, unit: 'kg', acceptable: ['arroz'] }], prices: [price('g1', 'arroz', 'G', 2800)], stores: [store('G')] });
    expect(r.best!.totalCents).toBe(5600);
    expect(r.best!.picks[0].packs).toBe(2);
  });
  it('promoção por volume só se aplica na quantidade mínima', () => {
    const p = price('l', 'leite', 'G', 500, { isPromo: true, promoMinQty: 6, promoUnitPriceCents: 400 });
    const six = optimize({ ...base, mode: 'A', items: [items[2]], prices: [p], stores: [store('G')] });
    expect(six.best!.totalCents).toBe(2400);
    const three = optimize({ ...base, mode: 'A', items: [{ ...items[2], qty: 3 }], prices: [p], stores: [store('G')] });
    expect(three.best!.totalCents).toBe(1500);
  });
  it('usa marca equivalente mais barata quando permitida', () => {
    const prods = new Map(products); prods.set('arroz2', product('arroz2', { packQty: 5, unit: 'kg' }));
    const r = optimize({
      ...base, mode: 'A', products: prods, stores: [store('G')],
      items: [{ id: 'i1', name: 'Arroz', qty: 1, unit: 'un', acceptable: ['arroz', 'arroz2'] }],
      prices: [price('p1', 'arroz', 'G', 2800), price('p2', 'arroz2', 'G', 2500)],
    });
    expect(r.best!.picks[0].productId).toBe('arroz2');
  });
  it('não assume que promoção de uma filial vale em outra', () => {
    const r = optimize({
      ...base, mode: 'A', items: [items[0]], stores: [store('G1'), store('G2')],
      prices: [price('p1', 'arroz', 'G1', 1000, { isPromo: true }), price('p2', 'arroz', 'G2', 2800)],
    });
    expect(r.ranking.find((p) => p.storeIds[0] === 'G2')!.totalCents).toBe(2800);
  });
  it('distância desconhecida é sinalizada', () => {
    const r = optimize({ ...base, mode: 'A', stores: [store('G', null)], items: [items[0]], prices: [price('g1', 'arroz', 'G', 2800)], costPerKmCents: 100 });
    expect(r.best!.travelCents).toBeNull();
    expect(r.basis.priceAssumptions.join(' ')).toMatch(/Distância desconhecida/);
  });
});
