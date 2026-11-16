# Arquitetura — Meu Mercado Inteligente

## 1. Visão geral

```
┌──────────────── App (Expo / React Native / TypeScript) ────────────────┐
│  app/            rotas (expo-router): telas                            │
│  src/features/   estado e acesso a dados (auth, casa, catálogo, listas)│
│  src/domain/     REGRAS PURAS (sem React, sem rede) ← testadas         │
│  src/connectors/ contrato para fontes de preço (hoje só manual/CSV)    │
│  src/theme + components/  design system                                │
└───────────────┬────────────────────────────────────────────────────────┘
                │ supabase-js (somente chave anon) · Realtime · Auth
┌───────────────▼────────────────────────────────────────────────────────┐
│ Supabase: PostgreSQL + RLS + RPCs + gatilhos (auditoria, histórico)    │
└────────────────────────────────────────────────────────────────────────┘
```

Decisão central: **toda regra de negócio que calcula dinheiro vive em `src/domain`** (funções puras, 69 testes). As telas só chamam essas funções. Isso mantém o comparador e o otimizador verificáveis e reaproveitáveis em iOS/web.

## 2. Modelo de dados (supabase/migrations)

| Grupo | Tabelas |
|---|---|
| Identidade | `profiles`, `houses`, `house_members` (admin/membro + `can_edit`), `house_invites` |
| Referência global (somente leitura) | `chains` (7 redes), `categories` |
| Por casa | `stores` (filiais, endereço, lat/lng, km), `products`, `product_barcodes`, `product_equivalences`, `house_product_prefs` |
| Preços | `prices` (atual, 1 por produto×filial), `price_history` (log append-only), `offers` |
| Listas | `shopping_lists`, `list_items` (com `version`) |
| Compras | `purchases`, `purchase_items` |
| Despensa | `pantry_items`, `stock_movements` |
| Outros | `budgets`, `alert_rules`, `alert_events`, `push_tokens`, `receipts`, `audit_log` |

Regras de integridade que o próprio banco impõe:
- `price_cents > 0`: **preço ausente = ausência de linha**, nunca zero.
- Promoção por volume só é aceita completa (`promo_min_qty` + `promo_unit_price_cents`).
- Preço é por **filial**: `unique(house_id, product_id, store_id)`; nada é herdado da rede.
- Não duplica item pendente na mesma lista (índices únicos parciais por produto e por texto, sem diferenciar maiúsculas).
- Registros de uma casa não podem referenciar registros de outra (gatilho `enforce_same_house`).
- Sempre sobra um administrador (gatilho `keep_one_admin`).
- Todo preço novo/alterado grava `price_history`; mudanças nas tabelas principais gravam `audit_log` (visível só ao admin).

## 3. Segurança
- **RLS ligada em todas as tabelas.** Leitura: integrante da casa. Escrita: integrante com `can_edit`. Convites/auditoria: só admin.
- Criar casa, convidar e entrar são **RPCs `security definer`** (`create_house`, `create_invite`, `join_house`): o cliente nunca insere em `house_members` diretamente, então ninguém se promove ou entra sem convite válido (expira em 72 h, limite de usos, código de 10 caracteres hex).
- O app contém só `URL` + chave `anon`. Nunca `service_role`.
- Erros mostrados ao usuário são mensagens amigáveis (`friendlyError`); nada de SQL/stack na tela.
- LGPD: dados fiscais ainda não são coletados (notas = etapa futura); quando forem, ficam em `receipts` sob a mesma RLS, com tela de conferência antes de salvar.

## 4. Preços: confiabilidade e frescor
- Fontes: `manual`, `confirmed` (visto na prateleira/modo compra), `imported`, `receipt`, `demo`.
- Status calculado (`priceStatus`): **atual**, **desatualizado** (>14 dias; promoção sem validade >3 dias), **vencido** (oferta passada de `valid_until`), **indisponível**.
- Confiabilidade: alta (confirmado/nota e atual), média (manual/importado e atual), baixa (desatualizado ou DEMO).
- Ofertas vencidas e indisponíveis **nunca entram no cálculo de otimização**; desatualizados entram, mas sinalizados.

## 5. Otimizador (`src/domain/optimizer.ts`)
Para cada item e mercado, escolhe a melhor opção entre produtos aceitáveis (o escolhido + equivalentes permitidos; marca travada = só o próprio), convertendo a quantidade da lista em embalagens (`packsNeeded`) e aplicando promoção por volume. Depois enumera todos os subconjuntos de mercados (≤7 redes ⇒ ≤127) com limite de paradas:

| Modo | Paradas | Custo avaliado |
|---|---|---|
| A – Um mercado | 1 | itens + deslocamento |
| B – Equilibrado | ≤ 2 | itens + deslocamento + R$ 3,00 por parada extra |
| C – Máxima economia | ≤ N (padrão: todos) | itens + deslocamento |

Ordenação: **menos itens sem preço primeiro**, depois menor custo total, depois menos paradas. Resultado traz a base do cálculo (premissas, itens sem preço, preços desatualizados/DEMO, distância desconhecida) e a economia **só quando a lista está completa**: contra a média dos mercados com lista completa e contra o melhor mercado único. Deslocamento = `2 × km × custo/km` (km informado por filial; sem GPS/rotas ainda).

## 6. Offline e sincronização
- Última sincronização de catálogo, listas e itens é guardada em AsyncStorage e exibida sem rede (com aviso).
- Alterações em itens entram numa **fila** (`domain/sync.ts`): edições do mesmo item são fundidas; ao reconectar (NetInfo) a fila é enviada em ordem.
- **Concorrência otimista:** cada item tem `version`; o envio usa `update … where version = X`. Se 0 linhas mudarem, é conflito: a alteração vai para a lista de conflitos e o usuário escolhe “manter a minha” ou “usar a atual”. Nada se perde em silêncio.
- Realtime: eventos de `list_items`, `shopping_lists`, `prices`, `products`, `stores`, `house_members` disparam recarga (com debounce).
- Itens criados offline ainda não podem ser editados até sincronizar (limitação conhecida).

## 7. Navegação
Abas: **Listas · Preços · Mercados · Casa**. Pilha: Lista → Otimizar → Modo compra → Finanças; Produto (comparação + histórico); Registrar preço; Importar CSV; Scanner; Despensa. Fluxo de acesso: login → (criar/entrar em casa) → abas.

## 8. Design system
Verde-sálvia `#9CAF88`, verde-escuro `#2F4A3A`, marfim `#FAF7F0`, cinzas suaves; terracota `#C8704A` só para promoções. Modo claro/escuro/automático. Alvos de toque ≥ 52 dp, tipografia 16 px, sem animações piscantes. Componentes em `src/components/ui.tsx`.

## 9. Decisões e alternativas
- **Preço atual + log** em vez de só log: leitura simples para o comparador; histórico preservado por gatilho.
- **Stores/produtos/preços por casa** (não globais): privacidade total e sem depender de dados de terceiros. Contribuição coletiva entre casas seria outra camada, fora do escopo privado.
- **Enumeração exata** no otimizador (em vez de heurística): com ≤7 redes é instantânea e garante o ótimo dentro do modelo.
- **Importação por CSV colado** (em vez de seletor de arquivos): sem dependência nativa extra; seletor de arquivos fica como melhoria.
