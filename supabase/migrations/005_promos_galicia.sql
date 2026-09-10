-- Caché local del catálogo de promociones de Banco Galicia (pestaña "Buscador
-- Promociones" del armador). La sincroniza la Edge Function promos-galicia
-- (acción "sync", con service_role); el cliente sólo lee.
--
-- Por qué copia y no consulta en vivo: la validación cruza 40-50 marcas del
-- flyer contra ~1700 promos y necesita ser instantánea, y guardar la fecha de
-- sync permite (a futuro) comparar mes a mes qué marca se cayó del catálogo.
--
-- Idempotente: se puede correr varias veces.

create table if not exists public.promos_galicia_cache (
  id             bigint primary key,        -- id de la promoción en Galicia
  titulo         text not null default '',  -- nombre de la marca/comercio
  subtitulo      text not null default '',  -- categoría
  imagen         text not null default '',  -- nombre de archivo del logo (en el CDN de Galicia)
  fecha_hasta    date,                       -- vigencia hasta (null = sin fecha informada)
  tipo_promocion text not null default '',
  updated_at     timestamptz not null default now()
);

create index if not exists promos_galicia_cache_titulo_idx
  on public.promos_galicia_cache (lower(titulo));

alter table public.promos_galicia_cache enable row level security;

-- Cualquier usuario logueado puede leer: el gating de "quién ve la pestaña"
-- vive en las facultades del cliente y se re-valida en la Edge Function que
-- alimenta esta tabla (ver promos-galicia/index.ts, requireCan).
drop policy if exists "promos: leer" on public.promos_galicia_cache;
create policy "promos: leer" on public.promos_galicia_cache
  for select to authenticated using (true);

-- Sin policies de insert/update/delete para 'authenticated': sólo la Edge
-- Function (service_role, que no pasa por RLS) puede escribir esta tabla.

-- Metadata de la última sincronización (una sola fila, id fijo = 1).
create table if not exists public.promos_galicia_meta (
  id           int primary key default 1,
  last_sync_at timestamptz,
  total        int not null default 0,
  constraint promos_galicia_meta_single_row check (id = 1)
);
insert into public.promos_galicia_meta (id) values (1) on conflict (id) do nothing;

alter table public.promos_galicia_meta enable row level security;
drop policy if exists "promos meta: leer" on public.promos_galicia_meta;
create policy "promos meta: leer" on public.promos_galicia_meta
  for select to authenticated using (true);
