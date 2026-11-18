-- Listas avançadas: período, ordem personalizada, texto original de itens importados e cota de importação por IA.

alter table public.shopping_lists
  add column period_start date,
  add column period_end date,
  add constraint shopping_lists_period_ck check (period_end is null or period_start is null or period_end >= period_start);

alter table public.list_items
  add column position int,                    -- ordem personalizada (menor = primeiro); null = ordem de criação
  add column source_text text;                -- linha/trecho original quando o item veio de importação (nunca se perde)
create index on public.list_items (list_id, position);

-- cota diária de leituras por IA (importação de PDF/imagem) para impedir uso abusivo da chave
create table public.list_import_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.list_import_usage enable row level security;   -- sem policies: só o backend (service role)

-- registra uso e informa se ainda há cota (chamada pelo backend)
create or replace function public.consume_import_quota(p_user uuid, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare used int;
begin
  insert into list_import_usage (user_id, day, n) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set n = list_import_usage.n + 1 returning n into used;
  return used <= p_max;
end $$;
revoke all on function public.consume_import_quota(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_import_quota(uuid, int) to service_role;
