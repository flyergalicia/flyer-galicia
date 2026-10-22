-- 029: texto del beneficio de cada promo (pedido del dueño, 21-oct-2026).
--
-- beneficio -> lo que manda Galicia en "promocion" ("25% de ahorro.", "Hasta 12
--              cuotas sin interés."). Con esto, en los súper el flyer lleva sólo
--              los días de las promos con % de descuento (Coto: "Martes", no
--              "Todos los días" de las cuotas). Lo llena promos-galicia.

alter table public.promos_galicia_cache
  add column if not exists beneficio text;

-- La RLS de lectura ("promos: leer") es por fila y ya cubre la columna nueva.
