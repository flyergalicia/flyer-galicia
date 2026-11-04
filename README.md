# Armador de flyers Galicia

Aplicación web de una sola pantalla para que asesores y oficiales de banco armen flyers de productos con sus datos (nombre, celular, mail, sucursal, empresa, montos de cashback) y los descarguen en PDF o PNG. Los datos se cargan a mano, se pegan desde un texto, se traen de un padrón de empresas o se cargan en masa desde un Excel.

También incluye inicio de sesión con perfiles, buscador de promociones vigentes, comparación de promociones entre bancos, gestiones comerciales con tablero y panel de administración.

No hay `package.json`, gestor de paquetes ni transpilación: el frontend es JavaScript plano y el armado es un único script de Node.

## Cómo está armada

| Componente | Lenguaje | Dónde |
|---|---|---|
| Plantilla y estilos | HTML y CSS | `_source.html`, `_newcss.txt` |
| Lógica principal del navegador: pantalla, sesión, motor del flyer, padrón, promociones | JavaScript | `auth.js` |
| Módulos que se bajan al abrir su solapa | JavaScript | `gestiones.js`, `benchmark.js` |
| Armado y chequeos de contrato | Node.js (ESM) | `_build.mjs` |
| Edge Functions | TypeScript (Deno) | `supabase/functions/auth-admin`, `promos-galicia`, `benchmark-sync` |
| Estructura de la base y reglas de acceso | SQL (Postgres) | `supabase/migrations/` |
| Envío de mails de aviso | Google Apps Script | `supabase/mail/apps-script.gs` |
| Pruebas automáticas | Node.js + Playwright | `pruebas/` |

La aplicación se publica como sitio estático en GitHub Pages y usa Supabase para la base de datos, el inicio de sesión, el almacenamiento y las Edge Functions.

La interfaz y el estado de pantalla van en el frontend. Las credenciales privilegiadas, las reglas de acceso a los datos y todo lo que no debe verse en el navegador van en `supabase/`.

## Requisitos

- [Node.js](https://nodejs.org/) 26, la LTS activa. La versión exacta está en `.nvmrc`; con [nvm](https://github.com/nvm-sh/nvm), `nvm install` la instala y `nvm use` la activa.
- Git.
- Para las pruebas con navegador: Playwright y Chromium, que se instalan una sola vez:

```bash
npx -y playwright@latest install chromium
```

## Primeros pasos

Desde la carpeta del proyecto, activá la validación de commits (se hace una vez por clon):

```bash
git config core.hooksPath .githooks
```

Armá la aplicación:

```bash
node _build.mjs
```

Para abrirla, servila por `http://localhost` con cualquier servidor estático. Por `file://` no funciona, porque la política de seguridad de la página no lo permite.

```bash
python3 -m http.server 8000
```

Después entrá a <http://localhost:8000/>.

La aplicación necesita una sesión real y **no hay un entorno de prueba aparte**: si iniciás sesión desde una copia local, trabajás sobre los datos reales. Para probar sin tocar nada, usá las pruebas automáticas, que corren contra una nube simulada.

## Armar

`node _build.mjs` se corre desde la raíz del proyecto. Genera los archivos de salida y ejecuta los chequeos de contrato: si alguno falla, no escribe `index.html`.

Después de editar `_source.html`, `_newcss.txt` o `auth.js` hay que volver a armar. Las pruebas se hacen sobre `index.html`, no sobre la plantilla.

## Probar

Corré todas las pruebas, después de armar:

```bash
node pruebas/correr.mjs
```

O sólo algunas, indicando el comienzo del nombre:

```bash
node pruebas/correr.mjs u06 t39
```

Con `--detalle` se ve todo lo que imprime cada prueba.

**En Mac hay que indicar el navegador** con la variable `CHROMIUM`, porque el ejecutor no busca en la carpeta donde Playwright lo instala en ese sistema:

```bash
CHROMIUM="$(find ~/Library/Caches/ms-playwright -type f -path '*/Contents/MacOS/Google Chrome for Testing' | sort | tail -n 1)" node pruebas/correr.mjs
```

Hay dos tipos de prueba: `t…_*.cjs` abren la aplicación en un navegador automático y `u…_*.mjs` prueban lógica suelta sin navegador. Toda funcionalidad nueva suma su prueba. Los detalles están en [`pruebas/LEEME.md`](pruebas/LEEME.md).

## Publicar

**Todo lo que llega a `main` se publica en producción**: GitHub Pages sirve el sitio desde esa rama y se actualiza solo. No subas nada a `main` sin la confirmación del dueño del producto.

1. Armá con `node _build.mjs`, corré las pruebas e incluí los archivos generados en el commit.
2. Si hay una migración nueva, aplicala antes de subir el cliente que la necesita. Se aplican a mano y en orden; hace falta el token de la API de gestión de Supabase en la variable `SB_TOKEN`:

   ```bash
   node supabase/_runsql.mjs supabase/migrations/<archivo>.sql
   ```

3. Si cambió una Edge Function, publicala aparte (también con `SB_TOKEN`). El nombre es el de su carpeta en `supabase/functions/`:

   ```bash
   node supabase/_deployfn.mjs deploy <función>
   ```

4. Subí el cliente con `git push origin main`.

Los secretos nunca van en el repositorio, que es público: se pasan por variables de entorno o se guardan en Supabase.

## Archivos que no se editan a mano

Los genera `node _build.mjs` y se pisan en cada armado:

| Archivo | Qué es |
|---|---|
| `index.html` | La página de producción. |
| `index_export.html` | La misma aplicación con `auth.js` incrustado, para usarla suelta. |
| `version.json` | Hash del armado, con el que la aplicación avisa que hay una versión nueva. |
| `flyer_default.jpg`, `favicon.jpg` | Imágenes extraídas de `_source.html`. |

## Convención de commits

Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/). El texto puede ir en español:

```text
<tipo>[(alcance)][!]: <descripción>

[cuerpo opcional]
```

- **Tipos:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **Alcance:** opcional, entre paréntesis.
- **`!`:** marca un cambio incompatible.
- **Cuerpo:** si lo hay, va separado de la primera línea por una línea en blanco.

Por ejemplo:

```text
feat(promos): agrega el filtro por provincia
fix: corrige el nombre del archivo descargado
refactor(padrón)!: renombra las columnas de topes
```

La validación está en el hook versionado [`.githooks/commit-msg`](.githooks/commit-msg), un script de Node sin dependencias. Se activa una vez por clon, con el comando de [Primeros pasos](#primeros-pasos). La configuración vale para todos los worktrees del clon; en una rama que todavía no tenga la carpeta `.githooks`, no se valida nada.

El hook deja pasar los mensajes que arma Git solo: merge, revert y los de `git commit --fixup` o `--squash`. Los commits anteriores a esta convención quedan como están. La prueba del hook es `pruebas/u06_commit_msg.mjs`.

## Más documentación

- [`CLAUDE.md`](CLAUDE.md): guía completa del proyecto, con decisiones tomadas, invariantes, servicios conectados y pendientes.
- [`supabase/INVENTARIO_RPC.md`](supabase/INVENTARIO_RPC.md): funciones que expone la base, a quién y qué valida cada una.
- [`pruebas/LEEME.md`](pruebas/LEEME.md): cómo funcionan las pruebas y la nube simulada.
