import { describe, it, expect } from 'vitest';
import { parseListText, parseLine, categorize, findDuplicates, docxXmlToText, bytesToBase64, listStatus, progress, estimateListCost, potentialSavings, matchExisting } from '@/domain/listparse';

describe('parseListText', () => {
  it('quantidade e unidade no início', () => {
    const [a, b, c] = parseListText('2 kg arroz\n3 pacotes de macarrão\n1 l leite');
    expect(a).toMatchObject({ name: 'arroz', qty: 2, unit: 'kg', recognized: true });
    expect(b).toMatchObject({ name: 'macarrão', qty: 3, unit: 'un' });
    expect(c).toMatchObject({ name: 'leite', qty: 1, unit: 'l' });
  });
  it('quantidade no fim, marcadores e numeração', () => {
    const r = parseListText('- arroz 5kg\n• feijão 2 kg\n1. leite x3\n[ ] café');
    expect(r.map((i) => [i.name, i.qty, i.unit])).toEqual([['arroz', 5, 'kg'], ['feijão', 2, 'kg'], ['leite', 3, 'un'], ['café', 1, 'un']]);
  });
  it('decimais com vírgula e dúzia', () => {
    const [a, b] = parseListText('1,5 kg tomate\n2 dúzias ovos');
    expect(a.qty).toBe(1.5);
    expect(b).toMatchObject({ qty: 24, unit: 'un' });
    expect(b.notes).toContain('dúzia');
  });
  it('observações e marca', () => {
    const [a, b] = parseListText('2 un detergente (neutro)\n1 kg café marca Pilão');
    expect(a.notes).toBe('neutro');
    expect(b).toMatchObject({ name: 'café', brand: 'Pilão' });
  });
  it('faixa é ambígua e preserva a informação', () => {
    const [a] = parseListText('2 a 3 kg batata');
    expect(a.ambiguousQty).toBe(true);
    expect(a.notes).toContain('2 a 3');
  });
  it('tabela com tab e pipe', () => {
    const r = parseListText('Arroz\t2 kg\nFeijão | 1 kg');
    expect(r.map((i) => i.recognized)).toEqual([true, true]);
  });
  it('cabeçalhos viram dica de categoria', () => {
    const r = parseListText('HORTIFRUTI:\nbanana\nLimpeza:\nesponja');
    expect(r[0].categoryHint).toBe('HORTIFRUTI');
    expect(r[1].categoryHint).toBe('Limpeza');
  });
  it('linha ilegível mantém o texto original e não é reconhecida', () => {
    const it = parseLine('???');
    expect(it).toMatchObject({ recognized: false, sourceText: '???' });
  });
  it('linhas vazias são ignoradas', () => {
    expect(parseListText('\n\n  \n')).toEqual([]);
  });
});

describe('categorize', () => {
  it('mapeia nomes comuns', () => {
    expect(categorize('Banana prata')).toBe('Hortifruti');
    expect(categorize('Peito de frango')).toBe('Açougue e peixes');
    expect(categorize('Leite integral')).toBe('Laticínios e frios');
    expect(categorize('Detergente neutro')).toBe('Limpeza');
    expect(categorize('Shampoo')).toBe('Higiene e beleza');
    expect(categorize('Arroz')).toBe('Grãos e cereais');
    expect(categorize('Macarrão espaguete')).toBe('Mercearia');
  });
  it('sem pista → Outros; usa cabeçalho como apoio', () => {
    expect(categorize('coisa estranha')).toBe('Outros');
    expect(categorize('coisa estranha', 'Limpeza')).toBe('Limpeza');
  });
});

describe('duplicados', () => {
  it('só oferece somar quando nome, unidade e marca coincidem', () => {
    const items = parseListText('2 kg arroz\n1 kg arroz\n1 l leite\n1 un leite');
    const g = findDuplicates(items);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.key === 'arroz')!.canSum).toBe(true);
    expect(g.find((x) => x.key === 'leite')!.canSum).toBe(false);
  });
  it('detecta itens já existentes na lista de destino', () => {
    const m = matchExisting([{ name: 'Arroz' }, { name: 'Feijão' }], [{ id: 'x', name: 'arroz' }]);
    expect([...m.entries()]).toEqual([[0, 'x']]);
  });
});

describe('docx e base64', () => {
  it('extrai parágrafos e células', () => {
    const xml = '<w:p><w:r><w:t>Arroz</w:t></w:r></w:p><w:tr><w:tc><w:p><w:r><w:t>Feijão</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2 kg</w:t></w:r></w:p></w:tc></w:tr>';
    expect(docxXmlToText(xml).split('\n')).toEqual(['Arroz', 'Feijão\t2 kg']);
  });
  it('base64 igual ao Buffer', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'olá mundo']) expect(bytesToBase64(new TextEncoder().encode(s))).toBe(Buffer.from(s).toString('base64'));
  });
});

describe('status, custo e economia', () => {
  it('status', () => {
    expect(listStatus([])).toBe('planejada');
    expect(listStatus([{ status: 'pending' }])).toBe('planejada');
    expect(listStatus([{ status: 'bought' }, { status: 'pending' }])).toBe('em_andamento');
    expect(listStatus([{ status: 'bought' }, { status: 'skipped' }])).toBe('concluida');
    expect(progress([{ status: 'bought' }, { status: 'pending' }])).toEqual({ total: 2, bought: 1, pct: 50 });
  });
  it('custo ignora preços ausentes sem tratá-los como zero', () => {
    expect(estimateListCost([{ cents: 500 }, { cents: null }])).toEqual({ totalCents: 500, known: 1, unknown: 1 });
    expect(estimateListCost([{ cents: null }]).totalCents).toBeNull();
  });
  it('economia potencial exige ≥2 preços conhecidos', () => {
    expect(potentialSavings([{ qtyPacks: 2, storeCents: [1000, 800, null] }, { qtyPacks: 1, storeCents: [500, null] }])).toEqual({ cents: 400, items: 1 });
  });
});
