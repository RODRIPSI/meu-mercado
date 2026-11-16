-- Meu Mercado Inteligente — funções, gatilhos, RLS e RPCs

-- ───────────── Helpers de permissão ─────────────
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from house_members where house_id = h and user_id = auth.uid());
$$;

create or replace function public.can_edit(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from house_members where house_id = h and user_id = auth.uid() and can_edit);
$$;

create or replace function public.is_admin(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from house_members where house_id = h and user_id = auth.uid() and role = 'admin');
$$;

-- ───────────── Gatilhos ─────────────
-- perfil automático no cadastro
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1), ''))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- integridade entre casas: o pai referenciado precisa ser da mesma casa
create or replace function public.enforce_same_house() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_house uuid; fk uuid;
begin
  fk := nullif(to_jsonb(new)->>tg_argv[1], '')::uuid;
  if fk is null then return new; end if;
  execute format('select house_id from public.%I where id = $1', tg_argv[0]) into parent_house using fk;
  if parent_house is distinct from new.house_id then
    raise exception 'registro de outra casa referenciado (%.%)', tg_argv[0], tg_argv[1] using errcode = '23514';
  end if;
  return new;
end $$;

create trigger chk_li_list    before insert or update on public.list_items      for each row execute function public.enforce_same_house('shopping_lists','list_id');
create trigger chk_li_prod    before insert or update on public.list_items      for each row execute function public.enforce_same_house('products','product_id');
create trigger chk_pi_purch   before insert or update on public.purchase_items  for each row execute function public.enforce_same_house('purchases','purchase_id');
create trigger chk_pr_prod    before insert or update on public.prices          for each row execute function public.enforce_same_house('products','product_id');
create trigger chk_pr_store   before insert or update on public.prices          for each row execute function public.enforce_same_house('stores','store_id');
create trigger chk_bc_prod    before insert or update on public.product_barcodes for each row execute function public.enforce_same_house('products','product_id');
create trigger chk_pan_prod   before insert or update on public.pantry_items    for each row execute function public.enforce_same_house('products','product_id');
create trigger chk_off_store  before insert or update on public.offers          for each row execute function public.enforce_same_house('stores','store_id');
create trigger chk_pu_store   before insert or update on public.purchases       for each row execute function public.enforce_same_house('stores','store_id');
create trigger chk_pu_list    before insert or update on public.purchases       for each row execute function public.enforce_same_house('shopping_lists','list_id');
create trigger chk_sm_pantry  before insert or update on public.stock_movements for each row execute function public.enforce_same_house('pantry_items','pantry_item_id');

-- concorrência otimista em itens de lista: o cliente atualiza com .eq('version', n);
-- se outra pessoa editou antes, 0 linhas são afetadas e o app mostra o conflito (sem perda silenciosa).
create or replace function public.bump_list_item() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger list_items_bump before update on public.list_items
  for each row execute function public.bump_list_item();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger lists_touch   before update on public.shopping_lists for each row execute function public.touch_updated_at();
create trigger pantry_touch  before update on public.pantry_items   for each row execute function public.touch_updated_at();
create trigger prices_touch  before update on public.prices         for each row execute function public.touch_updated_at();

-- histórico de preços: toda observação nova entra no log (append-only)
create or replace function public.log_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.price_cents is distinct from old.price_cents
     or new.is_promo is distinct from old.is_promo
     or new.observed_at is distinct from old.observed_at then
    insert into price_history (house_id, product_id, store_id, price_cents, is_promo, source, observed_at)
    values (new.house_id, new.product_id, new.store_id, new.price_cents, new.is_promo, new.source, new.observed_at);
  end if;
  return new;
end $$;
create trigger prices_log after insert or update on public.prices
  for each row execute function public.log_price();

-- impede remover/rebaixar o último administrador
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from houses where id = old.house_id)
     and not exists (select 1 from house_members
                     where house_id = old.house_id and role = 'admin' and user_id <> old.user_id) then
    raise exception 'a casa precisa ter ao menos um administrador' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger members_keep_admin before update or delete on public.house_members
  for each row execute function public.keep_one_admin();

-- auditoria genérica
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; h uuid;
begin
  r := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  h := (r->>'house_id')::uuid;
  insert into audit_log (house_id, actor, table_name, row_id, action, old_row, new_row)
  values (h, auth.uid(), tg_table_name, coalesce(r->>'id', r->>'user_id'), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['list_items','shopping_lists','prices','products','stores','house_members',
                           'purchases','house_invites','budgets','pantry_items'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ───────────── Row Level Security ─────────────
alter table public.profiles          enable row level security;
alter table public.houses            enable row level security;
alter table public.house_members     enable row level security;
alter table public.house_invites     enable row level security;
alter table public.chains            enable row level security;
alter table public.categories        enable row level security;
alter table public.audit_log         enable row level security;
alter table public.price_history     enable row level security;
alter table public.alert_rules       enable row level security;
alter table public.alert_events      enable row level security;
alter table public.push_tokens       enable row level security;

-- perfis: o próprio e quem divide casa
create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from house_members a join house_members b on a.house_id = b.house_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_ins on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_upd on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- casas: leitura por membros; criação só via RPC create_house; edição por admin
create policy houses_sel on public.houses for select to authenticated using (is_member(id));
create policy houses_upd on public.houses for update to authenticated using (is_admin(id)) with check (is_admin(id));
create policy houses_del on public.houses for delete to authenticated using (is_admin(id));

-- integrantes: todos veem a lista da casa; admin gerencia; qualquer um pode sair
create policy members_sel on public.house_members for select to authenticated using (is_member(house_id));
create policy members_upd on public.house_members for update to authenticated
  using (is_admin(house_id)) with check (is_admin(house_id));
create policy members_del on public.house_members for delete to authenticated
  using (is_admin(house_id) or user_id = auth.uid());

-- convites: somente admin (a entrada acontece pela RPC join_house)
create policy invites_sel on public.house_invites for select to authenticated using (is_admin(house_id));
create policy invites_upd on public.house_invites for update to authenticated
  using (is_admin(house_id)) with check (is_admin(house_id));

-- referência global
create policy chains_sel on public.chains for select to authenticated using (true);
create policy cats_sel   on public.categories for select to authenticated using (true);

-- auditoria e histórico: leitura apenas (escrita só por gatilhos)
create policy audit_sel on public.audit_log for select to authenticated using (is_admin(house_id));
create policy ph_sel    on public.price_history for select to authenticated using (is_member(house_id));

-- alertas e tokens: pessoais
create policy ar_all on public.alert_rules for all to authenticated
  using (user_id = auth.uid() and is_member(house_id))
  with check (user_id = auth.uid() and is_member(house_id));
create policy ae_sel on public.alert_events for select to authenticated using (is_member(house_id));
create policy pt_all on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- tabelas da casa: ler = membro; escrever = membro com can_edit
do $$ declare t text; begin
  foreach t in array array['stores','products','product_barcodes','product_equivalences','house_product_prefs',
                           'prices','offers','shopping_lists','list_items','purchases','purchase_items',
                           'pantry_items','stock_movements','budgets','receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_member(house_id))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (can_edit(house_id))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (can_edit(house_id)) with check (can_edit(house_id))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (can_edit(house_id))', t||'_del', t);
  end loop;
end $$;

-- ───────────── RPCs ─────────────
create or replace function public.create_house(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado' using errcode = '28000'; end if;
  insert into houses (name, created_by) values (trim(p_name), auth.uid()) returning id into h;
  insert into house_members (house_id, user_id, role) values (h, auth.uid(), 'admin');
  return h;
end $$;

create or replace function public.create_invite(p_house uuid, p_hours int default 72, p_max_uses int default 5)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_admin(p_house) then raise exception 'apenas administradores criam convites' using errcode = '42501'; end if;
  c := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
  insert into house_invites (house_id, code, created_by, expires_at, max_uses)
  values (p_house, c, auth.uid(), now() + make_interval(hours => p_hours), p_max_uses);
  return c;
end $$;

create or replace function public.join_house(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv house_invites%rowtype; n int;
begin
  if auth.uid() is null then raise exception 'não autenticado' using errcode = '28000'; end if;
  select * into inv from house_invites where code = upper(trim(p_code)) for update;
  if not found or inv.revoked or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'convite inválido ou expirado' using errcode = 'P0001';
  end if;
  insert into house_members (house_id, user_id) values (inv.house_id, auth.uid()) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update house_invites set uses = uses + 1 where id = inv.id; end if;
  return inv.house_id;
end $$;

-- permissões de execução: somente usuários autenticados
revoke all on function public.create_house(text), public.create_invite(uuid,int,int), public.join_house(text) from public, anon;
grant execute on function public.create_house(text), public.create_invite(uuid,int,int), public.join_house(text) to authenticated;
revoke all on function public.is_member(uuid), public.can_edit(uuid), public.is_admin(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.can_edit(uuid), public.is_admin(uuid) to authenticated;

-- ───────────── Realtime ─────────────
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.list_items, public.shopping_lists,
      public.prices, public.purchases, public.house_members;
  end if;
end $$;
