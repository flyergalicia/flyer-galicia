-- Beneficios de PAQUETE de BBVA (no son de un comercio: los da la tarjeta del paquete).
-- Fuente: páginas oficiales del banco, leídas el 29-oct-2026:
--   https://www.bbva.com.ar/personas/productos/paquetes/black-all.html
--   https://www.bbva.com.ar/personas/productos/paquetes/black-travel.html
-- Sólo lo que la página confirma: 20 % todos los días, tope $100.000 por mes compartido,
-- Visa Signature pagando por NFC, crédito. Se cargan en "Cargadas a mano" con la condición
-- del paquete, así la comparación los muestra como "Sólo Paquete Black+ All".
-- Es repetible: no duplica filas que ya están. Aplicar DESPUÉS de la migración 044.
insert into public.promos_bench_manual
  (banco, titulo, rubro, beneficio, pct, tope, tope_por, cuotas, dias_n, credito, debito, segmento, condicion, provincias, fecha_desde, fecha_hasta, fuente_url, notas)
select v.*
from (values
  ('bbva', 'Supermercados', 'Supermercados', '20% de reintegro todos los días pagando con Visa Signature por NFC. Tope compartido con Combustible y Gastronomía.',
    20::numeric, 100000::numeric, 'month', 0, '{}'::smallint[], true, false, 'premium', 'Paquete Black+ All · Visa Signature por NFC', null::text[], date '2026-07-01', date '2026-12-31',
    'https://www.bbva.com.ar/personas/productos/paquetes/black-all.html', 'Beneficio del paquete, no de un comercio. Revisar la vigencia al cambiar el semestre.'),
  ('bbva', 'Combustible', 'Combustible', '20% de reintegro todos los días pagando con Visa Signature por NFC. Tope compartido con Supermercados y Gastronomía.',
    20, 100000, 'month', 0, '{}', true, false, 'premium', 'Paquete Black+ All · Visa Signature por NFC', null, date '2026-07-01', date '2026-12-31',
    'https://www.bbva.com.ar/personas/productos/paquetes/black-all.html', 'Beneficio del paquete, no de un comercio. Revisar la vigencia al cambiar el semestre.'),
  ('bbva', 'Gastronomía', 'Gastronomía', '20% de reintegro todos los días pagando con Visa Signature por NFC. Tope compartido con Supermercados y Combustible.',
    20, 100000, 'month', 0, '{}', true, false, 'premium', 'Paquete Black+ All · Visa Signature por NFC', null, date '2026-07-01', date '2026-12-31',
    'https://www.bbva.com.ar/personas/productos/paquetes/black-all.html', 'Beneficio del paquete, no de un comercio. Revisar la vigencia al cambiar el semestre.'),
  ('bbva', 'Gastronomía', 'Gastronomía', '20% de reintegro todos los días en gastronomía, con el paquete Black+ Travel.',
    20, 100000, 'month', 0, '{}', true, false, 'premium', 'Paquete Black+ Travel', null, date '2026-07-01', date '2026-12-31',
    'https://www.bbva.com.ar/personas/productos/paquetes/black-travel.html', 'Tope tomado de lo que dice la página; confirmar si es el mismo que el de Black+ All.')
) as v(banco, titulo, rubro, beneficio, pct, tope, tope_por, cuotas, dias_n, credito, debito, segmento, condicion, provincias, fecha_desde, fecha_hasta, fuente_url, notas)
where not exists (
  select 1 from public.promos_bench_manual m
  where m.banco = v.banco and m.titulo = v.titulo and m.condicion = v.condicion
);
