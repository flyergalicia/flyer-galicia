-- Estudio → "Flyers para copiar" (Insertar una sección, 27-oct-2026).
--
-- El depósito de flyers para copiar vive en el bucket (_fuentes.json + imágenes,
-- los escribe sólo el admin). Los demás usuarios con Estudio pueden PROPONER un
-- flyer: es una fila de flyer_disenos con tipo 'fuente', estado 'pedido' y la
-- imagen dentro de datos (datos.img). Al aprobar, el admin sube la imagen al
-- bucket, la suma a la lista y deja la fila 'publicado' (sin la imagen).
--
-- Las reglas de acceso (RLS de 026) no cambian: cada uno ve y borra sus
-- propuestas, el admin ve todas y es el único que las aprueba o rechaza.
-- Sólo se amplía el tipo permitido. Idempotente.

alter table public.flyer_disenos drop constraint if exists flyer_disenos_tipo_chk;
alter table public.flyer_disenos
  add constraint flyer_disenos_tipo_chk check (tipo in ('diseno','combinacion','fuente'));
