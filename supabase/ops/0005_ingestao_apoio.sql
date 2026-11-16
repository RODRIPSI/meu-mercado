-- Apoio à Edge Function ingest-flyer (aplicar no projeto real; usa vault/pg_cron/pg_net, que não existem no banco de testes local).
-- 1) token de agendamento guardado no Vault (gerado aqui; nunca sai do banco)
-- 2) função que a Edge Function usa para validar o token
-- 3) agendamento (a cada 5 min: descobre encarte novo no máx. a cada 6h e lê poucas páginas por vez)

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'ingest_token') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'ingest_token', 'Token do agendador de encartes');
  end if;
end $$;

create or replace function public.ingest_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'ingest_token' and decrypted_secret = p_token);
$$;
revoke all on function public.ingest_token_ok(text) from public, anon, authenticated;
grant execute on function public.ingest_token_ok(text) to service_role;

-- agendamento: troque <PROJECT_URL> se necessário
select cron.unschedule('ingest-flyer') where exists (select 1 from cron.job where jobname = 'ingest-flyer');
select cron.schedule('ingest-flyer', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://qbcspovtfznbhrjxnoan.supabase.co/functions/v1/ingest-flyer',
    headers := jsonb_build_object('content-type','application/json',
      'x-ingest-token', (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_token')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$cron$);
select cron.unschedule('expire-offers') where exists (select 1 from cron.job where jobname = 'expire-offers');
select cron.schedule('expire-offers', '5 3 * * *', $$ select public.expire_offers(); $$);
