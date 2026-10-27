-- 035: promociones de MODO que valen con Galicia (pedido del dueño, 26-oct-2026).
--
-- MODO (modo.com.ar/promos) publica promos que Galicia no muestra en su
-- buscador: combustible por marca (YPF, WICO), súper del interior, farmacias.
-- La Edge Function promos-galicia las baja con el filtro "Galicia" después de
-- cada actualización del catálogo de Galicia (la de las 9 y la manual) y las
-- guarda acá, aparte: los ids son de otro tipo (uuid) y una falla de MODO no
-- tiene que tocar la copia de Galicia. La app las suma a Promociones con el
-- tilde "Incluir MODO" y esconde las que ya están en Galicia.
--
-- Mismas columnas y mismo significado que promos_galicia_cache, para que la
-- app las trate igual (supermercados, días, provincia, "Nueva"):
--   provincias  -> array con nombres (de la lista de Galicia) / '{}' = online /
--                  null = no se sabe (MODO no informa sus locales). Ver 011.
--   localidades -> 'PROVINCIA|LOCALIDAD' de cada local (sin acentos, mayúscula),
--                  para el filtro por localidad (en Galicia se pide en vivo).
--   imagen      -> 'modo/<marca>.png' (logo copiado al bucket flyers) o el
--                  nombre de archivo del logo de esa marca en Galicia; '' = sin logo.
--   dias        -> "Martes", "Viernes y sábados", "Todos los días".
--
-- Idempotente: se puede correr varias veces.

create table if not exists public.promos_modo_cache (
  id            text primary key,                -- benefit.id de MODO
  slug          text not null default '',        -- ficha pública: modo.com.ar/promos/{slug}
  titulo        text not null default '',
  subtitulo     text not null default '',        -- rubro con los nombres de Galicia
  imagen        text not null default '',
  beneficio     text,
  tope          text,
  dias          text,
  canales       text[],
  solo_galicia  boolean not null default false,  -- false = "Bancos adheridos" (pagando con MODO)
  provincias    text[],
  localidades   text[],
  fecha_desde   date,
  fecha_hasta   date,
  proximamente  boolean not null default false,
  primera_vez   timestamptz,
  updated_at    timestamptz not null default now()
);
-- igual que en 025: las que ya estaban quedan en null; las nuevas toman la fecha
alter table public.promos_modo_cache alter column primera_vez set default now();

alter table public.promos_modo_cache enable row level security;

drop policy if exists "promos modo: leer" on public.promos_modo_cache;
create policy "promos modo: leer" on public.promos_modo_cache
  for select to authenticated using (true);
-- Sin insert/update/delete para 'authenticated': sólo escribe la Edge Function.

alter table public.promos_galicia_meta
  add column if not exists modo_last_sync_at timestamptz,
  add column if not exists modo_total int,
  add column if not exists modo_error text;
