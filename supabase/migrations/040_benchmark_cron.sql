-- 040: el Benchmark se actualiza solo UNA vez por semana (pedido del dueño,
-- 27-oct-2026: nada de esto puede afectar al armador). Domingo 03:00 hora
-- Argentina (06:00 UTC), cuando nadie usa la app. Después de bajar las promos
-- de los cinco bancos, la función completa lugares y logos de las marcas
-- nuevas: como el tiempo de una llamada es corto, se pide en tres tandas
-- separadas por diez minutos (las marcas ya hechas se saltean).
--
-- Igual que 024: pg_cron + pg_net. La clave vive en el Vault ('bench_cron_secret')
-- y en los secretos de la función (BENCH_CRON_SECRET), NUNCA en este archivo.
-- Antes de aplicar:
--   select vault.create_secret('<clave de 32+ caracteres>', 'bench_cron_secret');
-- y la misma clave en Supabase → Edge Functions → Secrets (BENCH_CRON_SECRET).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('benchmark-sync-semanal', '0 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"sync"}'::jsonb, timeout_milliseconds := 120000);
$$);

select cron.schedule('benchmark-marcas-1', '10 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"marcas"}'::jsonb, timeout_milliseconds := 120000);
$$);

select cron.schedule('benchmark-marcas-2', '20 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"marcas"}'::jsonb, timeout_milliseconds := 120000);
$$);

select cron.schedule('benchmark-marcas-3', '30 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"marcas"}'::jsonb, timeout_milliseconds := 120000);
$$);
