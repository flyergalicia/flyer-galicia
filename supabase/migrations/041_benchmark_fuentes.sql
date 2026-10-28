-- 041: el Benchmark suma las webs propias de BBVA y Galicia (entrega 2, 27-oct-2026).
--
-- MODO no tiene todo: BBVA publica ~1.000 promos en su web contra ~200 en MODO, y
-- Galicia ~1.700 vigentes contra ~150 que MODO le atribuye. Las filas nuevas llevan
-- fuente 'bbva' / 'galicia' (las de MODO, 'modo', que es el valor de siempre); la
-- solapa junta las que son la misma promo y se queda con la de la web propia.
--   fuente      -> de dónde sale la fila: 'modo' | 'bbva' | 'galicia'
--   detalle_at  -> cuándo se leyó el detalle de esa promo (Galicia: el tope y las
--                  tarjetas están en el texto legal de cada una; se relee cada 14 días)
--
-- También se reprograma la tarea semanal: después de MODO (06:00) vienen BBVA (06:05),
-- el detalle de Galicia en cuatro tandas (06:10 a 06:40: cada llamada tiene tiempo
-- limitado y retoma donde quedó) y por último los lugares y logos de las marcas
-- (06:50, 07:00 y 07:10). Misma clave del Vault que 040.
--
-- Idempotente: se puede correr varias veces.

alter table public.promos_bench_cache
  add column if not exists fuente text not null default 'modo',
  add column if not exists detalle_at timestamptz;
create index if not exists promos_bench_cache_fuente on public.promos_bench_cache (fuente);

select cron.schedule('benchmark-bbva-semanal', '5 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"bbva"}'::jsonb, timeout_milliseconds := 120000);
$$);

select cron.schedule('benchmark-galicia-1', '10 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"galicia"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('benchmark-galicia-2', '20 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"galicia"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('benchmark-galicia-3', '30 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"galicia"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('benchmark-galicia-4', '40 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"galicia"}'::jsonb, timeout_milliseconds := 120000);
$$);

-- las tandas de marcas pasan a después de las webs propias (mismo nombre: reemplaza la tarea)
select cron.schedule('benchmark-marcas-1', '50 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"marcas"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('benchmark-marcas-2', '0 7 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"marcas"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('benchmark-marcas-3', '10 7 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"marcas"}'::jsonb, timeout_milliseconds := 120000);
$$);
