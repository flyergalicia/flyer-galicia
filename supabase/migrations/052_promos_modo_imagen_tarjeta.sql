-- 052 · Promociones de MODO: la imagen de su tarjeta, para las marcas sin logo
-- Unas 80 promos de MODO son de marcas que Galicia no tiene y de las que MODO no informa el logo
-- (Chalita, Diarco, Almacor…): quedaban sin imagen en Promociones. La función promos-galicia guarda
-- ahora la imagen de la tarjeta de MODO (copiada al bucket, flyers/modo/tarjeta-<id>.png) en esta
-- columna aparte. Casi siempre es el logo, a veces una foto: por eso no va en "imagen" y no se
-- ofrece como logo para el flyer (al elegir esa marca en el flyer se pide subir su imagen).
-- Tiene que estar aplicada ANTES de publicar la función (si no, guardar las promos de MODO falla).
alter table public.promos_modo_cache add column if not exists imagen_tarjeta text;
