-- 036: las promos de MODO de la primera copia no son "Nuevas" (26-oct-2026).
--
-- La primera actualización de MODO (migración 035) las insertó todas juntas y
-- primera_vez tomó la fecha de ese momento: la app las mostraba a TODAS con la
-- etiqueta "Nueva" durante 7 días, aunque no eran promos nuevas sino nuevas en
-- nuestra copia. Igual que en 025 con Galicia: lo que ya estaba queda en null y
-- sólo lo que aparezca desde la próxima actualización cuenta como nuevo.
--
-- Idempotente en la práctica: sólo toca filas de antes del 27-oct-2026 03:00 UTC.

update public.promos_modo_cache
   set primera_vez = null
 where primera_vez < '2026-10-27 03:00:00+00';
