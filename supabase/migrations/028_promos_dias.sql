-- 028: días de aplicación de cada promo (pedido del dueño, 21-oct-2026).
--
-- dias -> el texto que manda Galicia en "leyendaDiasAplicacion" ("Viernes",
--         "Martes y Jueves", "Todos los días"). En los súper es lo que va
--         debajo del logo en el flyer. Lo llena la Edge Function promos-galicia
--         en cada actualización; null = sin dato.

alter table public.promos_galicia_cache
  add column if not exists dias text;

-- La RLS de lectura ("promos: leer") es por fila y ya cubre la columna nueva.
