import { describe, it, expect } from 'vitest';
import { isAllowedByRobots } from '../../supabase/functions/_shared/robots';
import { guanabara, pdfLinkConnector, htmlToText } from '../../supabase/functions/_shared/connectors';
import { parseToolUse, buildRequest, TOOL_NAME, PROMPT_VERSION } from '../../supabase/functions/_shared/vision';

const UA = 'MeuMercadoInteligente/1.0';
describe('robots.txt', () => {
  it('sem regras = liberado; Disallow vazio = liberado', () => {
    expect(isAllowedByRobots('', '/encarte', UA)).toBe(true);
    expect(isAllowedByRobots('User-agent: *\nDisallow:', '/encarte', UA)).toBe(true);
  });
  it('Disallow bloqueia o prefixo; Allow mais específico vence', () => {
    const t = 'User-agent: *\nDisallow: /encarte\nAllow: /encarte/baixe';
    expect(isAllowedByRobots(t, '/encarte', UA)).toBe(false);
    expect(isAllowedByRobots(t, '/encarte/baixe', UA)).toBe(true);
    expect(isAllowedByRobots(t, '/produtos/1', UA)).toBe(true);
  });
  it('grupo específico do nosso agente prevalece sobre *', () => {
    const t = 'User-agent: *\nDisallow: /\n\nUser-agent: meumercadointeligente\nDisallow: /privado';
    expect(isAllowedByRobots(t, '/encarte', UA)).toBe(true);
    expect(isAllowedByRobots(t, '/privado/x', UA)).toBe(false);
  });
  it('curingas e fim de linha', () => {
    const t = 'User-agent: *\nDisallow: /*.pdf$';
    expect(isAllowedByRobots(t, '/a/b.pdf', UA)).toBe(false);
    expect(isAllowedByRobots(t, '/a/b.pdf?x=1', UA)).toBe(true);
  });
  it('Disallow: / bloqueia tudo', () => { expect(isAllowedByRobots('User-agent: *\nDisallow: /', '/encarte', UA)).toBe(false); });
});

describe('conector Guanabara', () => {
  const html = `<html><body><h1>Encarte</h1><p>Promoção válida de 14/11/2026 até 17/11/2026, enquanto durarem nossos estoques.</p>
    <a href="/encarte/baixe">Baixar encarte</a><a href="/print/9">Imprimir</a><script>var x="até 01/01/2020 a 02/01/2020"</script></body></html>`;
  it('acha o PDF e a validade da página', () => {
    const f = guanabara.discover(html, 'https://www.supermercadosguanabara.com.br/encarte')!;
    expect(f.fileUrl).toBe('https://www.supermercadosguanabara.com.br/encarte/baixe');
    expect(f.validity).toEqual({ from: '2026-11-14', until: '2026-11-17' });
  });
  it('sem link no HTML usa o caminho conhecido', () => {
    expect(guanabara.discover('<p>nada</p>', 'https://www.supermercadosguanabara.com.br/encarte')!.fileUrl).toMatch(/\/encarte\/baixe$/);
    expect(guanabara.discover('<p>nada</p>', 'https://www.supermercadosguanabara.com.br/encarte')!.validity).toBeNull();
  });
  it('nunca segue link para outro domínio', () => {
    const c = pdfLinkConnector({ id: 'x', linkPattern: /baixe/ });
    expect(c.discover('<a href="https://outro.com/baixe">x</a>', 'https://rede.com/encarte')).toBeNull();
  });
  it('htmlToText ignora script e estilo', () => { expect(htmlToText('<style>a{}</style><b>oi</b><script>x</script>')).toBe('oi'); });
});

describe('resposta do modelo de visão', () => {
  const ok = { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: TOOL_NAME, input: { validade_texto_pagina: 'de 14/11/2026 até 17/11/2026', ofertas: [{ name: 'Arroz', price_reais: 24.9, confidence: 0.9 }, null, 'lixo'] } }] };
  it('lê ofertas e descarta entradas inválidas', () => {
    const r = parseToolUse(ok);
    expect(r.offers).toHaveLength(1); expect(r.pageValidityText).toMatch(/14\/11/);
  });
  it('formato inesperado ou truncado vira erro (nunca dado inventado)', () => {
    expect(() => parseToolUse({ content: [{ type: 'text', text: 'oi' }] })).toThrow();
    expect(() => parseToolUse({ content: [{ type: 'tool_use', name: TOOL_NAME, input: { ofertas: 'x' } }] })).toThrow();
    expect(() => parseToolUse({ ...ok, stop_reason: 'max_tokens' })).toThrow(/truncada/);
  });
  it('requisição força a ferramenta e envia o PDF em base64', () => {
    const r = buildRequest('QUJD', 'm');
    expect(r.tool_choice).toEqual({ type: 'tool', name: TOOL_NAME });
    expect((r.messages[0].content[0] as any).source.data).toBe('QUJD');
    expect(PROMPT_VERSION).toBe('v1');
  });
});
