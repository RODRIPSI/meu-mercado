-- Meu Mercado Inteligente — esquema principal
-- Princípios: tudo que é privado pertence a uma casa (house_id); preço ausente = ausência de linha (nunca zero).

create extension if not exists pgcrypto;

-- ───────────── Identidade e casa ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.houses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  region text not null default 'Rio de Janeiro, RJ',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.house_members (
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  can_edit boolean not null default true,       -- permissão: false = somente leitura
  joined_at timestamptz not null default now(),
  primary key (house_id, user_id)
);
create index on public.house_members (user_id);

create table public.house_invites (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  max_uses int not null default 5 check (max_uses > 0),
  uses int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.house_invites (house_id);

-- ───────────── Referência global (somente leitura) ─────────────
create table public.chains (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0
);

-- ───────────── Mercados (por casa) ─────────────
-- Cada filial tem seus próprios preços; nada é herdado da rede.
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  chain_id uuid not null references public.chains(id),
  name text not null,                    -- ex.: "Guanabara – Freguesia"
  address text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  distance_km numeric(6,2) check (distance_km >= 0),   -- da casa até a filial (informado ou calculado)
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.stores (house_id);

-- ───────────── Catálogo (por casa) ─────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),   -- nome padronizado
  category_id uuid references public.categories(id),
  brand text,
  pack_qty numeric(12,3) not null default 1 check (pack_qty > 0),   -- conteúdo da embalagem
  unit text not null default 'un' check (unit in ('un','kg','g','l','ml')),
  variant text,
  image_url text,
  created_at timestamptz not null default now()
);
create index on public.products (house_id);
-- evita duplicar o mesmo produto/embalagem sem querer
create unique index products_no_dup on public.products
  (house_id, lower(name), lower(coalesce(brand,'')), pack_qty, unit);

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null check (barcode ~ '^[0-9]{8,14}$'),
  unique (house_id, barcode)
);

-- equivalências controladas (marca alternativa / outra embalagem); relação simétrica é tratada no app
create table public.product_equivalences (
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  equivalent_id uuid not null references public.products(id) on delete cascade,
  note text,
  primary key (product_id, equivalent_id),
  check (product_id <> equivalent_id)
);

create table public.house_product_prefs (
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  favorite boolean not null default false,
  brand_locked boolean not null default false,   -- true = só aceitar esta marca
  primary key (house_id, product_id)
);

-- ───────────── Preços ─────────────
-- Linha ausente = preço desconhecido. Nunca gravar 0.
create table public.prices (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  price_cents int not null check (price_cents > 0),
  source text not null check (source in ('manual','confirmed','imported','receipt','demo')),
  source_ref text,                        -- URL, nome do arquivo, nº da nota…
  observed_at timestamptz not null default now(),
  valid_until timestamptz,                -- validade da oferta, se houver
  is_promo boolean not null default false,
  promo_min_qty int check (promo_min_qty > 1),            -- promoção por volume: a partir de N unidades…
  promo_unit_price_cents int check (promo_unit_price_cents > 0), -- …cada unidade sai por este valor
  conditions text,                        -- descontos condicionais (texto livre, ex.: "com cartão da rede")
  available boolean not null default true,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (house_id, product_id, store_id),
  check ((promo_min_qty is null) = (promo_unit_price_cents is null))
);
create index on public.prices (house_id, product_id);

create table public.price_history (
  id bigserial primary key,
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid not null,
  store_id uuid not null,
  price_cents int not null check (price_cents > 0),
  is_promo boolean not null,
  source text not null,
  observed_at timestamptz not null
);
create index on public.price_history (house_id, product_id, store_id, observed_at desc);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title text not null,
  price_cents int check (price_cents > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  source text not null check (source in ('manual','imported','demo')),
  source_ref text,
  created_at timestamptz not null default now()
);
create index on public.offers (house_id, valid_until);

-- ───────────── Listas ─────────────
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'custom' check (kind in ('weekly','monthly','custom')),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.shopping_lists (house_id, status);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  category_id uuid references public.categories(id),
  preferred_brand text,
  qty numeric(12,3) not null default 1 check (qty > 0),
  unit text not null default 'un' check (unit in ('un','kg','g','l','ml')),
  est_price_cents int check (est_price_cents > 0),
  notes text,
  priority smallint not null default 1 check (priority between 0 and 2),  -- 0 baixa, 1 normal, 2 alta
  assignee uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending','bought','skipped')),
  version int not null default 1,          -- concorrência otimista (ver trigger)
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.list_items (list_id);
-- anti-duplicação: mesmo produto do catálogo (ou mesmo texto livre) não repete na lista enquanto pendente
create unique index list_items_no_dup_product on public.list_items (list_id, product_id)
  where product_id is not null and status = 'pending';
create unique index list_items_no_dup_text on public.list_items (list_id, lower(name))
  where product_id is null and status = 'pending';

-- ───────────── Compras realizadas ─────────────
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  list_id uuid references public.shopping_lists(id) on delete set null,
  purchased_at timestamptz not null default now(),
  total_cents int not null check (total_cents >= 0),     -- valor efetivamente pago
  budget_cents int check (budget_cents >= 0),
  notes text,
  created_by uuid references auth.users(id)
);
create index on public.purchases (house_id, purchased_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  category_id uuid references public.categories(id),
  name text not null,
  qty numeric(12,3) not null check (qty > 0),
  unit text not null default 'un',
  unit_price_cents int not null check (unit_price_cents > 0),
  discount_cents int not null default 0 check (discount_cents >= 0)
);
create index on public.purchase_items (purchase_id);

-- ───────────── Despensa ─────────────
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  qty numeric(12,3) not null default 0 check (qty >= 0),
  unit text not null default 'un' check (unit in ('un','kg','g','l','ml')),
  min_qty numeric(12,3) check (min_qty >= 0),
  expires_on date,
  updated_at timestamptz not null default now()
);
create index on public.pantry_items (house_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  pantry_item_id uuid not null references public.pantry_items(id) on delete cascade,
  delta numeric(12,3) not null,
  reason text not null check (reason in ('purchase','consumption','adjustment','discard')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (pantry_item_id, created_at);

-- ───────────── Orçamento, alertas, notas fiscais ─────────────
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents int not null check (amount_cents >= 0),
  unique (house_id, month)
);

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('price_drop','favorite_promo','below_threshold','offer_expiring','restock','list_savings')),
  product_id uuid references public.products(id) on delete cascade,
  threshold_cents int check (threshold_cents > 0),
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  enabled boolean not null default true
);

create table public.alert_events (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  rule_id uuid references public.alert_rules(id) on delete cascade,
  dedup_key text not null,                -- impede notificação repetida para o mesmo fato
  message text not null,
  created_at timestamptz not null default now(),
  unique (rule_id, dedup_key)
);

create table public.push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  primary key (user_id, token)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  store_id uuid references public.stores(id),
  issued_at timestamptz,
  total_cents int check (total_cents >= 0),
  extracted jsonb not null default '[]'::jsonb,   -- itens extraídos, aguardando conferência
  status text not null default 'pending_review' check (status in ('pending_review','confirmed','rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────── Auditoria ─────────────
create table public.audit_log (
  id bigserial primary key,
  house_id uuid not null,
  actor uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);
create index on public.audit_log (house_id, at desc);
