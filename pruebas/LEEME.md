# Pruebas automáticas del armador

Son las pruebas que se corren antes de cada subida para no romper lo que ya anda. Abren la app en un navegador automático (Playwright) con una **nube simulada**: no tocan Supabase de verdad ni necesitan usuario ni clave.

## Cómo correrlas

1. Armar la app: `node _build.mjs` (se prueba `index.html`).
2. Correrlas todas: `node pruebas/correr.mjs`
   - Sólo algunas: `node pruebas/correr.mjs t39 t41` (alcanza con el comienzo del nombre).
   - Para ver todo lo que imprime cada una: `--detalle`.
3. Al final dice cuántas pasaron. Si alguna falla, muestra qué comprobación falló.

La primera vez hace falta instalar Playwright, que está fijado en `package.json`, y su Chromium: `npm install` y `npx playwright install chromium`. Para usar otro, se indica con las variables de entorno `PLAYWRIGHT` y `CHROMIUM`.

## Qué hay acá

- `t…_*.cjs`: una prueba por tema (el nombre dice qué prueba). Cada una imprime `OK` o `FALLA` por comprobación.
- `u…_*.mjs`: pruebas sin navegador de lógica suelta (por ejemplo, la revisión diaria de marcas vigiladas de la Edge Function `promos-galicia`).
- `nube.cjs`: la nube simulada (bucket, tabla de Estudio, perfiles asesor y admin, Edge Functions). `nube_simple.cjs` es la versión de las primeras pruebas.
- `nube_gestiones.cjs`: Gestiones comerciales simulado (migración 045) encima de `nube.cjs`: personas de ejemplo (oficiales, hunters y una líder), empresas con CUIT, tablas y funciones de la base con sus mismas reglas. Lo usan `t93` y la demo.
- `demo_gestiones.cjs`: **demo para probar a mano** (no es una prueba): `node pruebas/demo_gestiones.cjs` abre ventanas de navegador visibles como Oficial, Hunter y Líder, con datos inventados que comparten entre sí. No toca Supabase. Se puede elegir quiénes: `node pruebas/demo_gestiones.cjs oficial hunter2 lider`.
- `pdf_muestra.cjs`: arma un PDF inventado con lo que tiene que saber dibujar el lector de PDF (máscaras, JPEG 2000, fax, PostScript, CMYK). Lo usa `t98`.
- `datos/`: lo que usa la nube simulada. Es todo público: el flyer de prueba, su calibración, el catálogo y la geografía de promociones de Galicia, un logo y `muestra.jp2`, la imagen de `pdf_muestra.cjs`.
- `capturas/`: las capturas que sacan las pruebas. **No se versiona** (está en `.gitignore`).

## Ojo

- Los logos de las promociones se bajan de galicia.ar: sin internet, algunas pruebas de logos fallan.
- `correr.mjs` arranca cada prueba en una fecha fija (`HOY_DE_PRUEBA`), en el navegador y en Node, porque `datos/cat.json` es una foto y sus promos vencen. Si se renueva el catálogo, hay que mover esa fecha a un día en que las promos estén vigentes. Las pruebas `u…` y la demo usan la fecha real.
- Una prueba nueva va acá con el mismo formato: exporta `async (browser) => { … }` y usa `require('./nube.cjs')`.
