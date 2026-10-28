-- 043: Benchmark — promos compartidas de MODO, Supervielle y Santander propios (29-oct-2026).
--
-- Pedido del dueño tras revisar la solapa: en Combustible los cinco bancos mostraban las
-- mismas tres promos ("Combustible 10%", "WICO 15%", "YPF 6 cuotas"), que son de MODO y
-- valen con CUALQUIER banco. Se guarda cuántos bancos comparten cada promo para sacarlas
-- de la comparación (la solapa las avisa aparte).
--   promos_bench_cache.bancos_n -> 1 = exclusiva del banco; >1 = compartida en MODO;
--                                  null = web propia del banco o sin dato
--   promos_bench_meta.progreso  -> por dónde va una lectura larga que se hace por tandas
--                                  (Santander: marcas leídas en la vuelta de esta semana)
--
-- Tareas semanales nuevas (misma clave del Vault que 040/041): Supervielle (06:07) y
-- Santander en tres tandas (06:08, 06:18, 06:28; cada una retoma donde quedó la anterior).
--
-- Idempotente: se puede correr varias veces.

alter table public.promos_bench_cache add column if not exists bancos_n int;
alter table public.promos_bench_meta add column if not exists progreso jsonb;

select cron.schedule('benchmark-supervielle-semanal', '7 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"supervielle"}'::jsonb, timeout_milliseconds := 120000);
$$);

select cron.schedule('benchmark-santander-1', '8 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"santander"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('benchmark-santander-2', '18 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"santander"}'::jsonb, timeout_milliseconds := 120000);
$$);
select cron.schedule('benchmark-santander-3', '28 6 * * 0', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"santander"}'::jsonb, timeout_milliseconds := 120000);
$$);

-- ── Promos cargadas a mano (Macro y Santander propios; pedido del dueño, 29-oct) ──
-- Las webs de Macro y Santander bloquean la lectura automática, y no se esquiva esa
-- protección. Para sus promos propias, el admin carga a mano las importantes que ve en
-- su web (Benchmark → Cargadas a mano); entran a la comparación con la etiqueta
-- "cargada a mano". El día 5 de cada mes llega un mail para revisarlas.
-- Lectura para cuentas activas; escritura sólo del admin (forma de 018).
create table if not exists public.promos_bench_manual (
  id          uuid primary key default gen_random_uuid(),
  banco       text not null,
  titulo      text not null,                 -- marca o comercio
  rubro       text not null default 'Otros',
  beneficio   text not null default '',      -- texto libre ("15% los jueves con la App YPF")
  pct         numeric,
  tope        numeric,
  tope_por    text,                          -- 'month' | 'week' | 'day' | 'transaction' | null
  cuotas      int not null default 0,
  dias_n      smallint[] not null default '{}',  -- 0 = lunes … 6 = domingo; '{}' = todos los días
  credito     boolean not null default true,
  debito      boolean not null default true,
  segmento    text,                          -- 'premium' | 'clasico' | null (para todos)
  provincias  text[],                        -- null = todo el país
  fecha_desde date,
  fecha_hasta date,
  fuente_url  text not null default '',
  notas       text not null default '',
  updated_at  timestamptz not null default now()
);
alter table public.promos_bench_manual enable row level security;
drop policy if exists "bench manual: leer" on public.promos_bench_manual;
create policy "bench manual: leer" on public.promos_bench_manual
  for select to authenticated using ((select public.is_active()));
drop policy if exists "bench manual: admin escribe" on public.promos_bench_manual;
create policy "bench manual: admin escribe" on public.promos_bench_manual
  for all to authenticated
  using ((select public.is_active()) and (select public.get_my_role()) = 'admin')
  with check ((select public.is_active()) and (select public.get_my_role()) = 'admin');
drop trigger if exists promos_bench_manual_ts on public.promos_bench_manual;
create trigger promos_bench_manual_ts before update on public.promos_bench_manual
  for each row execute function public.promos_bench_tarjetas_ts();  -- misma función: pone updated_at (042)

-- recordatorio por mail el día 5 de cada mes a las 10 (hora Argentina = 13:00 UTC)
select cron.schedule('benchmark-recordatorio-mensual', '0 13 5 * *', $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/benchmark-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret')),
    body := '{"action":"recordatorio"}'::jsonb, timeout_milliseconds := 60000);
$$);
