# Pendientes

En orden de prioridad. Lo que se termina se borra de acá: la historia queda en git.

## Para publicar la app React (sólo con el OK del dueño)

1. Seguir «Para publicar» de `docs/PLAN_MIGRACION_REACT.md`: revisar las decisiones pendientes del informe de la etapa 4 (incluye los errores de la versión anterior que se portaron como estaban: se cambian sólo si el dueño lo decide).
2. Subir un **PDF real** en Config → Flyer con una cuenta de prueba: el motor nunca se comparó con un flyer real.
3. Confirmar que estén aplicadas las migraciones que la app ya usa (034 de Estudio, 038 de Flyers para copiar, 050 del tablero de Gestiones, entre otras). Cada una va **antes** del cliente que la necesita.
4. Publicar las tres Edge Functions con supabase-js 2.118.0 y unpdf 2.1.0 (sólo se probaron en Deno local).
5. Etiquetar `a88f5e8` antes de publicar, para poder volver atrás.

## Probar en vivo (nunca se vio con datos reales)

- Suplencia con dos cuentas reales, y Prospect como asesor y como Hunter.
- Estudio → Preguntar y Compartir.
- Insertar una sección con un flyer subido en Estudio → Flyers para copiar.
- Promociones con y sin «Incluir MODO» (poner YPF en un flyer y bajar el PDF).
- Benchmark. Falta que el dueño defina la vista «estoy en este comercio».
- Alta de usuario desde Admin → Usuarios → Nuevo usuario (confirma que anda con el registro directo cerrado; ver `docs/adr/0004-…`).
- Un mail de aviso real de punta a punta (por ejemplo, un cambio de clave de Prospect).

## Puesta en marcha que hace el dueño con su sesión

- Crear las opciones nuevas (Rubros, Sueldo, "Ambos") en Config → Opciones, subir cada PDF limpio, calibrar, cargar legales y habilitar en Facultades.
- Crear la variante "sin cashback" de cada flyer y habilitarla por perfil (`docs/adr/0003-…`).
- Prender Estudio por perfil en Facultades.
- Gestiones sigue en "prueba": pasarla a "on" sólo si el dueño lo pide.
- Benchmark: la carga asistida de Santander quedó sin súper, combustible, gastronomía y farmacia (skill `benchmark-carga-asistida`).

## Límites conocidos

- **Opciones sin imagen** (las "VIEJO…" y "Sin cashback"): muestran el cartel "todavía no tiene flyer cargado" y la elección automática las saltea. La opción 1 de producción no tiene flyer: un perfil con `opcion_1` ve el cartel.
- **Aprobar en Estudio con dos admins a la vez** puede pisar la lista de opciones (es un archivo, igual que Config → Opciones). Hoy hay un solo admin; si cambia, mover la lista a una tabla.
- **Paneo horizontal con zoom alto:** el canvas no puede ser más ancho que el panel.
- **Calibrador:** los ajustes finos de oficiales por sede (`ehS`, `titH`, `ewS`) viven en la configuración pero no tienen campos en pantalla.
- **Contraseñas filtradas (HIBP):** requiere el plan Pro de Supabase. Alternativa gratis: una lista de claves comunes en la app.

## Backlog (no hacer sin que el dueño lo pida)

- **Renombrar `importe` / `importe2` a `combustible` / `supermercado`**, con `{total}` como la suma. Hoy `importe` es el tope principal y su significado depende del rubro (en Ambos es el de súper). Lo usan los legales guardados en el bucket (`{importe}` / `{importe2}` tienen que seguir andando), `padron_empresas`, `padron_log`, el historial (`v.importe`), `slices/admin/model/calibrator/benefit-templates.ts`, `slices/flyer-editor/model/bulk-sheet.ts` y Registros. Es una migración de datos con plan propio; el punto de partida es `capsOf` en `shared/domain/company-registry/categories.ts`.
- "Volver a como estaba" del Excel de empresas, con un registro de cambios.
- Ideas propuestas y no elegidas: Deshacer al restaurar, avisos con tipo y acción, mini vista previa fija en el celular, esqueletos de carga, app instalable (PWA), vista previa de la primera fila del Masivo.
- Dar de baja el repo viejo personal (remoto `oldorigin`).
