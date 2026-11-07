# Armador de flyers Galicia

Aplicación web de una sola pantalla para que asesores y oficiales de banco armen flyers de productos con sus datos (nombre, celular, mail, sucursal, empresa, montos de cashback) y los descarguen en PDF o PNG. Los datos se cargan a mano, se pegan desde un texto, se traen de un padrón de empresas o se cargan en masa desde un Excel.

También incluye inicio de sesión con perfiles, buscador de promociones vigentes, comparación de promociones entre bancos, gestiones comerciales con tablero y panel de administración.

La app es React y TypeScript, y vive en `web/`. Reemplazó a una versión anterior que ya no está en el repo (cómo se hizo: [docs/PLAN_MIGRACION_REACT.md](docs/PLAN_MIGRACION_REACT.md); términos: [docs/GLOSARIO.md](docs/GLOSARIO.md)). Se trabaja en la rama `refactor/react`, y GitHub Pages sigue publicando la versión anterior hasta que el dueño apruebe subir esta.

## Cómo está armada

| Componente | Lenguaje | Dónde |
|---|---|---|
| La app: pantallas, sesión, motor del flyer, padrón, promociones, gestiones, benchmark | TypeScript y React | `web/src/` (`app/`, `shared/`, `slices/`) |
| Colores, letras y espacios (tokens) | CSS | `web/src/shared/ui/tokens/` |
| Armado | Vite y TypeScript | `vite.config.ts`, `scripts/` |
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

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app en <http://127.0.0.1:5173/> |
| `npm run build` | Genera `dist/` |
| `npm run release` | Arma la app y la copia a la raíz, que es lo que publica GitHub Pages. Si al armado le falta algo, no toca la raíz |
| `npm run preview` | Sirve `dist/` en <http://127.0.0.1:8766/> |
| `npm run storybook` | Abre el catálogo de componentes |
| `npm run ci` | Corre **todos** los chequeos: es lo que tiene que pasar antes de un commit |
| `npm run demo:commercial-actions` | Abre ventanas de Oficial, Hunter y Líder sobre la nube simulada, para probar Gestiones a mano (después de `npm run release`) |

`npm run dev` **no se conecta a ningún proyecto de Supabase** si no existe `web/.env.local` (hay un ejemplo en `web/.env.example`). Es a propósito: con credenciales reales, la copia local trabaja sobre los datos reales y puede disparar mails. Si hace falta, usá sólo cuentas de prueba.

Lo que deja `npm run release` en la raíz se puede abrir por `http://localhost` con cualquier servidor estático (por `file://` no funciona: la política de seguridad de la página no lo permite). Apunta al Supabase real, que es producción y **no tiene un entorno de prueba aparte**: mirá sólo la pantalla de entrada, sin iniciar sesión.

## Probar

Todos los chequeos y pruebas juntos (arma la app antes):

```bash
npm run ci
```

Sólo las de navegador, después de `npm run release`, o sólo algunas, indicando parte de la ruta:

```bash
npx playwright test --project=app
```

```bash
npx playwright test --project=app logo-strip/build-strip
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
- [`docs/CHEQUEOS_BUILD.md`](docs/CHEQUEOS_BUILD.md): qué prueba sostiene cada regla que vigilaba el armado de la versión anterior.
