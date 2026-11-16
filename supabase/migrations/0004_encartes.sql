-- Meu Mercado Inteligente — importação de encartes (ofertas públicas das redes)
-- Princípios:
--  • encartes e ofertas são dados PÚBLICOS DA REDE (não pertencem a uma casa): leitura para autenticados;
--  • escrita SOMENTE pelo backend (service role) — o app nunca grava ofertas direto;
--  • preço ausente/duvidoso nunca vira número: oferta sem preço ou sem validade fica em revisão e não aparece nas comparações;
--  • a imagem original e a posição do anúncio ficam guardadas para auditoria.

-- ───────────── Curadores (quem pode revisar ofertas duvidosas) ─────────────
create table public.app_curators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_curators enable row level security;

create or replace function public.is_curator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_curators where user_id = auth.uid());
$$;
create policy curators_sel on public.app_curators for select to authenticated using (user_id = auth.uid());

-- ───────────── Fontes (um conector por rede) ─────────────
create table public.flyer_sources (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.chains(id),
  connector text not null unique,            -- 'guanabara', 'assai'…
  page_url text not null,                    -- onde o encarte é publicado
  enabled boolean not null default false,    -- TRAVA: só liga depois de verificar termos/permissões da rede
  authorization_note text,                   -- por que está autorizado (quem verificou, quando)
  last_checked_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);
alter table public.flyer_sources enable row level security;
create policy fsrc_sel on public.flyer_sources for select to authenticated using (true);

-- ───────────── Encartes e páginas ─────────────
create table public.flyers (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.flyer_sources(id) on delete cascade,
  source_url text not null,                  -- de onde o arquivo foi baixado
  file_sha256 text not null,                 -- evita importar o mesmo arquivo duas vezes
  storage_path text,                         -- cópia original no Storage (bucket privado 'flyers')
  valid_from date,
  valid_until date,
  page_count int,
  status text not null default 'fetched' check (status in ('fetched','processing','processed','failed')),
  error text,
  fetched_at timestamptz not null default now(),
  unique (source_id, file_sha256),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
alter table public.flyers enable row level security;
create policy flyers_sel on public.flyers for select to authenticated using (true);

create table public.flyer_pages (
  id uuid primary key default gen_random_uuid(),
  flyer_id uuid not null references public.flyers(id) on delete cascade,
  page_no int not null check (page_no > 0),
  image_sha256 text not null,                -- chave do cache de visão (imagem idêntica não é reprocessada)
  storage_path text,                         -- imagem da página, para auditoria e recorte
  width int, height int,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  error text,
  unique (flyer_id, page_no)
);
alter table public.flyer_pages enable row level security;
create policy fpages_sel on public.flyer_pages for select to authenticated using (true);

-- cache de resultados do modelo de visão: mesma imagem + mesma versão do prompt = sem nova chamada paga
create table public.vision_cache (
  image_sha256 text not null,
  prompt_version text not null,
  model text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (image_sha256, prompt_version)
);
alter table public.vision_cache enable row level security;   -- sem policies: só o backend (service role) acessa

-- ───────────── Ofertas extraídas ─────────────
create table public.flyer_offers (
  id uuid primary key default gen_random_uuid(),
  flyer_id uuid not null references public.flyers(id) on delete cascade,
  page_id uuid not null references public.flyer_pages(id) on delete cascade,
  chain_id uuid not null references public.chains(id),
  fingerprint text not null unique,          -- hash estável (rede+produto+embalagem+preço+validade): impede duplicata
  name text not null,
  brand text,
  pack_qty numeric(12,3) check (pack_qty > 0),
  unit text check (unit in ('un','kg','g','l','ml')),
  price_cents int check (price_cents > 0),   -- nunca 0; ausente = desconhecido
  unit_price_cents int check (unit_price_cents > 0),   -- preço por kg/L/un, se impresso no encarte
  unit_price_unit text check (unit_price_unit in ('un','kg','g','l','ml')),
  promo_min_qty int check (promo_min_qty > 1),
  promo_unit_price_cents int check (promo_unit_price_cents > 0),
  loyalty_required boolean not null default false,     -- exige cartão/clube da rede
  conditions text,                                     -- texto livre: "leve 3 pague 2", "com cartão"…
  valid_from date,
  valid_until date,
  store_scope text not null default 'rede',            -- 'rede' = todas as lojas; ou texto com as lojas citadas
  bbox jsonb,                                          -- posição na página, normalizada 0..1: {x,y,w,h}
  raw_text text,                                       -- texto exatamente como lido do anúncio
  confidence numeric(3,2) check (confidence between 0 and 1),
  review_status text not null default 'needs_review'
    check (review_status in ('auto_ok','needs_review','approved','rejected')),
  issues text[] not null default '{}',                 -- motivos da dúvida (ex.: 'sem_validade','preco_incoerente')
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  check ((promo_min_qty is null) = (promo_unit_price_cents is null)),
  -- só entra na comparação o que tem preço E validade conhecidos
  check (review_status not in ('auto_ok','approved') or (price_cents is not null and valid_until is not null))
);
create index on public.flyer_offers (chain_id, valid_until);
create index on public.flyer_offers (flyer_id);
create index on public.flyer_offers (review_status);
alter table public.flyer_offers enable row level security;
create policy foffers_sel on public.flyer_offers for select to authenticated
  using (review_status in ('auto_ok','approved') or is_curator());

-- ofertas vigentes e confiáveis: é o que o app compara com as listas
create view public.active_offers with (security_invoker = true) as
  select o.*, c.name as chain_name
  from public.flyer_offers o join public.chains c on c.id = o.chain_id
  where o.review_status in ('auto_ok','approved')
    and o.expired_at is null
    and o.valid_until >= current_date
    and (o.valid_from is null or o.valid_from <= current_date);
grant select on public.active_offers to authenticated;

-- expiração automática (agendada; a view já filtra por data, isto só registra)
create or replace function public.expire_offers() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update flyer_offers set expired_at = now()
   where expired_at is null and valid_until is not null and valid_until < current_date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_offers() from public, anon, authenticated;

-- ───────────── Revisão humana (somente curadores) ─────────────
-- p_fix: campos corrigidos opcionais (name, brand, pack_qty, unit, price_cents, valid_until, conditions)
create or replace function public.review_offer(p_offer uuid, p_decision text, p_fix jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o flyer_offers%rowtype;
begin
  if not is_curator() then raise exception 'apenas curadores revisam ofertas' using errcode = '42501'; end if;
  if p_decision not in ('approve','reject') then raise exception 'decisão inválida' using errcode = '22023'; end if;
  select * into o from flyer_offers where id = p_offer for update;
  if not found then raise exception 'oferta não encontrada' using errcode = 'P0002'; end if;

  if p_decision = 'reject' then
    update flyer_offers set review_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where id = p_offer;
    return;
  end if;

  update flyer_offers set
    name        = coalesce(nullif(trim(p_fix->>'name'), ''), name),
    brand       = coalesce(nullif(trim(p_fix->>'brand'), ''), brand),
    pack_qty    = coalesce((p_fix->>'pack_qty')::numeric, pack_qty),
    unit        = coalesce(nullif(p_fix->>'unit', ''), unit),
    price_cents = coalesce((p_fix->>'price_cents')::int, price_cents),
    valid_until = coalesce((p_fix->>'valid_until')::date, valid_until),
    conditions  = coalesce(nullif(trim(p_fix->>'conditions'), ''), conditions)
  where id = p_offer;

  -- a constraint recusa aprovar sem preço/validade; erro amigável:
  begin
    update flyer_offers set review_status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), issues = '{}'
     where id = p_offer;
  exception when check_violation then
    raise exception 'para aprovar, informe preço e validade' using errcode = '23514';
  end;
end $$;
revoke all on function public.review_offer(uuid, text, jsonb) from public, anon;
grant execute on function public.review_offer(uuid, text, jsonb) to authenticated;
revoke all on function public.is_curator() from public, anon;
grant execute on function public.is_curator() to authenticated;

-- ───────────── Storage privado para encartes ─────────────
-- (em bancos sem Storage, como o de testes locais, este bloco é ignorado)
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('flyers', 'flyers', false) on conflict do nothing;
    execute 'create policy flyers_read on storage.objects for select to authenticated using (bucket_id = ''flyers'')';
  end if;
end $$;

-- ───────────── Fonte inicial: Guanabara (DESLIGADA até autorização registrada) ─────────────
insert into public.flyer_sources (chain_id, connector, page_url, enabled)
select id, 'guanabara', 'https://www.supermercadosguanabara.com.br/encarte', false
from public.chains where name = 'Guanabara'
on conflict (connector) do nothing;
