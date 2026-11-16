# Meu Mercado Inteligente

App familiar (Android primeiro) para listas compartilhadas, comparação de preços entre filiais e otimização das compras.

- `app/` — Expo + React Native + TypeScript (`src/domain` = regras puras testadas)
- `supabase/` — migrations (esquema, RLS, RPCs), seed de referência, seed **DEMO** opcional e testes de banco
- `docs/` — `ARQUITETURA.md`, `ANDROID.md` (como rodar), `STATUS.md` (o que está/não está pronto), `FONTES_DE_PRECO.md`

Princípios: nunca inventar preços · ausência de preço nunca vira R$ 0,00 · preço pertence a uma filial · tudo que é parcial ou desatualizado é sinalizado.

Comece por `docs/ANDROID.md`.
