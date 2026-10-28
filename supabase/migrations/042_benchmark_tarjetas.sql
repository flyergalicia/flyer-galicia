-- 042: tabla de tarjetas premium y salas VIP del Benchmark (entrega 3, 28-oct-2026).
--
-- No hay una fuente con datos ordenados (cada banco lo publica en texto en sus páginas),
-- así que se carga a mano: una fila por tarjeta o paquete de cada banco. La primera carga
-- (supabase/_seed_bench_tarjetas.sql) sale de las páginas oficiales de cada banco, con la
-- dirección de donde se leyó y la fecha; el admin corrige y agrega desde la solapa
-- Benchmark → Tarjetas y salas VIP. Estas condiciones cambian seguido (ej.: Macro baja
-- sus pases el 18/11/2026): por eso cada fila lleva "vigencia", "fuente" y "revisada".
--
--   pases_anio  -> pases a salas VIP por año para el titular (número, para comparar); el
--                  detalle de qué tipo de sala va en salas_vip
--   confianza   -> 'oficial' (página del banco) | 'nota' (prensa o blog) | 'sin_dato'
--
-- Lectura para cuentas activas; escritura sólo del admin (forma de 018: (select ...)).
-- Idempotente: se puede correr varias veces.

create table if not exists public.promos_bench_tarjetas (
  id          uuid primary key default gen_random_uuid(),
  banco       text not null,
  tarjeta     text not null,                 -- 'Visa Signature', 'Mastercard Black', 'American Express Icon'
  paquete     text not null default '',      -- 'Black+ All', 'Selecta', 'Identité', 'Select', 'Éminent'
  orden       int  not null default 0,
  pases_anio  int,
  salas_vip   text not null default '',
  fast_pass   text not null default '',
  acompanantes text not null default '',
  parking     text not null default '',
  seguros     text not null default '',
  puntos      text not null default '',
  costo       text not null default '',
  vigencia    text not null default '',
  fuente_url  text not null default '',
  confianza   text not null default 'oficial' check (confianza in ('oficial', 'nota', 'sin_dato')),
  revisada    date,
  notas       text not null default '',
  updated_at  timestamptz not null default now()
);
create index if not exists promos_bench_tarjetas_banco on public.promos_bench_tarjetas (banco, orden);

alter table public.promos_bench_tarjetas enable row level security;

drop policy if exists "bench tarjetas: leer" on public.promos_bench_tarjetas;
create policy "bench tarjetas: leer" on public.promos_bench_tarjetas
  for select to authenticated using ((select public.is_active()));

drop policy if exists "bench tarjetas: admin escribe" on public.promos_bench_tarjetas;
create policy "bench tarjetas: admin escribe" on public.promos_bench_tarjetas
  for all to authenticated
  using ((select public.is_active()) and (select public.get_my_role()) = 'admin')
  with check ((select public.is_active()) and (select public.get_my_role()) = 'admin');

-- la fecha de la última modificación la pone la base
create or replace function public.promos_bench_tarjetas_ts() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists promos_bench_tarjetas_ts on public.promos_bench_tarjetas;
create trigger promos_bench_tarjetas_ts before update on public.promos_bench_tarjetas
  for each row execute function public.promos_bench_tarjetas_ts();
