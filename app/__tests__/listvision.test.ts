import { describe, it, expect } from 'vitest';
import { parseListToolUse, buildListRequest } from '../../supabase/functions/_shared/listvision';

const resp = (itens: unknown[], stop = 'tool_use') => ({ stop_reason: stop, content: [{ type: 'tool_use', name: 'registrar_itens', input: { itens } }] });
describe('parseListToolUse', () => {
  it('normaliza e preserva texto original', () => {
    const r = parseListToolUse(resp([{ name: 'Arroz', qty: 2, unit: 'kg', raw_text: '2kg arroz', bought: true }, { name: null, raw_text: 'ilegível' }]));
    expect(r[0]).toMatchObject({ name: 'Arroz', qty: 2, unit: 'kg', bought: true, recognized: true, sourceText: '2kg arroz' });
    expect(r[1]).toMatchObject({ recognized: false, sourceText: 'ilegível' });
  });
  it('qty/unit inválidos viram 1 un', () => {
    const [a] = parseListToolUse(resp([{ name: 'Leite', qty: -3, unit: 'caixa', raw_text: 'leite' }]));
    expect(a).toMatchObject({ qty: 1, unit: 'un' });
  });
  it('rejeita resposta sem ferramenta ou truncada', () => {
    expect(() => parseListToolUse({ content: [] })).toThrow();
    expect(() => parseListToolUse(resp([], 'max_tokens'))).toThrow();
  });
  it('pedido usa document para PDF e image para foto', () => {
    expect(buildListRequest('x', 'application/pdf', 'm').messages[0].content[0].type).toBe('document');
    expect(buildListRequest('x', 'image/png', 'm').messages[0].content[0].type).toBe('image');
  });
});
