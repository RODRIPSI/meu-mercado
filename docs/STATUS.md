# Status honesto da primeira versão (v0.1)

Legenda: ✅ implementado **e testado** · 🟡 implementado, **ainda não testado em execução real** · ⚙️ **depende de configuração/credenciais** · 🗓️ planejado

## O que foi realmente verificado
- ✅ Esquema SQL, RLS, RPCs, gatilhos e seed demo — rodados em PostgreSQL 16 local com um *stub* do Supabase (isolamento entre casas, convites, leitura-apenas, último admin, anti-duplicação, concorrência por versão, preço zero rejeitado, histórico, auditoria). **Não rodei contra um projeto Supabase real.**
- ✅ 69 testes de regras: unidade/preço por kg·litro, embalagens, status/confiabilidade, comparador, otimizador A/B/C (parcial, promoção por volume, equivalentes, filial≠rede, deslocamento), histórico/estatística com mínimo de dados, despensa, finanças, alertas (dedup, horário silencioso), fila offline/conflitos, importador CSV.
- ✅ `tsc --noEmit` sem erros e empacotamento Android (Hermes) concluído. **O app não foi aberto em um aparelho Android.**
- ✅ Versão web (PWA) gerada e aberta em Chrome sem interface gráfica: as telas **Conectar ao seu banco** e **Login** renderizam e a rota de entrada funciona. Nada além disso foi exercitado na web (sem Supabase real não há como entrar).

## Por requisito
| # | Requisito | Estado |
|---|---|---|
| 5 | Cadastro, login, recuperação de senha | 🟡 ⚙️ (Auth + redirect `mmi://nova-senha`) |
| 5 | Casa, convites, perfis, admin, permissões, auditoria, realtime | ✅ banco · 🟡 telas (não há tela para ver o histórico de alterações) |
| 6 | Listas compartilhadas, anti-duplicação, conflitos, reutilizar | ✅ regras · 🟡 telas; ⚠️ falta editar prioridade/responsável/observações/marca preferida na UI (colunas existem) |
| 6 | Entrada por texto/catálogo/código de barras | 🟡 · voz 🗓️ |
| 7 | Catálogo, equivalências, marca travada | ✅ banco/regras · 🟡 telas (sem editar produto, sem imagem) |
| 8 | Comparador (preço/kg·l, fonte, data, validade, confiabilidade) | ✅ cálculo · 🟡 tela |
| 9 | Preços manuais e importação CSV | ✅ parser · 🟡 telas; coleta automática 🗓️ (ver FONTES_DE_PRECO.md) |
| 10 | Otimização A/B/C | ✅ |
| 11 | Modo compra | 🟡 (alternativas, carrinho, orçamento, finalizar; total só soma itens com preço) |
| 12 | Alertas | ✅ lógica de decisão/dedup · 🗓️ disparo (precisa de Edge Function + FCM) ⚙️ |
| 13 | Histórico/estatística, oportunidade | ✅ cálculo · 🟡 gráfico simples de barras |
| 14 | Despensa | ✅ cálculo · 🟡 tela básica |
| 15 | Finanças | ✅ cálculo · 🟡 tela básica (por categoria/gráficos 🗓️; exportação via compartilhar CSV) |
| 16 | Notas fiscais | 🗓️ (tabela `receipts` pronta) |
| 18 | Offline | ✅ fila/conflitos/overlay · 🟡 integração (AsyncStorage/NetInfo); itens criados offline não editáveis até sincronizar |
| 19 | Segurança | ✅ RLS testada · sem segredos no app |

## Lacunas conhecidas
- Distância é informada à mão (sem GPS/rotas); custo de deslocamento é por km.
- Sem seleção de arquivo (importação por texto colado) e sem notificações push.
- Sem testes de interface nem E2E; sem iOS/web testados.
- Preços “DEMO” existem só se você rodar o seed e ficam sempre rotulados.
