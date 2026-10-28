-- 039: Benchmark de promociones (Galicia vs BBVA, Macro, Supervielle, Santander).
-- Pedido del dueño, 27-oct-2026. Herramienta interna, sólo a nivel persona.
--
-- Todo va APARTE del armador: la Edge Function benchmark-sync (una vez por
-- semana, o a mano desde la solapa) guarda acá las promos de cada banco y la
-- solapa Benchmark las lee. Ni el armador ni Promociones tocan estas tablas.
--
-- promos_bench_cache: una fila por promo y banco, ya normalizada (para comparar
--   "qué devuelve" no alcanza el texto: hacen falta número de % y de tope).
--     pct        -> % de reintegro (cashback.amount con tipo percent), null si no tiene
--     tope       -> tope en pesos (card.cashback_cap), null = sin tope informado
--     tope_por   -> 'month' | 'week' | 'day' | 'transaction' | null (cada cuánto se renueva)
--     cuotas     -> máximo de cuotas sin interés (0 = no tiene)
--     dias_n     -> días de la semana 0=lunes … 6=domingo ('{}' = todos los días)
--     segmento   -> 'premium' | 'clasico' | null (sin dato); segmento_txt = texto original
--     provincias -> mismo significado que en promos_galicia_cache (null = no se sabe,
--                   '{}' = online / todo el país); se completa con promos_bench_marcas.
-- promos_bench_marcas: lugares de cada marca (se piden una vez por marca, no por promo).
-- promos_bench_meta: una fila por banco con la última actualización y su error.
-- promos_bench_hist: resumen semanal (cuántas promos y mejor % por banco y rubro).
--
-- Idempotente: se puede correr varias veces.

create table if not exists public.promos_bench_cache (
  id            text primary key,                -- '<banco>:<benefit.id de MODO>'
  banco         text not null,
  titulo        text not null default '',        -- marca/comercio (card.validity_place)
  marca_clave   text not null default '',
  rubro         text not null default 'Otros',
  slug          text not null default '',
  beneficio     text,
  pct           numeric,
  tope          numeric,
  tope_por      text,
  cuotas        int not null default 0,
  dias          text,
  dias_n        smallint[] not null default '{}',
  credito       boolean not null default false,
  debito        boolean not null default false,
  emisores      text[] not null default '{}',
  canales       text[] not null default '{}',
  segmento      text,
  segmento_txt  text,
  provincias    text[],
  fecha_desde   date,
  fecha_hasta   date,
  proximamente  boolean not null default false,
  primera_vez   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists promos_bench_cache_banco on public.promos_bench_cache (banco);

create table if not exists public.promos_bench_marcas (
  marca_clave   text primary key,
  provincias    text[],
  localidades   text[],
  imagen        text not null default '',        -- 'bench/<id>.png' en el bucket flyers
  updated_at    timestamptz not null default now()
);

create table if not exists public.promos_bench_meta (
  banco         text primary key,
  last_sync_at  timestamptz,
  total         int,
  error         text
);

create table if not exists public.promos_bench_hist (
  semana        date not null,
  banco         text not null,
  rubro         text not null,
  promos        int not null default 0,
  mejor_pct     numeric,
  primary key (semana, banco, rubro)
);

-- Lectura sólo para cuentas activas (forma de 018); escribir, sólo la función (service key).
do $$
declare t text;
begin
  foreach t in array array['promos_bench_cache','promos_bench_marcas','promos_bench_meta','promos_bench_hist'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "bench: leer" on public.%I', t);
    execute format('create policy "bench: leer" on public.%I for select to authenticated using ((select public.is_active()))', t);
  end loop;
end $$;
