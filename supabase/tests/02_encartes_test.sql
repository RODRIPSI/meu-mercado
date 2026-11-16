-- Testes do módulo de encartes. Falha (ON_ERROR_STOP) se qualquer asserção falhar.
do $$
declare ch uuid; src uuid; fl uuid; pg uuid; o_ok uuid; o_rev uuid; o_old uuid; n int; failed boolean;
begin
  select id into ch from chains where name='Guanabara';
  select id into src from flyer_sources where connector='guanabara';
  if src is null then raise exception 'FALHOU: fonte guanabara não semeada'; end if;
  if (select enabled from flyer_sources where id=src) then raise exception 'FALHOU: fonte deve nascer DESLIGADA'; end if;

  -- backend (superusuário no teste) grava o encarte
  insert into flyers (source_id, source_url, file_sha256, valid_from, valid_until, status) values (src,'u','h1',current_date-1,current_date+3,'processed') returning id into fl;
  begin insert into flyers (source_id, source_url, file_sha256) values (src,'u','h1'); failed:=false;
  exception when unique_violation then failed:=true; end;
  if not failed then raise exception 'FALHOU: mesmo arquivo importado duas vezes'; end if;
  insert into flyer_pages (flyer_id,page_no,image_sha256) values (fl,1,'img1') returning id into pg;

  insert into flyer_offers (flyer_id,page_id,chain_id,fingerprint,name,price_cents,valid_until,review_status)
    values (fl,pg,ch,'fp-ok','Arroz 5kg',2490,current_date+3,'auto_ok') returning id into o_ok;
  insert into flyer_offers (flyer_id,page_id,chain_id,fingerprint,name,review_status,issues)
    values (fl,pg,ch,'fp-rev','Feijão ?',   'needs_review','{sem_preco,sem_validade}') returning id into o_rev;
  insert into flyer_offers (flyer_id,page_id,chain_id,fingerprint,name,price_cents,valid_until,review_status)
    values (fl,pg,ch,'fp-old','Leite',499,current_date-2,'auto_ok') returning id into o_old;

  -- duplicata por fingerprint
  begin insert into flyer_offers (flyer_id,page_id,chain_id,fingerprint,name) values (fl,pg,ch,'fp-ok','x'); failed:=false;
  exception when unique_violation then failed:=true; end;
  if not failed then raise exception 'FALHOU: fingerprint duplicado aceito'; end if;

  -- auto_ok sem preço é recusado (nunca mostrar preço não verificado)
  begin insert into flyer_offers (flyer_id,page_id,chain_id,fingerprint,name,review_status,valid_until) values (fl,pg,ch,'fp-x','y','auto_ok',current_date+1); failed:=false;
  exception when check_violation then failed:=true; end;
  if not failed then raise exception 'FALHOU: oferta auto_ok sem preço aceita'; end if;
  -- preço zero é recusado
  begin insert into flyer_offers (flyer_id,page_id,chain_id,fingerprint,name,price_cents) values (fl,pg,ch,'fp-z','z',0); failed:=false;
  exception when check_violation then failed:=true; end;
  if not failed then raise exception 'FALHOU: preço 0 aceito'; end if;

  -- ===== usuário comum: vê só ofertas confiáveis; não grava =====
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from flyer_offers;
  if n <> 2 then raise exception 'FALHOU: usuário comum viu % ofertas (esperado 2: ok + vencida auto_ok)', n; end if;
  select count(*) into n from active_offers;
  if n <> 1 then raise exception 'FALHOU: active_offers deveria ter 1 (vencida e em revisão ficam fora), tem %', n; end if;
  begin insert into flyer_offers (flyer_id,page_id,chain_id,fingerprint,name) values (fl,pg,ch,'fp-hack','h'); failed:=false;
  exception when insufficient_privilege then failed:=true; end;
  -- sem policy de insert, RLS bloqueia
  if not failed then
    -- se o insert passou por falta de erro, confirmar que nada entrou
    select count(*) into n from flyer_offers where fingerprint='fp-hack';
    if n > 0 then raise exception 'FALHOU: usuário comum gravou oferta'; end if;
  end if;
  begin perform review_offer(o_rev,'approve'); failed:=false;
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'FALHOU: não-curador revisou oferta'; end if;
  reset role;

  -- ===== curador =====
  insert into app_curators (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
  perform set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into n from flyer_offers;
  if n <> 3 then raise exception 'FALHOU: curador deveria ver 3, viu %', n; end if;
  -- aprovar sem preço/validade falha
  begin perform review_offer(o_rev,'approve'); failed:=false;
  exception when check_violation then failed:=true; end;
  if not failed then raise exception 'FALHOU: aprovou oferta sem preço/validade'; end if;
  -- corrigir e aprovar
  perform review_offer(o_rev,'approve',('{"name":"Feijão Carioca 1kg","price_cents":799,"valid_until":"'||(current_date+2)||'"}')::jsonb);
  select count(*) into n from active_offers;
  if n <> 2 then raise exception 'FALHOU: após aprovar, active_offers deveria ter 2, tem %', n; end if;
  reset role;

  -- expiração registra as vencidas
  select expire_offers() into n;
  if n <> 1 then raise exception 'FALHOU: expire_offers expirou %, esperado 1', n; end if;
  if (select expired_at from flyer_offers where id=o_old) is null then raise exception 'FALHOU: expired_at não gravado'; end if;
  raise notice 'encartes: todos os testes passaram';
end $$;
