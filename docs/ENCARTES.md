# Importação de encartes (módulo de ofertas)

Transforma o PDF do encarte de uma rede em ofertas pesquisáveis, validadas e comparáveis com a lista de compras.

## Fluxo

1. **Agendador** (`pg_cron`, a cada 5 min) chama a Edge Function `ingest-flyer` com um token guardado no Vault. A função só consulta o site da rede no máximo a cada 6 h.
2. **Permissões**: só roda para fontes com `flyer_sources.enabled = true` (trava manual). Antes de baixar, lê o `robots.txt` da rede; qualquer dúvida (erro, bloqueio) = não coleta. Identifica-se com User-Agent próprio, faz 2 requisições por verificação (página + PDF) e nunca segue link para outro domínio.
3. **Download** do PDF (limite 25 MB, confere `%PDF-`), cálculo de SHA-256 e cópia no Storage privado `flyers`. Mesmo arquivo = ignorado (`unique(source_id, file_sha256)`).
4. **Páginas**: o PDF é dividido em PDFs de 1 página (bytes determinísticos → hash estável). Cada página tem `image_sha256`.
5. **Leitura visual**: cada página vai ao modelo de visão (Claude, via API, chave só no backend) com saída estruturada. Resultado fica em `vision_cache` por (hash da página, versão do prompt): imagem idêntica **não é reprocessada**. Teto diário de leituras (`MAX_VISION_CALLS_PER_DAY`, padrão 80).
6. **Validação** (`supabase/functions/_shared/offers.ts`): preço ausente/zero/implausível, validade ausente/incoerente/vencida, preço por kg/L que não bate com preço × embalagem, promoção incompleta, confiança < 0,8. **Qualquer problema → `needs_review`** e o preço nem é gravado como número. Só `auto_ok`/`approved` entram nas comparações.
7. **Gravação** em `flyer_offers` com fingerprint único (sem duplicatas), texto original (`raw_text`), posição aproximada (`bbox`, frações da página) e a página original no Storage para auditoria.
8. **Expiração**: a view `active_offers` já filtra por data; `expire_offers()` (diário) registra `expired_at`.
9. **Revisão**: curadores veem as ofertas em dúvida (tela "Revisar ofertas"), corrigem nome/preço/validade e aprovam ou rejeitam (`review_offer`).
10. **Comparação**: tela "Ofertas dos encartes" casa as ofertas vigentes com os itens pendentes da lista (`src/domain/offers.ts`): nome, marca, embalagem; marca divergente não casa; embalagem diferente é marcada; ofertas com cartão só entram se você marcar.

## Adicionar outra rede (Supermarket, Assaí, Mundial, Prezunic, Rede Economia, Armazém Urbano)

1. Verificar termos de uso e `robots.txt` da rede e como ela publica o encarte (PDF, imagens, app).
2. Criar o conector em `supabase/functions/_shared/connectors.ts` (para redes com link de PDF: `pdfLinkConnector({...})`, ~1 linha) e registrá-lo em `CONNECTORS`.
3. Inserir a linha em `flyer_sources` (já nasce **desligada**) e, só após a verificação, `enabled = true` com `authorization_note` dizendo quem verificou e quando.
4. Reimplantar a função. O restante (visão, validação, revisão, comparação) é comum.

Redes sem PDF público (só app/WhatsApp/redes sociais) **ficam manuais** até haver forma permitida.

## Ativação (uma vez)

| Passo | Quem | Estado |
|---|---|---|
| Migrações 0004 e `ops/0005_ingestao_apoio.sql` | aplicadas | feito |
| Função `ingest-flyer` publicada | feito | feito |
| Segredo `ANTHROPIC_API_KEY` (Supabase → Edge Functions → Segredos) | você | **pendente** |
| `update flyer_sources set enabled = true, authorization_note = '…' where connector = 'guanabara'` | após sua confirmação | **pendente** |

## Status (implementado e testado / implementado não testado / dependente de configuração / planejado)

- **Implementado e testado**: tabelas, RLS, curadores, revisão, expiração, view de vigentes (testes de banco); validação, fingerprint, validade, casamento com a lista, leitor de robots.txt, conector Guanabara sobre HTML de exemplo, leitura da resposta do modelo (testes automáticos); autenticação da função (401 com token errado, 200 com token do agendador); telas de ofertas (Chrome headless com dados simulados).
- **Implementado, não testado de ponta a ponta**: download real do PDF do Guanabara, divisão em páginas, chamada real ao modelo de visão e a precisão da leitura. **Dependem da chave de IA e da liberação da fonte**; a precisão só se mede com um encarte real e a revisão humana.
- **Dependente de configuração**: `ANTHROPIC_API_KEY`; habilitar a fonte; custo da API (uma chamada por página nova, ~12 por encarte do Guanabara).
- **Limitações conhecidas**: a posição (`bbox`) é aproximada (estimada pelo modelo); a página original é aberta como PDF, sem recorte automático; preço de encarte vale para a rede toda (não por filial).
- **Planejado**: demais redes; recorte visual da oferta; vincular oferta aprovada a `prices` por filial; alerta de oferta de item da lista.
