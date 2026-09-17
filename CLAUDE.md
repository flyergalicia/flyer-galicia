# CLAUDE.md

Esta guía orienta a Claude Code al trabajar en este repositorio.

## Qué es este proyecto

**Armador de flyers Galicia**: una app de una sola página (SPA) que un asesor/oficial de banco usa para armar flyers de productos con sus datos (nombre, celular, mail, legajo, sucursal, etc.), pegándolos desde texto copiado o cargándolos a mano. Incluye login, roles (asesor/admin) y guardado de datos en la nube.

No hay `package.json` ni gestor de paquetes: el único build tool es `_build.mjs`, corrido directo con Node (`node _build.mjs`).

## Arquitectura: Frontend vs Backend

### Frontend (cliente, todo corre en el navegador)

- **`_source.html`** — plantilla fuente editable del HTML/CSS/estructura de la app. **Este es el archivo que se edita**, nunca `index.html` directamente.
- **`_newcss.txt`** — bloque de overrides de CSS que el build inyecta sobre `_source.html`.
- **`auth.js`** — toda la lógica de cliente: estado de la UI, llamadas a Supabase (auth, storage, tablas), armado del flyer, tema claro/oscuro, parseo de texto pegado (mail, celular, legajo, datos del oficial), etc. Es JS plano (sin build/transpile), pensado para correr tal cual en el navegador.
- **`_build.mjs`** — script Node que genera los artefactos de salida a partir de las fuentes de arriba:
  - `index.html` → producción, referencia `auth.js` como `<script src>` externo con cache-busting por hash (`auth.js?v=<hash>`). Este es el que sirve GitHub Pages.
  - `index_export.html` → misma app pero con `auth.js` **inlineado** en el HTML, para que funcione standalone desde cualquier dominio/archivo local. Conserva la imagen del flyer de ejemplo incrustada (sirve para subirlo como flyer).
  - `flyer_default.jpg` → la imagen de ejemplo del template, sacada de `index.html` (pesaba 1,75 MB dentro del HTML); la app la carga solo si no hay flyer activo.
  - `version.json` → hash del build; la app lo compara con `<meta name="build-v">` y avisa "hay versión nueva" (GitHub Pages cachea `index.html` 10 min). Sin guion bajo a propósito: GitHub Pages no sirve archivos `_*`.
  - Las librerías de exportación (jsPDF, xlsx, JSZip, ExcelJS) no van en el `<head>`: el build deja URL + hash SRI en `<meta name="fg-libs">` y `auth.js` las carga bajo demanda (`_lib`/`_libWrap`). Si se agrega una función que use alguna, envolverla en `_libInit`.
- Nunca editar `index.html` / `index_export.html` / `version.json` / `flyer_default.jpg` a mano: son generados. Cualquier cambio va en `_source.html`, `_newcss.txt` o `auth.js`, y después se corre el build.

### Backend (Supabase)

- **`supabase/functions/auth-admin/index.ts`** — Edge Function (Deno) que concentra las operaciones privilegiadas (usa la `service_role` key del lado servidor). El cliente nunca tiene esa key; le pega a esta función vía `FN_URL` con el JWT de sesión en el header `Authorization`.
- **`supabase/migrations/001_secure_rls.sql`** — políticas de Row Level Security de las tablas.
- **`supabase/_deployfn.mjs`** / **`supabase/_runsql.mjs`** — scripts helper para deployar la Edge Function y correr SQL contra la base, respectivamente.
- Storage: los flyers/assets públicos se sirven desde el bucket de Supabase Storage (`FLYERS_PUBLIC` en `auth.js`).

### Regla general de separación

- Todo lo que es **UI, estado de pantalla, parseo/formato de datos pegados, tema** → `auth.js` / `_source.html` (frontend).
- Todo lo que requiere **credenciales privilegiadas, políticas de acceso a datos o lógica que no debe exponerse en el cliente** → `supabase/functions/` o `supabase/migrations/` (backend).

## Workflow de deploy

1. Editar `_source.html`, `_newcss.txt` y/o `auth.js` (y `supabase/` si aplica).
2. `node _build.mjs` → regenera `index.html` e `index_export.html`.
3. Si se tocó `supabase/functions/auth-admin`, deployarla aparte (ver `supabase/_deployfn.mjs`).
4. `git add -A && git commit && git push origin main` → GitHub Pages del repo `flyergalicia/flyer-galicia` rebuildea solo.

Nota: el detalle de repos/hosting/credenciales vive en la memoria persistente del usuario (no se repite acá para no duplicar y desactualizar dos fuentes).

## Archivos que NO son parte del proyecto activo

- `_backup_20260606_003136/`, `_backup_flyerlogs_20260606_090955.json` — backups puntuales.
- `deploy.zip`, `deploy_new.zip` — artefactos viejos de deploy manual.
- `_authjs.txt` — snapshot viejo de `auth.js`, no se usa.

## Idioma

Responder siempre en español.
