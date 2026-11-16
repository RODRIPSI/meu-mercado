import { describe, it, expect } from 'vitest';
import { parseImport, resolveImport } from '@/domain/importer';
import { product, store } from './helpers';

const H = 'produto;marca;embalagem;unidade;mercado;preco;promo;validade;condicoes';
describe('importação CSV', () => {
  it('lê linhas válidas', () => {
    const r = parseImport(`${H}\nArroz;Tio João;5;kg;Guanabara – Freguesia;28,99;sim;30/11/2026;com cartão\n`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ name: 'Arroz', brand: 'Tio João', packQty: 5, unit: 'kg', priceCents: 2899, isPromo: true, conditions: 'com cartão' });
    expect(r.rows[0].validUntil).toBe('2026-11-30T23:59:59-03:00');
  });
  it('preço ausente ou zero vira erro, nunca R$ 0', () => {
    const r = parseImport(`${H}\nArroz;;5;kg;G;;não;;\nFeijão;;1;kg;G;0;não;;`);
    expect(r.rows).toHaveLength(0); expect(r.errors).toHaveLength(2);
  });
  it('aceita vírgula como separador e cabeçalho com acento', () => {
    const r = parseImport('produto,marca,embalagem,unidade,mercado,preço\nLeite,Piracanjuba,1,l,A,"5,49"');
    expect(r.rows[0].priceCents).toBe(549);
  });
  it('colunas obrigatórias ausentes e unidade/validade inválidas', () => {
    expect(parseImport('produto;preco\nA;1').errors[0].message).toMatch(/obrigatórias/);
    expect(parseImport(`${H}\nA;;1;caixa;G;1,00;;;`).errors[0].message).toMatch(/unidade/);
    expect(parseImport(`${H}\nA;;1;kg;G;1,00;;31-31-2026;`).errors[0].message).toMatch(/validade/);
  });
  it('associa a produto e filial existentes (sem acento/caixa) e sinaliza filial desconhecida', () => {
    const rows = parseImport(`${H}\nARROZ;tio joao;5;kg;guanabara - x;28,99;;;\nArroz;Tio João;5;kg;Outra;28,99;;;`).rows;
    const res = resolveImport(rows, [product('p1', { name: 'Arroz', brand: 'Tio João', packQty: 5, unit: 'kg' })], [{ ...store('s1'), name: 'Guanabara - X' }]);
    expect(res[0]).toMatchObject({ productId: 'p1', storeId: 's1' });
    expect(res[1].storeId).toBeNull(); expect(res[1].problem).toMatch(/não cadastrada/);
  });
});
