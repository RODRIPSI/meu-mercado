# Listas, importação e nova navegação

## Navegação (barra inferior)
Início · Listas · Ofertas · Mercados · Casa. Perfil, aparência e sair ficam em **Casa → Configurações**.
A antiga aba Preços virou **Ofertas → Comparar produtos** (cadastro manual de produto/preço e importação CSV continuam lá).

## Importar lista (Listas → Importar lista)
| Origem | Como é lida | Estado |
|---|---|---|
| Texto colado | No aparelho (`domain/listparse.ts`) | implementado e testado (unitário) |
| Word (.docx) | No aparelho (jszip + parser de parágrafos/tabelas) | implementado, parser testado; leitura de arquivo real não testada no aparelho |
| PDF / JPG / PNG | Edge Function `parse-list` (IA de visão, chave só no servidor) | implementado e publicado; **dependente de configuração**: precisa do segredo `ANTHROPIC_API_KEY` |

Sempre há prévia editável (nome, quantidade, unidade, marca, observação, categoria). Linhas não entendidas ficam marcadas “revisar” com o texto original preservado (`source_text`). Duplicados nunca são somados automaticamente: só aparece “Somar” quando nome, unidade e marca são idênticos.
Limites: 8 MB, 20 leituras por IA/dia por pessoa, resultado reaproveitado por hash do arquivo.

## Lista
Cartões com período, status (planejada / em andamento / concluída), progresso, estimativa (só itens com preço; os sem preço são contados à parte, nunca como zero) e última atualização. Três visões: por categoria, por mercado (estratégia A/B/C; itens sem preço em “Sem preço conhecido”) e ordem personalizada (subir/descer). Toque no item: quantidade, marca preferida, observações, categoria, mover para outra lista, remover. Alterações sincronizam com a casa e respeitam `can_edit`.

## Banco
Migração `0006_listas_avancadas` (aplicada): `period_start/end`, `list_items.position/source_text`, `list_import_usage` + `consume_import_quota`.

## Pendente
- Configurar `ANTHROPIC_API_KEY` no Supabase para PDF/foto.
- Autorizar a fonte Guanabara (“pode ligar”) para ler encartes.
- Testar no aparelho: seleção de arquivo (.docx/PDF/foto) e a folha de edição de item.
