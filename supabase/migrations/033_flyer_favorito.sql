-- 033: flyer favorito de cada usuario (26-oct-2026)
-- La barra de opciones del armador muestra fijos los 2 primeros flyers, un tercero
-- que elige cada persona con la estrellita ("Tu favorito") y el resto en "Otros".
-- El favorito vive en la cuenta (no en la PC: las de sucursal se comparten).
-- Es una lista de números de opción: uno por solapa (Flyer Galicia / Flyer Rubros).
-- Cada uno la edita con la policy de siempre "profiles: editar propio"; el guardia
-- de profiles sólo frena role/status, así que no hace falta nada más.
alter table public.profiles add column if not exists flyer_fav jsonb;
