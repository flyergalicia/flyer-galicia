-- Geografía de las promociones de Galicia: en qué provincias se puede usar
-- cada una. Sirve para dos cosas en la pestaña "Promociones":
--   1) filtrar la validación de un flyer por provincia (una marca vigente a
--      nivel nacional puede no tener un solo local en la zona del asesor);
--   2) la solapa "Promociones activas", que lista todo lo vigente de una
--      provincia sin pegar marcas.
--
-- Por qué una columna array y no una tabla puente promo->provincia: son ~4230
-- pares, y el cliente trae el catálogo entero a memoria para matchear. Una
-- tabla aparte obligaría a una segunda consulta paginada (PostgREST corta en
-- 1000 filas en este proyecto) y a un join en el navegador; el array viaja
-- pegado a la fila que ya se trae. No hay ninguna consulta SQL del lado del
-- cliente que se beneficiaría de la tabla puente.
--
-- Los tres valores posibles son tres cosas DISTINTAS, y la diferencia importa:
--   {'NEUQUEN',...} -> tiene locales en esas provincias
--   '{}'            -> se verificó y no está en ninguna: son las promos de
--                      compra online (~307 de 1922), que no tienen local y por
--                      lo tanto valen en todo el país
--   null            -> nunca se calculó (catálogo sincronizado por una versión
--                      vieja, o la barrida de provincias falló)
-- Por eso la columna es nullable y SIN default: si arrancara en '{}' , un
-- catálogo sin geografía se vería como "1922 promos online" y el filtro por
-- provincia no descartaría nada sin que nadie se entere. Con null, el cliente
-- sabe que no tiene el dato y lo dice.
--
-- Idempotente: se puede correr varias veces.

alter table public.promos_galicia_cache
  add column if not exists provincias text[];

-- Lista maestra de provincias y sus localidades, tal como la devuelve Galicia
-- (/catalogo/v1/locales/ubicacion/filtro): [{nombre, localidades:[...]}, ...].
-- Son 24 provincias y ~4200 localidades, ~14 KB: entra cómodo en la fila de
-- metadata que el cliente ya pide junto con el catálogo, y evita una tabla
-- (con su RLS y su consulta) para un único objeto que se lee entero siempre.
alter table public.promos_galicia_meta
  add column if not exists ubicaciones jsonb;
