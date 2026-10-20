# Pruebas automáticas del armador

Son las pruebas que se corren antes de cada subida para no romper lo que ya anda. Abren la app en un navegador automático (Playwright) con una **nube simulada**: no tocan Supabase de verdad ni necesitan usuario ni clave.

## Cómo correrlas

1. Armar la app: `node _build.mjs` (se prueba `index.html`).
2. Correrlas todas: `node pruebas/correr.mjs`
   - Sólo algunas: `node pruebas/correr.mjs t39 t41` (alcanza con el comienzo del nombre).
   - Para ver todo lo que imprime cada una: `--detalle`.
3. Al final dice cuántas pasaron. Si alguna falla, muestra qué comprobación falló.

La primera vez hace falta Playwright con su Chromium: `npx -y playwright@latest install chromium`. Si está en otro lado, se indica con las variables de entorno `PLAYWRIGHT` (carpeta del paquete) y `CHROMIUM` (el ejecutable).

## Qué hay acá

- `t…_*.cjs`: una prueba por tema (el nombre dice qué prueba). Cada una imprime `OK` o `FALLA` por comprobación.
- `u…_*.mjs`: pruebas sin navegador de lógica suelta (por ejemplo, la revisión diaria de marcas vigiladas de la Edge Function `promos-galicia`).
- `nube.cjs`: la nube simulada (bucket, tabla de Estudio, perfiles asesor y admin, Edge Functions). `nube_simple.cjs` es la versión de las primeras pruebas.
- `datos/`: lo que usa la nube simulada. Es todo público: el flyer de prueba, su calibración, el catálogo y la geografía de promociones de Galicia y un logo.
- `capturas/`: las capturas que sacan las pruebas. **No se versiona** (está en `.gitignore`).

## Ojo

- Los logos de las promociones se bajan de galicia.ar: sin internet, algunas pruebas de logos fallan.
- Algunas promos del catálogo de prueba se vencen con el tiempo; las pruebas eligen las vigentes, pero si un día todas vencen hay que renovar `datos/cat.json`.
- Una prueba nueva va acá con el mismo formato: exporta `async (browser) => { … }` y usa `require('./nube.cjs')`.
