-- 037: aclaración de las promos de MODO (pedido del dueño, 27-oct-2026).
--
-- La promo "YPF" de MODO es YPF Boxes: 6 cuotas sólo en cambio de aceite,
-- filtro y escaneo del vehículo, no en combustible. MODO lo dice en el detalle
-- (details.applicability_description); casi siempre ese texto es de relleno
-- ("Consultá los locales adheridos"), así que la Edge Function sólo lo guarda
-- cuando dice una restricción de verdad. La app lo muestra debajo del
-- beneficio. Con esa aclaración, una de "Combustible" que es de service pasa al
-- rubro Vehículos (lo decide la función).
--
-- Va ANTES de publicar la función (el upsert manda la columna).

alter table public.promos_modo_cache
  add column if not exists aclaracion text;

-- La RLS de lectura ("promos modo: leer") es por fila y ya cubre la columna nueva.
