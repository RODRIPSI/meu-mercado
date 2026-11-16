import { describe, it, expect } from 'vitest';
import { historyStats } from '@/domain/history';
import { estimateDaysLeft, needsRestock, expiringSoon } from '@/domain/pantry';
import { paidByMonth, budgetStatus, monthDelta } from '@/domain/finance';
import { evaluateAlerts, inQuietHours } from '@/domain/alerts';
import { daysAgo, NOW } from './helpers';

const obs = (cents: number[], spacing = 5) => cents.map((c, i) => ({ priceCents: c, observedAt: daysAgo((cents.length - i) * spacing), isPromo: false }));

describe('histórico de preços', () => {
  it('histórico curto não gera conclusão estatística', () => {
    const r = historyStats(obs([100, 110, 120]));
    expect(r.sufficient).toBe(false);
  });
  it('muitos registros em poucos dias também é insuficiente', () => {
    expect(historyStats(obs([100, 101, 102, 103, 104, 105], 1)).sufficient).toBe(false);
  });
  it('calcula média, mínimo, máximo e variação', () => {
    const r = historyStats(obs([1000, 1200, 800, 1000, 900, 1100]));
    if (!r.sufficient) throw new Error('deveria ser suficiente');
    expect(r.minCents).toBe(800); expect(r.maxCents).toBe(1200); expect(r.avgCents).toBe(1000);
    expect(r.variationPct).toBe(10);          // 1000 -> 1100
    expect(r.potentialSavingCents).toBe(300);
  });
  it('oportunidade: preço atual no mínimo histórico => boa; no máximo => alta', () => {
    const boa = historyStats(obs([1000, 1200, 1100, 1300, 1250, 900])); const alta = historyStats(obs([900, 1000, 1100, 1050, 1000, 1300]));
    expect(boa.sufficient && boa.opportunity).toBe('boa'); expect(alta.sufficient && alta.opportunity).toBe('alta');
  });
  it('frequência de promoções', () => {
    const o = obs([1000, 900, 1000, 1000, 800, 1000]).map((x, i) => ({ ...x, isPromo: i % 3 === 1 }));
    const r = historyStats(o); expect(r.sufficient && r.promoFrequency).toBeCloseTo(1 / 3, 2);
  });
});

describe('despensa', () => {
  const mv = (days: number, delta: number) => ({ delta, reason: 'consumption' as const, at: daysAgo(days) });
  it('sem histórico de consumo => sem estimativa', () => { expect(estimateDaysLeft(5, [mv(2, -1)])).toBeNull(); });
  it('estima duração (rotulada como estimativa)', () => {
    const e = estimateDaysLeft(4, [mv(20, -1), mv(13, -1), mv(6, -1)])!;   // 2 kg em 14 dias => 1 a cada 7 dias
    expect(e.isEstimate).toBe(true); expect(e.days).toBe(28);
  });
  it('reposição e validade', () => {
    expect(needsRestock(1, 2)).toBe(true); expect(needsRestock(3, 2)).toBe(false); expect(needsRestock(0, null)).toBe(false);
    expect(expiringSoon('2026-11-18', NOW)).toBe(true); expect(expiringSoon('2027-01-01', NOW)).toBe(false); expect(expiringSoon(null, NOW)).toBe(false);
  });
});

describe('finanças', () => {
  it('soma gasto pago por mês', () => {
    expect(paidByMonth([{ purchasedAt: '2026-10-03T10:00:00Z', totalCents: 1000 }, { purchasedAt: '2026-10-20T10:00:00Z', totalCents: 500 }, { purchasedAt: '2026-11-01T10:00:00Z', totalCents: 700 }]))
      .toEqual({ '2026-10': 1500, '2026-11': 700 });
  });
  it('orçamento ausente não vira zero', () => { expect(budgetStatus(500, null)).toEqual({ known: false }); });
  it('orçamento estourado', () => { const b = budgetStatus(12000, 10000); expect(b.known && b.over).toBe(true); });
  it('variação mensal ignora mês anterior inexistente', () => { expect(monthDelta(100, undefined)).toBeNull(); expect(monthDelta(110, 100)).toBe(10); });
});

describe('alertas', () => {
  const change = { productId: 'p', storeId: 's', oldCents: 1000, newCents: 800, isPromo: true, observedAt: NOW.toISOString() };
  const rules = [
    { id: 'r1', type: 'price_drop' as const, enabled: true },
    { id: 'r2', type: 'below_threshold' as const, thresholdCents: 850, enabled: true },
    { id: 'r3', type: 'below_threshold' as const, thresholdCents: 500, enabled: true },
    { id: 'r4', type: 'favorite_promo' as const, enabled: false },
  ];
  it('dispara só regras atendidas e ativas', () => {
    expect(evaluateAlerts(change, rules, new Set(['p']), new Date('2026-11-15T15:00:00')).map((a) => a.ruleId)).toEqual(['r1', 'r2']);
  });
  it('não repete alerta já enviado', () => {
    const first = evaluateAlerts(change, rules, new Set(), new Date('2026-11-15T15:00:00'));
    const sent = new Set(first.map((a) => `${a.ruleId}|${a.dedupKey}`));
    expect(evaluateAlerts(change, rules, new Set(), new Date('2026-11-15T15:00:00'), sent)).toHaveLength(0);
  });
  it('respeita horário silencioso (inclusive virada de meia-noite)', () => {
    expect(inQuietHours(23, 22, 7)).toBe(true); expect(inQuietHours(3, 22, 7)).toBe(true); expect(inQuietHours(12, 22, 7)).toBe(false); expect(inQuietHours(10, null, null)).toBe(false);
  });
});
