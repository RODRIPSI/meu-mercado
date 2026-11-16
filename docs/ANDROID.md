# Como rodar

## Caminho mais simples: pelo navegador (site instalável)
Depois de criar o banco (passo 1 abaixo), o app abre como site em **https://rodripsi.github.io/meu-mercado/** e pode ser instalado na tela inicial do Android.
1. No GitHub, abra o repositório → **Configurações** → **Pages** → em **Source** (Origem) escolha **GitHub Actions**. (Só uma vez.)
2. Vá na aba **Actions**, abra **Publicar no GitHub Pages** e confirme que terminou com ✓. Toda atualização enviada à `main` republica sozinha.
3. No Chrome do Android abra o endereço acima. Na primeira vez o app pede a **Project URL** e a chave **anon public** do Supabase: cole uma vez; ficam guardadas só naquele aparelho. (O app recusa a chave secreta `service_role`.)
4. No menu ⋮ do Chrome toque em **Instalar app** / **Adicionar à tela inicial**.

Cada morador abre o mesmo endereço no seu aparelho e entra com a própria conta.

# Alternativa: app nativo com Expo Go

## 1. Criar o banco (Supabase) — uma vez
1. Crie um projeto em supabase.com (região mais próxima, ex.: São Paulo).
2. **SQL Editor → New query**: cole e execute, **nesta ordem**, o conteúdo de:
   `supabase/migrations/0001_schema.sql`, depois `0002_security_rls.sql`, depois `0003_seed_referencia.sql`.
3. **Authentication → URL Configuration → Redirect URLs**: adicione `mmi://nova-senha` (recuperação de senha).
4. **Authentication → Providers → Email**: mantenha ativo. (Para testes rápidos você pode desligar “Confirm email”; em produção, deixe ligado e configure um SMTP.)
5. **Project Settings → API**: copie **Project URL** e **anon public key** (nunca a service_role).

## 2. Configurar o app
```
cd app
cp .env.example .env     # preencha URL e chave anon
npm install --legacy-peer-deps
npx expo start
```
Abra o **Expo Go** no Android e leia o QR code (celular e computador na mesma rede; se não conectar: `npx expo start --tunnel`).

> Sem computador? Uma alternativa é abrir o repositório no **GitHub Codespaces**, rodar os mesmos comandos com `npx expo start --tunnel` e ler o QR no Expo Go. (Não testei esse caminho.)

Se algum módulo nativo reclamar no Expo Go, gere um *development build*: `npx expo run:android` (precisa de Android Studio) ou `eas build --profile development --platform android`.

## 3. Primeiro uso
1. Criar conta → Criar casa. Em **Casa → Criar convite** gere o código para os outros moradores.
2. **Mercados → Adicionar filial** (rede, nome da unidade, km de casa).
3. **Preços → Novo produto** e **Registrar preço**. Para ver o comparador funcionando antes de ter dados reais, rode no SQL Editor `supabase/demo/seed_demo.sql` e depois `select public.seed_demo_data('<id-da-casa>');` — tudo sai marcado **[DEMO]/DEMONSTRAÇÃO** e `select public.remove_demo_data('<id>')` apaga.
4. **Listas** → crie, adicione itens (texto, catálogo ou código de barras) → **Otimizar compra** → **Comprar aqui** (Modo compra) → **Finalizar**.

## 4. Testes
```
cd app && npm test && npm run typecheck      # regras de cálculo, sync, permissões lógicas
bash supabase/tests/run.sh                    # migrations + RLS em Postgres local (precisa de PostgreSQL instalado)
```
