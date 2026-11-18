-- Testes das listas avançadas.
do $$
declare hA uuid; hB uuid; lA uuid; lB uuid; iA uuid; failed boolean; n int; ok boolean;
begin
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select id into hA from houses where name = 'Casa A';
  select id into lA from shopping_lists where house_id = hA limit 1;
  -- período coerente
  update shopping_lists set period_start = '2026-11-16', period_end = '2026-11-22' where id = lA;
  begin update shopping_lists set period_end = '2026-11-01' where id = lA; failed := false;
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'FALHOU: período invertido aceito'; end if;
  -- posição e texto original
  insert into list_items (list_id, house_id, name, qty, position, source_text) values (lA, hA, 'Café', 2, 5, '2x café Pilão 500g (forte)') returning id into iA;
  update list_items set position = 1 where id = iA;
  if (select source_text from list_items where id = iA) is null then raise exception 'FALHOU: texto original perdido'; end if;
  -- mover item para outra lista da MESMA casa funciona
  insert into shopping_lists (house_id, name) values (hA, 'Outra') returning id into lB;
  update list_items set list_id = lB where id = iA;
  if (select list_id from list_items where id = iA) <> lB then raise exception 'FALHOU: mover entre listas'; end if;
  reset role;

  -- mover para lista de OUTRA casa é bloqueado pelo gatilho
  perform set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', true);
  set local role authenticated;
  select id into hB from houses where name = 'Casa B';
  reset role;
  insert into shopping_lists (house_id, name) values (hB, 'Lista B') returning id into lB;
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin update list_items set list_id = lB where id = iA; failed := false;
  exception when others then failed := true; end;
  if not failed and (select list_id from list_items where id = iA) = lB then raise exception 'FALHOU: item movido para lista de outra casa'; end if;
  reset role;

  -- cota de importação: só o backend consome; respeita o teto
  select consume_import_quota('aaaaaaaa-0000-0000-0000-000000000001', 2) into ok; if not ok then raise exception 'FALHOU: 1ª chamada deveria passar'; end if;
  select consume_import_quota('aaaaaaaa-0000-0000-0000-000000000001', 2) into ok; if not ok then raise exception 'FALHOU: 2ª chamada deveria passar'; end if;
  select consume_import_quota('aaaaaaaa-0000-0000-0000-000000000001', 2) into ok; if ok then raise exception 'FALHOU: 3ª chamada deveria ser negada'; end if;
  set local role authenticated;
  begin perform consume_import_quota('aaaaaaaa-0000-0000-0000-000000000001', 99); failed := false;
  exception when insufficient_privilege then failed := true; end;
  reset role;
  if not failed then raise exception 'FALHOU: usuário comum consumiu a cota'; end if;
  raise notice 'listas avançadas: todos os testes passaram';
end $$;
