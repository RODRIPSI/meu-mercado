-- ⚠ DADOS DE DEMONSTRAÇÃO — NÃO SÃO PREÇOS REAIS.
-- Serve só para você ver o comparador funcionando. Todos os produtos levam "[DEMO]" no nome e
-- todos os preços ficam com source = 'demo' (o app exibe a etiqueta DEMONSTRAÇÃO e baixa a confiabilidade).
-- Uso (SQL Editor do Supabase, logado como o dono do projeto):  select public.seed_demo_data('<id-da-casa>');
-- Requer ao menos 2 filiais cadastradas na casa. Para remover: select public.remove_demo_data('<id-da-casa>');

create or replace function public.seed_demo_data(p_house uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s1 uuid; s2 uuid; n int := 0; pid uuid; r record;
begin
  select id into s1 from stores where house_id = p_house order by created_at limit 1;
  select id into s2 from stores where house_id = p_house order by created_at offset 1 limit 1;
  if s1 is null or s2 is null then raise exception 'cadastre ao menos 2 filiais antes'; end if;
  for r in select * from (values
    ('[DEMO] Arroz branco', 'Marca Exemplo', 5::numeric, 'kg', 2790, 2990),
    ('[DEMO] Feijão carioca', 'Marca Exemplo', 1::numeric, 'kg', 790, 719),
    ('[DEMO] Leite integral', 'Marca Exemplo', 1::numeric, 'l', 479, 519)
  ) as t(name, brand, qty, unit, p1, p2) loop
    insert into products (house_id, name, brand, pack_qty, unit) values (p_house, r.name, r.brand, r.qty, r.unit)
      on conflict do nothing returning id into pid;
    if pid is not null then
      insert into prices (house_id, product_id, store_id, price_cents, source, source_ref) values
        (p_house, pid, s1, r.p1, 'demo', 'seed_demo'), (p_house, pid, s2, r.p2, 'demo', 'seed_demo');
      n := n + 2;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.remove_demo_data(p_house uuid) returns void
language sql security definer set search_path = public as $$
  delete from prices where house_id = p_house and source = 'demo';
  delete from products where house_id = p_house and name like '[DEMO]%';
$$;
revoke all on function public.seed_demo_data(uuid), public.remove_demo_data(uuid) from public, anon, authenticated;
