import { describe, it, expect } from 'vitest';
import { unitPriceCents, packsNeeded, toBase } from '@/domain/units';
import { formatBRL, parseBRLToCents } from '@/domain/money';

describe('preço unitário', () => {
  it('calcula R$/kg de embalagem em gramas', () => {
    expect(unitPriceCents(499, 500, 'g')).toEqual({ cents: 998, base: 'kg' });
  });
  it('calcula R$/litro de embalagem em ml', () => {
    expect(unitPriceCents(1000, 900, 'ml')!.cents).toBeCloseTo(1111.11, 1);
  });
  it('arroz 5kg a R$ 28,99 => R$ 5,798/kg', () => {
    expect(unitPriceCents(2899, 5, 'kg')!.cents).toBeCloseTo(579.8, 5);
  });
  it('rejeita preço zero ou embalagem inválida', () => {
    expect(unitPriceCents(0, 1, 'kg')).toBeNull();
    expect(unitPriceCents(100, 0, 'kg')).toBeNull();
  });
  it('converte unidades', () => { expect(toBase(250, 'g')).toEqual({ qty: 0.25, base: 'kg' }); });
});

describe('embalagens necessárias', () => {
  const arroz5 = { packQty: 5, unit: 'kg' as const };
  it('lista em "un" = nº de embalagens', () => expect(packsNeeded(2, 'un', arroz5)).toBe(2));
  it('lista em kg arredonda para cima', () => expect(packsNeeded(7, 'kg', arroz5)).toBe(2));
  it('lista em g converte', () => expect(packsNeeded(5000, 'g', arroz5)).toBe(1));
  it('dimensão incompatível => null', () => expect(packsNeeded(1, 'l', arroz5)).toBeNull());
  it('quantidade inválida => null', () => expect(packsNeeded(0, 'un', arroz5)).toBeNull());
});

describe('dinheiro', () => {
  it('ausência nunca vira zero', () => { expect(formatBRL(null)).toBe('—'); expect(formatBRL(undefined)).toBe('—'); });
  it('formata em reais', () => expect(formatBRL(1290).replace(/\s/g, ' ')).toBe('R$ 12,90'));
  it('interpreta entradas brasileiras', () => {
    expect(parseBRLToCents('12,90')).toBe(1290);
    expect(parseBRLToCents('R$ 1.234,56')).toBe(123456);
    expect(parseBRLToCents('12.90')).toBe(1290);
    expect(parseBRLToCents('1.234')).toBe(123400);
  });
  it('rejeita zero e vazio', () => { expect(parseBRLToCents('0')).toBeNull(); expect(parseBRLToCents('')).toBeNull(); expect(parseBRLToCents('0,00')).toBeNull(); });
});
