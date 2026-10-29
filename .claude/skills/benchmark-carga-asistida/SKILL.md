---
name: benchmark-carga-asistida
description: Carga mensual (cerca del día 5) de las promos propias de Santander y Macro para la solapa Benchmark, leyendo sus páginas en el navegador de la app a ritmo de persona. Usar cuando el dueño pida actualizar Santander o Macro del Benchmark, o cuando llegue el mail de recordatorio del día 5.
---

# Carga asistida de Santander y Macro (Benchmark)

Las webs de Santander y Macro no se pueden leer desde un servidor. Una vez por mes se abren en el
navegador de la app, como lo haría una persona, y lo que la propia página muestra se manda a la
función `benchmark-sync` con la acción `importar_web`.

## Reglas que no se negocian (leer primero)

1. Se usa **sólo el navegador de la app** (`mcp__Claude_Browser__*`), con páginas normales y a ritmo de persona (una marca por vez, sin ráfagas).
2. **Prohibido** esquivar protecciones: nada de proxies ni servicios que "pasan" anti-robots (firecrawl con proxy stealth u otros), nada de disfrazar pedidos ni de inyectar `fetch` propios en la página, nada de resolver verificaciones o CAPTCHAs.
3. Se lee sólo **el texto de la página** (`get_page_text`) y **las respuestas que la propia página ya pidió** (`read_network_requests` con `requestId`).
4. Si la web pide una verificación, o contesta bloqueo/403/429: **frenar, avisar al dueño y no insistir.** Lo que quedó sin leer se carga a mano en Benchmark → Cargadas a mano.
5. La clave del cron nunca se pide, se imprime ni se escribe en un archivo: el script `supabase/_importar_web.mjs` la lee del Vault con `SB_TOKEN` (que el dueño pasa por el entorno).
6. Subir a producción o a GitHub sólo si el dueño lo pide.

## Alcance

Sólo los rubros clave: **Supermercados, Combustible, Gastronomía y Farmacia/Salud**. De Macro, sólo lo que MODO no trae (cuotas sin interés en comercios propios, niveles de Selecta); los % de Macro ya llegan por MODO.

## Pasos

1. **Santander**
   1. `preview_start` con `https://www.santander.com.ar/personas/beneficios` (el navegador de la app ya abre estas páginas con normalidad).
   2. Recorrer las categorías clave y abrir cada marca. Al abrir una marca la página pide `/bff-benefits/brands/{id}`: con `read_network_requests` (filtro `bff-benefits/brands`) y el `requestId`, guardar la respuesta JSON.
   3. Juntar las respuestas en una lista y guardarla en el scratchpad como `santander_items.json`.
2. **Macro**
   1. Abrir `https://www.macro.com.ar/beneficios` y entrar al catálogo propio "Más beneficios con Macro" en las categorías clave.
   2. Con `get_page_text`, leer cada tarjeta (texto tipo `Rubro\nCOMERCIO\nN cuotas\nsin interés\nVer más\nGeneral`) y armar `[{comercio, categoria, cuotas, segmento}]` (`segmento` = General, Selecta, etc.). Guardar en el scratchpad como `macro_items.json`.
3. **Importar** (el dueño pasa `SB_TOKEN` por el entorno; no escribirlo en ningún archivo):

   ```bash
   node supabase/_importar_web.mjs santander santander_items.json
   node supabase/_importar_web.mjs macro macro_items.json
   ```

   La función no reemplaza lo guardado si llega menos de la mitad de lo que ya había (freno de siempre).
4. **Verificar**: consultar `promos_bench_cache` por `fuente in ('santander','macro')` (cantidad por banco y rubro) y revisar Combustible (YPF, Shell). Informar al dueño cuántas quedaron por banco, qué rubros se leyeron y qué no.
5. La etiqueta del banco en el Benchmark pasa a decir "MODO + web propia (carga asistida, act. dd/mm)". Si falta algo, sumarlo en Cargadas a mano.
