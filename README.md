# Armador de flyers Galicia

Aplicación web de una sola pantalla para que asesores y oficiales de banco armen flyers de productos con sus datos (nombre, celular, mail, sucursal, empresa, montos de cashback) y los descarguen en PDF o PNG. Los datos se cargan a mano, se pegan desde un texto, se traen de un padrón de empresas o se cargan en masa desde un Excel.

También incluye inicio de sesión con perfiles, buscador de promociones vigentes, comparación de promociones entre bancos, gestiones comerciales con tablero y panel de administración.

**Migración en curso:** el frontend se está pasando a React y TypeScript en la rama `refactor/react`, con la app nueva en `web/`. El corte ya está hecho en local (la raíz tiene la app React que arma `npm run release`), pero GitHub Pages sigue publicando la versión vieja hasta que se suba. El plan está en [docs/PLAN_MIGRACION_REACT.md](docs/PLAN_MIGRACION_REACT.md) y los términos en [docs/GLOSARIO.md](docs/GLOSARIO.md).

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
| Pruebas automáticas | TypeScript, Playwright y Vitest | `tests/` |

La aplicación se publica como sitio estático en GitHub Pages y usa Supabase para la base de datos, el inicio de sesión, el almacenamiento y las Edge Functions.

La interfaz y el estado de pantalla van en el frontend. Las credenciales privilegiadas, las reglas de acceso a los datos y todo lo que no debe verse en el navegador van en `supabase/`.

## Requisitos

- [Node.js](https://nodejs.org/) 26, la LTS activa. La versión exacta está en `.nvmrc`; con [nvm](https://github.com/nvm-sh/nvm), `nvm install` la instala y `nvm use` la activa.
- Git.

## Primeros pasos

Instalá las dependencias y el navegador de las pruebas (se hace una vez). `npm install` también activa los hooks de git:

```bash
nvm use
```

```bash
npm install
```

```bash
npx playwright install chromium
```

### App nueva (`web/`)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app en <http://127.0.0.1:5173/> |
| `npm run build` | Genera `dist/` |
| `npm run preview` | Sirve `dist/` en <http://127.0.0.1:8766/> |
| `npm run storybook` | Abre el catálogo de componentes |
| `npm run ci` | Corre **todos** los chequeos: es lo que tiene que pasar antes de un commit de etapa |

`npm run dev` **no se conecta a ningún proyecto de Supabase** si no existe `web/.env.local` (hay un ejemplo en `web/.env.example`). Es a propósito: con credenciales reales, la copia local trabaja sobre los datos reales y puede disparar mails. Si hace falta, usá sólo cuentas de prueba.

### App publicada

Armala:

```bash
npm run legacy:build
```

Para abrirla, servila por `http://localhost` con cualquier servidor estático. Por `file://` no funciona, porque la política de seguridad de la página no lo permite.

```bash
python3 -m http.server 8000
```

Después entrá a <http://localhost:8000/>.

La aplicación necesita una sesión real y **no hay un entorno de prueba aparte**: si iniciás sesión desde una copia local, trabajás sobre los datos reales.

## Armar

`npm run release` arma la app React (`web/`) y la copia a la raíz, que es lo que publica GitHub Pages. Si al armado le falta algo, no toca la raíz.

La versión vieja (`_source.html`, `_newcss.txt`, `auth.js`) sigue en el repo hasta la limpieza, pero ya no se publica: `npm run legacy:build` la arma en `legacy-site/`, sólo para las pruebas que comparan contra ella. No corras `node _build.mjs` en la raíz: pisaría el `index.html` de React.

## Probar

Todos los chequeos y pruebas juntos (hace el corte y arma la versión vieja antes):

```bash
npm run ci
```

Sólo las de navegador de la app React, después de `npm run release`, o sólo algunas, indicando parte de la ruta:

```bash
npx playwright test --project=react
```

```bash
npx playwright test --project=react logo-strip/build-strip
```

Las que no usan navegador y las de componentes se corren aparte:

```bash
npm test
```

Las de navegador usan una nube simulada y no tocan Supabase. Toda funcionalidad nueva suma su prueba. Los detalles están en [`tests/LEEME.md`](tests/LEEME.md).

## Publicar

**Todo lo que llega a `main` se publica en producción**: GitHub Pages sirve el sitio desde esa rama y se actualiza solo. No subas nada a `main` sin la confirmación del dueño del producto.

1. Armá con `npm run release`, corré `npm run ci` e incluí los archivos generados en el commit.
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

Los genera `npm run release` y se pisan en cada armado:

| Archivo | Qué es |
|---|---|
| `index.html` | La página de producción. |
| `assets/` | El código, los estilos y las librerías, con el contenido en el nombre de cada archivo. |
| `version.json` | Hash del armado, con el que la aplicación avisa que hay una versión nueva. |
| `favicon.jpg` | El ícono, copiado de `web/public/`. |

`index_export.html` (la versión vieja entera en un archivo) ya no se publica. `auth.js`, `gestiones.js`, `benchmark.js`, `libs/` y `flyer_default.jpg` quedan en la raíz hasta la limpieza, para una página vieja que el navegador tenga guardada.

## Convención de commits

Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) y **se escriben en inglés**:

```text
<type>[(scope)][!]: <description>

[optional body]
```

Por ejemplo:

```text
feat(promotions): add the province filter
fix: correct the downloaded file name
refactor(company-registry)!: rename the cap columns
```

El formato lo valida commitlint en el hook `commit-msg`. El idioma no se puede validar de forma automática: es una regla del proyecto.

## Hooks de git

Los maneja [lefthook](https://lefthook.dev/) (`lefthook.yml`) y se instalan solos con `npm install`.

| Hook | Qué hace |
|---|---|
| `pre-commit` | Frena si la rama es `main`; formatea, corre el lint y el typecheck |
| `commit-msg` | Valida el mensaje con commitlint |
| `pre-merge-commit` | Frena si la rama es `main` |
| `pre-push` | **Rechaza todo `push`** mientras dure la migración |

## Más documentación

- [`CLAUDE.md`](CLAUDE.md): guía completa del proyecto, con decisiones tomadas, invariantes, servicios conectados y pendientes.
- [`supabase/INVENTARIO_RPC.md`](supabase/INVENTARIO_RPC.md): funciones que expone la base, a quién y qué valida cada una.
- [`tests/LEEME.md`](tests/LEEME.md): cómo funcionan las pruebas, la nube simulada y las referencias.
- [`docs/CHEQUEOS_BUILD.md`](docs/CHEQUEOS_BUILD.md): dónde sigue cada chequeo de `_build.mjs` cuando desaparezca.
