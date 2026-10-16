-- 025: promociones "Nuevas" y "Próximamente" (pedido del dueño, 16-oct-2026).
--
-- primera_vez  -> cuándo apareció la promo en el catálogo por primera vez. La
--                 Edge Function NO la manda en el upsert: al insertar toma el
--                 default now() y al actualizar queda como estaba. La app marca
--                 "Nueva" lo que apareció en los últimos 7 días.
--                 null = ya estaba antes de que existiera esta columna (no es nueva).
-- proximamente -> Galicia ya la publicó pero todavía no arrancó.
-- fecha_desde  -> inicio, sólo para las próximamente (viene del detalle; para
--                 las demás la app la sigue pidiendo a demanda).

alter table public.promos_galicia_cache
  add column if not exists primera_vez timestamptz,
  add column if not exists proximamente boolean not null default false,
  add column if not exists fecha_desde date;

-- El default se pone DESPUÉS de crear la columna: así las filas que ya
-- estaban quedan en null (no "nuevas") y sólo las que entren desde ahora
-- toman la fecha del momento.
alter table public.promos_galicia_cache
  alter column primera_vez set default now();

-- La RLS de lectura ("promos: leer") es por fila y ya cubre las columnas nuevas.
