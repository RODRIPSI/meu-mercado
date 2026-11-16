-- Testes de RLS, integridade e regras do banco. Falha (ON_ERROR_STOP) se qualquer asserção falhar.
create or replace function pg_temp.fail(msg text) returns void language plpgsql as $$ begin raise exception 'FALHOU: %', msg; end $$;

create table public._t (k text primary key, v uuid);
grant all on public._t to authenticated;

insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','a@x.com'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@x.com'),
 ('cccccccc-0000-0000-0000-000000000003','c@x.com');

do $$
declare hA uuid; hB uuid; pA uuid; sA uuid; lA uuid; n int; code text; chain uuid; iA uuid; v int; pr uuid;
begin
  -- ===== A cria casa e dados =====
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  hA := create_house('Casa A');
  select id into chain from chains where name = 'Guanabara';
  insert into stores (house_id, chain_id, name) values (hA, chain, 'Guanabara – Freguesia') returning id into sA;
  insert into products (house_id, name, brand, pack_qty, unit) values (hA,'Arroz','Tio João',5,'kg') returning id into pA;
  insert into shopping_lists (house_id, name) values (hA,'Semana') returning id into lA;
  insert into list_items (list_id, house_id, product_id, name) values (lA,hA,pA,'Arroz') returning id into iA;
  insert into _t values ('hA',hA),('pA',pA),('sA',sA),('lA',lA),('iA',iA);
  reset role;

  -- ===== B cria outra casa e não enxerga nada de A =====
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', true);
  set local role authenticated;
  hB := create_house('Casa B');
  insert into _t values ('hB',hB);
  select count(*) into n from products;   if n <> 0 then perform pg_temp.fail('B vê produtos de A'); end if;
  select count(*) into n from list_items; if n <> 0 then perform pg_temp.fail('B vê itens de A'); end if;
  select count(*) into n from houses;     if n <> 1 then perform pg_temp.fail('B vê casas alheias'); end if;
  select count(*) into n from house_members; if n <> 1 then perform pg_temp.fail('B vê integrantes alheios'); end if;
  begin insert into list_items (list_id, house_id, name) values (lA, hA, 'invasão');
    perform pg_temp.fail('B inseriu item na casa de A');
  exception when insufficient_privilege then null; end;
  begin insert into list_items (list_id, house_id, name) values (lA, hB, 'cruzado');
    perform pg_temp.fail('B vinculou item da casa B à lista de A');
  exception when check_violation then null; end;
  begin insert into prices (house_id, product_id, store_id, price_cents, source) values (hB, pA, sA, 100, 'manual');
    perform pg_temp.fail('B criou preço referenciando produto de A');
  exception when check_violation then null; end;
  begin perform join_house('NAOEXISTE'); perform pg_temp.fail('convite inexistente aceito');
  exception when sqlstate 'P0001' then null; end;
  begin perform create_invite(hA); perform pg_temp.fail('B criou convite para casa de A');
  exception when insufficient_privilege then null; end;
  reset role;

  -- ===== convite: C entra na casa A =====
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  code := create_invite(hA, 72, 1);
  reset role;
  perform set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003', true);
  set local role authenticated;
  perform join_house(code);
  select count(*) into n from list_items; if n <> 1 then perform pg_temp.fail('C não vê lista da casa'); end if;
  insert into list_items (list_id, house_id, name, qty) values (lA,hA,'Feijão',2);   -- C pode editar
  reset role;
  -- uso máximo (1) esgotado: B não consegue reutilizar
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', true);
  set local role authenticated;
  begin perform join_house(code); perform pg_temp.fail('convite acima do limite de usos');
  exception when sqlstate 'P0001' then null; end;
  reset role;

  -- ===== anti-duplicação e concorrência otimista =====
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin insert into list_items (list_id, house_id, product_id, name) values (lA,hA,pA,'Arroz');
    perform pg_temp.fail('item duplicado aceito');
  exception when unique_violation then null; end;
  begin insert into list_items (list_id, house_id, name) values (lA,hA,'FEIJÃO');
    perform pg_temp.fail('texto livre duplicado (case-insensitive) aceito');
  exception when unique_violation then null; end;
  select version into v from list_items where id = iA;
  update list_items set qty = 3 where id = iA and version = v;
  get diagnostics n = row_count; if n <> 1 then perform pg_temp.fail('update com versão correta falhou'); end if;
  update list_items set qty = 4 where id = iA and version = v;   -- versão antiga (conflito)
  get diagnostics n = row_count; if n <> 0 then perform pg_temp.fail('conflito de edição passou silenciosamente'); end if;

  -- ===== preços: nunca zero, histórico, volume =====
  begin insert into prices (house_id, product_id, store_id, price_cents, source) values (hA,pA,sA,0,'manual');
    perform pg_temp.fail('preço zero aceito');
  exception when check_violation then null; end;
  begin insert into prices (house_id, product_id, store_id, price_cents, source, promo_min_qty) values (hA,pA,sA,2000,'manual',3);
    perform pg_temp.fail('promo por volume incompleta aceita');
  exception when check_violation then null; end;
  insert into prices (house_id, product_id, store_id, price_cents, source) values (hA,pA,sA,2899,'manual') returning id into pr;
  update prices set price_cents = 2699, observed_at = now() + interval '1 second' where id = pr;
  select count(*) into n from price_history where product_id = pA; if n <> 2 then perform pg_temp.fail('histórico de preço não registrou 2 observações (' || n || ')'); end if;
  begin insert into price_history (house_id, product_id, store_id, price_cents, is_promo, source, observed_at) values (hA,pA,sA,1,false,'manual',now());
    perform pg_temp.fail('escrita direta em price_history permitida');
  exception when insufficient_privilege then null; end;

  -- ===== administrador =====
  begin delete from house_members where house_id = hA and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    perform pg_temp.fail('último admin removido');
  exception when check_violation then null; end;
  select count(*) into n from audit_log; if n = 0 then perform pg_temp.fail('auditoria vazia para admin'); end if;
  update house_members set can_edit = false where house_id = hA and user_id = 'cccccccc-0000-0000-0000-000000000003';
  reset role;

  -- ===== integrante somente leitura; não escala privilégio =====
  perform set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003', true);
  set local role authenticated;
  select count(*) into n from list_items; if n < 1 then perform pg_temp.fail('leitor perdeu leitura'); end if;
  begin insert into list_items (list_id, house_id, name) values (lA,hA,'Sal'); perform pg_temp.fail('leitor conseguiu inserir');
  exception when insufficient_privilege then null; end;
  update list_items set qty = 99 where id = iA; get diagnostics n = row_count;
  if n <> 0 then perform pg_temp.fail('leitor conseguiu editar'); end if;
  update house_members set role = 'admin' where user_id = 'cccccccc-0000-0000-0000-000000000003'; get diagnostics n = row_count;
  if n <> 0 then perform pg_temp.fail('integrante virou admin sozinho'); end if;
  select count(*) into n from audit_log; if n <> 0 then perform pg_temp.fail('integrante lê auditoria'); end if;
  select count(*) into n from house_invites; if n <> 0 then perform pg_temp.fail('integrante lê convites'); end if;
  reset role;

  -- ===== anônimo =====
  set local role anon;
  begin perform count(*) from products; perform pg_temp.fail('anon leu produtos');
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
select 'rls ok' as resultado;

-- ===== seed de demonstração: identificado como DEMO e removível =====
do $$
declare hA uuid; chain uuid; n int; s2 uuid;
begin
  select v into hA from public._t where k = 'hA';
  select id into chain from chains where name = 'Assaí';
  insert into stores (house_id, chain_id, name) values (hA, chain, 'Assaí – Teste') returning id into s2;
  n := public.seed_demo_data(hA);
  if n <> 6 then raise exception 'FALHOU: seed demo gerou % preços', n; end if;
  if exists (select 1 from prices where house_id = hA and source = 'demo' and product_id not in (select id from products where name like '[DEMO]%')) then raise exception 'FALHOU: preço demo ligado a produto real'; end if;
  perform public.remove_demo_data(hA);
  if exists (select 1 from prices where source = 'demo') or exists (select 1 from products where name like '[DEMO]%') then raise exception 'FALHOU: demo não removido'; end if;
end $$;
select 'demo ok' as resultado;
