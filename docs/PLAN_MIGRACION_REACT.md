# Plan de migración a React + TypeScript

Se migra el frontend a React y TypeScript **sin cambiar el aspecto de la app ni el backend**: Supabase no necesita migraciones ni deploys de Edge Functions por esta migración. La migración se hace de una sola vez, en local.

## Reglas de git

- Se trabaja **sólo en `refactor/react`**, que parte de `main` en `a88f5e8`.
- **Prohibido hacer `push` y prohibido commitear a `main`.** Vale también para subagentes y otras sesiones. Tampoco se usa `--no-verify`.
- Un commit local por etapa, o por slice dentro de la etapa de slices.
- Barreras: hooks de lefthook, `lefthook-local.yml` (sin versionar, sigue activo en ramas sin `lefthook.yml`) y la URL de `push` de `origin` anulada en la configuración local.

## Estándares

| Tema | Regla |
|---|---|
| Versiones | Node 26.13.0, Vite 8.3.4, React 19.3.1, TypeScript 7.0.2. Todo con versión exacta y `package-lock.json` |
| Lenguaje | Todo en TypeScript: app, pruebas, scripts y configuración. Excepciones: SQL, `mail/apps-script.gs` y los archivos de configuración que la herramienta sólo lee en otro formato |
| Idioma | Código, comentarios, nombres, pruebas y commits en inglés. **Documentación y textos que ve el usuario, en español** |
| Lint | oxlint con reglas que usan tipos y advertencias tratadas como error |
| Complejidad | Ciclomática máxima de 15, como error y sin excepciones |
| Formato | oxfmt |
| Límites entre carpetas | dependency-cruiser |
| Hooks | lefthook y commitlint con Conventional Commits |
| Coverage | Funcional, ver la sección de pruebas |

Lo que **no** se renombra aunque esté en español, porque es un contrato: tablas, RPC, acciones de Edge Functions, claves de JSON y de `localStorage`, y marcadores como `{importe}`. Se traducen sólo en los adaptadores. Los términos están en [GLOSARIO.md](GLOSARIO.md).

## Estructura: slices verticales

```text
web/src/
  app/        providers, shell, registro de vistas y permisos
  shared/     lo común, sin reglas de negocio de una sola pantalla
    ui/            sistema de diseño: tokens y componentes
    supabase/      cliente único, tipos, callEdge, bucketJson, paginación
    session/       sesión, perfil y facultades
    flyer-engine/  motor de dibujo, PDF/PNG y generación en tanda
    domain/        provincias, formatos y normalización de texto
    lib/           carga diferida, toasts y utilidades
  slices/
    auth/ flyer-editor/ logo-editor/ promotions/ company-registry/ hunter/
    studio/ commercial-actions/ benchmark/ admin/ search/ tour/
```

Cada slice tiene su pantalla, sus datos y su lógica: `index.ts` (lo único que se importa desde afuera), `api/`, `model/`, `ui/` y sus pruebas.

- Las dependencias van en un solo sentido: `app → slices → shared`. `shared` nunca importa un slice.
- Lo común sube a `shared` cuando lo usan dos o más slices y no tiene reglas de una sola pantalla.
- SOLID y compound components se aplican donde aportan: los compuestos, sólo cuando las partes comparten estado (Modal, Tabs, Menu, DataTable, Field).

## Manejo de estado

**No hace falta un gestor de estado global.** Se usa **Context API donde sea posible**. La única librería es TanStack Query, y es para datos del servidor, no para estado de pantalla.

Cada dato va en el primer nivel que le alcance:

| # | Nivel | Para qué | Ejemplo |
|---|---|---|---|
| 1 | `useState` | Estado de un solo componente | Un desplegable abierto |
| 2 | `useReducer` | Estado local con varias transiciones | Pasos de una ventana |
| 3 | Context dentro de un compuesto | Partes de un mismo componente | `Modal`, `Tabs` |
| 4 | Context de un slice | Estado que comparten varias pantallas del slice | Filtros de Promociones |
| 5 | Context de la app | Muy pocas cosas, que cambian poco | Sesión, facultades, tema, toasts |
| 6 | TanStack Query | Todo lo que viene de Supabase | Empresas, promociones, gestiones |
| 7 | Store propio distribuido por Context | Sólo el editor de flyers | Ver abajo |

**Por qué TanStack Query y no sólo Context:** la versión anterior resolvía a mano cachés, cargas compartidas y turnos contra respuestas tardías, pantalla por pantalla. Con Context habría que volver a escribir todo eso. TanStack Query ya lo trae, y su `isError` cumple la regla “una falla de red no es un resultado vacío” (invariante 24). Va sin refetch al volver a la pestaña y sin reintentos automáticos en las mutaciones.

**Reglas de Context:**
- Estado y acciones van en contextos separados, para que quien sólo dispara acciones no se vuelva a dibujar.
- Los valores van memoizados, y cada contexto se usa por un hook tipado que falla si no hay provider.
- Ningún contexto se comparte entre slices. Lo común pasa por `shared` o por `app`.
- Un dato que llega de Supabase no se copia a un Context: se lee de TanStack Query.

**La excepción: el editor de flyers.** Context vuelve a dibujar a todos sus consumidores en cada cambio, y el editor tiene eventos muy seguidos: arrastrar logos, zoom, cada tecla redibuja el canvas.
- El canvas y los arrastres quedan en un controlador imperativo conectado por `ref`, fuera del estado de React.
- Los valores del flyer viven en un store chico propio, **distribuido por Context** y leído con `useSyncExternalStore`, el mecanismo oficial de React. El canvas se suscribe a ese store sin pasar por un render.
- Deshacer y rehacer son un reducer con copias.

**Cuándo se reconsidera:** si al hacer `logo-editor` el store propio se complica o se miden renders de más. Recién ahí se evalúa Zustand, con la medición en la mano. No se instala por adelantado.

## Backend: cómo se adapta a Supabase

| Superficie | Adaptador | Qué no puede cambiar |
|---|---|---|
| Auth | `AuthGateway` con un solo listener | La clave `sb-<ref>-auth-token`, para no cerrar sesiones. Un error de red no cierra la sesión |
| Tablas | Repositorio por feature, con tipos generados | RLS como única autoridad y paginación de lecturas de más de 1000 filas |
| RPC | `rpc()` tipado | Parámetros exactos y errores como `GES_PISA` |
| Edge Functions | `callEdge` con unión de tipos por acción | La forma `{action,...}` y el corte a los 25 s |
| JSON del bucket | `bucketJson` que devuelve `Result` | Distinguir “no existe” de “sin red” |
| Datos guardados | Lectores tolerantes y versionados | Lo guardado sigue legible y no cambia de forma |

- Un solo cliente de Supabase.
- Las escrituras se hacen sólo en eventos del usuario, porque `StrictMode` ejecuta dos veces los efectos.
- **Probar en local no aísla de producción:** con credenciales reales, la app escribe datos reales y puede disparar mails. Por eso las pruebas usan la nube simulada y `npm run dev` no se conecta a nada sin `web/.env.local`.

## Roadmap

### Etapa 0: resolver ambigüedades de CI y lint, y configurar Vite

| Ambigüedad | Cómo queda |
|---|---|
| El script de armado anterior mezclaba armado y validación | Comandos separados: `lint`, `typecheck`, `test`, `build`. Sus chequeos siguieron hasta la etapa 6, y antes de borrarlos cada uno pasó a una prueba (`docs/CHEQUEOS_BUILD.md`) |
| No hay CI, y sin `push` GitHub Actions no corre | `npm run ci` es la fuente de verdad. `ci.yml` llama a ese script, con permisos de lectura y sin deploy |
| No hay lint ni formateador | oxlint y oxfmt, con lo generado y el código viejo excluidos |
| El hook de commits había que activarlo a mano, y en este clon no corría | lefthook se instala solo con `npm install` |
| README y `CLAUDE.md` pedían commits en español | Regla nueva: en inglés |
| `.nvmrc` y la terminal no coincidían | `devEngines` rechaza otra versión de Node |
| Playwright sin versión fija y buscado en la caché de npx | Fijado en `package.json` |
| No estaba definido dónde vive la configuración | Un solo `package.json` y `vite.config.ts` en la raíz, con la app en `web/` |
| La raíz sirve a Pages y sería también el proyecto | `index.html` de la raíz siguió siendo el anterior hasta el corte (etapa 5) |

### Etapas siguientes

| # | Etapa | Termina cuando |
|---|---|---|
| 1 | Referencia de la versión anterior (capturas, PDF/PNG, contrato de red, peso) y las 87 pruebas viejas en TS, contra las dos versiones. **Hecha** | Todas pasan contra la versión anterior |
| 2 | `shared`: tokens, `ui`, Supabase, sesión. **Hecha** | Storybook coincide con las capturas y el contrato de red pasa |
| 3 | `flyer-engine` en TS, partido hasta cumplir la complejidad. **Hecha**, ver abajo | PDF y PNG idénticos a la referencia |
| 4 | Slices, en orden: `auth` y shell, `promotions`, `company-registry`, `logo-editor`, `flyer-editor`, `hunter`, `studio`, `commercial-actions`, `benchmark`, `admin`, `search` y `tour`. **Hecha**, ver abajo | Cada slice pasa lint, complejidad, coverage y sus pruebas antes de seguir |
| 5 | Corte local con `npm run release`, que copia `dist/` a la raíz. **Hecha**, ver abajo | Todo en verde y paridad con la referencia |
| 6 | Limpieza del código viejo y documentación. **Hecha**, ver abajo | Sin rastros del código viejo |

## Etapa 2: cómo se compara `shared` con la referencia

`shared` no arma pantallas enteras, así que las capturas de `tests/fixtures/visual/` no se pueden comparar de una contra una story. Se compara por partes, con el proyecto `design-system` de Playwright, en `tests/e2e/specs/design-system/`. Lo que cada story tiene que igualar está en una lista: `tests/e2e/support/design-system/cases.ts`.

| Qué se compara | Contra qué | Cómo | Dónde corre |
|---|---|---|---|
| Los tokens | La versión anterior abierta (desde la etapa 6, lo que se guardó de ella) | El valor de cada variable, en las 4 paletas, en claro y en oscuro. Una variable de la app que falte acá hace fallar la prueba | `tokens.spec.ts`, también en CI |
| Lo que cada componente termina mostrando | El mismo elemento en la versión anterior abierta (ídem) | 31 propiedades calculadas (colores, bordes, letra, espacios, sombras), en reposo y en los estados que se pueden tocar. En un celular, sólo en reposo | `component-look.spec.ts`, también en CI |
| Los estados que ninguna captura muestra | El mismo HTML agregado a la versión anterior, para leer sus reglas (ídem) | Igual que el anterior, sin imagen | `component-look.spec.ts` |
| La imagen | Un recorte de la captura de referencia | Se abre la story con la misma ventana y el mismo tema, se la pone en el lugar que tiene en la app y sobre el mismo fondo, y se comparan los dos recortes píxel por píxel. También tiene que dar el mismo alto y, donde corresponde, el mismo ancho | `reference-images.spec.ts`, sólo macOS (`@visual`) |
| La red | `tests/fixtures/network-contract.json` | Las 161 entradas pasan por la API pública de `shared`, contra la nube simulada, y lo que la nube anotó tiene que ser exactamente el contrato. La lista de lo que no se puede repetir está vacía, y una prueba lo controla | `network-contract.spec.ts`, también en CI |
| La letra mínima | Las reglas de `CLAUDE.md` | Todas las stories, en claro y en oscuro: nada por debajo de 12 px, salvo mayúsculas y números de contador (11 px) | `story-rules.spec.ts` y `tests/unit/design-system/css-rules.test.ts` |

La misma tolerancia de las capturas: el umbral por píxel por defecto y 0,1 % de píxeles distintos. En un botón chico eso no llega a un borde de letra, así que siempre se permiten 12 píxeles (con la máquina ocupada apareció una diferencia de 8; correr un badge un píxel cambia más de 100). Las lupas, los flyers y lo que pertenece a una pantalla se tapan en los dos recortes (`mask`), y lo mismo las esquinas de una ventana, porque muestran lo que tiene detrás.

**Lo que esta etapa NO compara**, porque todavía no existe:

- **Pantallas enteras.** Vuelven a compararse contra las capturas completas en la etapa 4, con el proyecto `react`, cuando cada slice las arme. El encabezado de la app y el login partido son de `auth` y shell: en `shared` sólo están sus piezas.
- **Sólo con valores calculados, sin imagen**, porque no aparecen en ninguna captura: `ConfirmDialog`, `Toast`, `Spinner`, `Skeleton`, `EmptyState`, `Notice`, `ProgressBar`, `Textarea`, el campo marcado con error y los botones `secondary`, `green`, `soft-ok` y `soft-muted`. También los estados al pasar el mouse y con foco.
- **Sólo con una prueba de uso, sin referencia:** tamaños sin equivalente exacto en la app (el `Button` `dialog` de una ventana) y `Modal` en tamaños `narrow` y `regular`.

En la etapa 6, antes de borrar la versión anterior, todo lo que el proyecto leía de ella abierta (tokens, valores de cada componente y dónde estaba cada uno) se guardó una vez en `tests/fixtures/design-system/reference-look.json`. Desde entonces compara contra eso y no se puede volver a grabar.

### Decisiones de la etapa

- **Tokens** en `web/src/shared/ui/tokens/`. Conservan los nombres de la versión anterior, salvo `--azul` (`--blue`) y los alias viejos `--dark`, `--light` y `--red` (`--ink`, `--paper`, `--accent`). Los colores fijos que tenían los componentes pasaron a tokens, y las reglas de `html.dark` también: un módulo CSS no tiene colores ni tamaños de letra propios (lo controla `css-rules.test.ts`). Las paletas siguen siendo las clases `t-*` y `dark` en `<html>`, con las claves `fg_theme` y `fg_palette`.
- **`shared/ui`:** `Button`, `Field` (con `Input`, `Select` y `Textarea`), `Checkbox`, `Switch`, `Tabs`, `Card`, `StatCard`, `Badge`, `Avatar`, `ListRow`, `Modal`, `ConfirmDialog`, `Menu`, `DataTable`, `Toast`, `Spinner`, `Skeleton`, `EmptyState`, `Notice`, `ProgressBar`, `SectionLabel`, `Icon`, `PalettePicker` y `ThemeProvider`. En los compuestos, las partes van en `X.parts.tsx` y el objeto armado en `X.ts`. Quedan para sus slices las piezas de una sola pantalla: `cfg-btn`, la barra de zoom, la barra fija de abajo y el encabezado.
- **Rarezas de la versión anterior que se conservan** porque el aspecto no cambia: en oscuro, un campo con foco no cambia de borde; las tarjetas del panel admin tienen otra superficie (`--raised`) que las del armador (`--card`); en el celular el `Input` mediano va a 16 px y el `Input` grande y el `Select` no.
- **Tipos de la base:** `npm run db:types` los genera de `supabase/migrations/`, sin red. La base de `profiles` y `flyer_logs` no tiene `create table` en ninguna migración: están declaradas a mano en el generador, y una prueba controla que esa lista no crezca.

## Etapa 3: el motor del flyer

`web/src/shared/flyer-engine` dibuja el flyer y lo saca a PDF y PNG. Recibe datos y devuelve dibujo: no lee el formulario ni globales de la app. **El PDF y el PNG salen idénticos a la referencia**, píxel por píxel y sin tolerancia, en los 6 casos de `tests/fixtures/golden/` (`tests/e2e/specs/flyer-engine/`).

### Decisiones de la etapa

- **`FlyerScene`** junta la imagen con su calibración y es de sólo lectura. Sólo nace de `loadFlyerArtwork` (una imagen que cargó de verdad) o de `cropScene`, así que un flyer que no cargó no se puede dibujar sobre la imagen de otro (invariante 23), y la imagen y la calibración de un recorte no se pueden desfasar (invariante 22). Las variables globales de imagen, calibración y medidas de la versión anterior no tienen equivalente: el dibujo devuelve `{ extra, contentBottom }` y no deja nada guardado.
- **`cropScene`** baja antes las imágenes de las secciones insertadas y cuenta las que faltan (invariante 27). Los cortes se cuentan siempre desde el flyer entero.
- **`createFlyerPreview`**: `drawNow()` dibuja antes de volver (invariante 1) y `requestDraw()` junta los pedidos de un mismo cuadro. Usa el mismo dibujo que la descarga (invariante 16).
- **`flyerSlotReducer`** es la regla de "qué flyer está en pantalla": una opción sin imagen no toca la escena, y `downloadBlock` dice por qué no se puede bajar con un código (`loading`, `network`, `no-flyer`, `not-loaded`). Los textos los pone el slice.
- **`createLogoLibrary`** guarda los logos en memoria. Cómo se baja cada logo se le inyecta: `shared` no sabe de galicia.ar ni del bucket.
- **`generateBatch`** tiene lo que ninguna tanda puede saltear: no dibuja un grupo cuyo flyer no cargó, anota la fila que falla y sigue, no pisa nombres y sin nada generado no hay ZIP. Qué dice cada fila y las palabras de `Resumen.txt` llegan de afuera.
- **jsPDF 4.2.1 y JSZip 3.10.2** ahora son dependencias del proyecto, con `import()` diferido. Los resultados dicen si el archivo salió (invariante 24).
- **Las claves de lo guardado no se traducen:** `FlyerValues`, la calibración, los cambios de logos y los cortes siguen con sus nombres (`empresa`, `xc`, `recortes`).

### Rarezas que se conservan

Para dar los mismos píxeles: en la vista previa el suavizado alto de un logo queda prendido mientras el canvas no cambia de tamaño (la descarga no, porque guarda y restaura el contexto); un importe que falta se escribe como "undefined", igual que hoy; `cropCalibration` hace la copia por JSON.

Se sacaron dos `try/catch` que no podían saltar: al estirar la fila del hueco y al recortar un logo `orig:` de una imagen ya cargada.

### Lo que queda para los slices

| Slice | Qué |
|---|---|
| `flyer-editor` | El formulario, la escala y el zoom, la descarga y su candado, avisos, historial, `flyer_logs`, el aviso de rubro, las filas y textos del Masivo y Generar flyers (Resumen) |
| `logo-editor` | Detectar y editar logos (píxeles, renglones, colores, medir textos, achicar, logos blancos, leer archivos), franjas, marcas guardadas y la interacción de Recortar e Insertar (mejor unión, filas, huecos) |
| `admin` y `studio` | Calibrador, las plantillas del cuadro del beneficio salvo la de combustible (el motor la necesita como respaldo), pdf.js y pasar un PDF a imagen |

## Etapa 4: los slices

**Hecha** el 6-nov-2026, en commits locales de `refactor/react` (de `0676e82` a `13154ec`, más los arreglos `7fb1643`, `1044abd` y `49e2b22`). La app React tiene todas las pantallas de la versión anterior. Lo que todavía no está publicado es el corte (etapa 5).

### Cómo se comparó

- **Las mismas pruebas:** las specs de `tests/e2e/specs/` corren contra las dos versiones. Contra React corren todas menos 14, más `pdf-bands` (lista y motivo en `tests/LEEME.md`).
- **Las capturas** de `tests/fixtures/visual/` pasan contra React con la misma tolerancia.
- **El peso:** `build/weight-budget` pasa. La primera carga de React pesa unos 354 KB de JS gzip, contra 462 KB de la versión anterior. Cada pantalla baja aparte la primera vez que se abre.
- **Reglas rotas a propósito:** en cada slice se rompieron, una por una, las reglas importantes, y alguna prueba falló en cada caso. Si ninguna fallaba, se sumó la prueba.
- **El contrato de red:** toda prueba contra React falla si la app pide algo que no está en `network-contract.json`.

### Decisiones de la etapa

- **Los errores de la versión anterior se portaron como están.** Cada slice los anotó, y la lista va al dueño. Hay tres excepciones:
  - **Invariante 24.** Donde la versión anterior tomaba una falla de red por «vacío», React avisa con Reintentar y no deja guardar encima.
  - **Invariante 23.** Un flyer que no cargó no se dibuja ni se baja sobre otro.
  - **Invariante 7.** Lo que pasa de 1000 filas se lee por páginas.
- **Diferencias aceptadas**, porque las pide React o un slice anterior:
  - salir y cambiar de cuenta no recargan la página;
  - las ventanas atrapan el foco y se cierran con Escape;
  - lo que se toca con el mouse también se puede usar con el teclado, y se ve igual;
  - cada pantalla se baja la primera vez que se abre;
  - el panel del administrador pregunta antes de cerrarse con cambios sin guardar.
- **Lo común quedó en `shared`:**
  - componentes nuevos en `shared/ui`: `DecisionDialog`, `ProvinceSelect`, `ZoomControls`, `OptionBadge`, `ShortcutTip`, el logo y las marcas de lo que flota (`floating`); `Menu` se abre también desde afuera;
  - en `shared/lib`: el espacio de trabajo del flyer (`flyer-workspace`), las tandas de flyers, los lugares de cada pantalla (`places`, que usan el buscador y el tutorial), la configuración de la app (`app-config`, con `RenameableTitle`), la carga diferida de librerías y los gestos de zoom;
  - en `shared/domain`: las listas de solapas y vistas de cada pantalla, que el buscador necesita antes de que cada pantalla baje.
- **Drivers:** cada dominio tiene su versión en `driver/react/`, entera. Lo que una persona no puede hacer existe igual y falla diciendo por qué. `partialDriver` ya no existe.
- **Dependencias nuevas, con versión exacta:** `exceljs` (la misma librería que la versión anterior bajaba de cdnjs) y `pdfjs-dist` 6.5.438, que se sirve desde el propio sitio.

### Errores vivos en producción que encontró la etapa

React no los tiene, pero la versión publicada (la anterior, en `main`) sí, hasta que se publique React:

- La lista de empresas se corta en 1000 sin avisar (`loadPadron`).
- Un suplente sin facultades puede no ver «Base de datos».
- Facultades, Config → Flyer y Config → Opciones toman una falla de lectura por «lo de siempre», y se puede guardar encima:
  - «Guardar y activar» sin poder leer las calibraciones borra las de los demás flyers;
  - Facultades guarda la lista de siempre sobre la que había.
- El Hunter deja de ofrecer un flyer hasta recargar si falló una sola lectura.
- Gestiones: si la base falla, ofrece a todos los hunters como libres, y la agenda se ve sin ocupados.
- La barra de flyers y Config → Opciones borran `reemplaza`, `rubro` y `sinCB` de todas las opciones. **Este se portó como está**, porque cambiarlo es una decisión del dueño.

### Lo que esta etapa no comparó

- Un celular o una PC de sucursal de verdad: sólo el tamaño de pantalla y el toque simulado del navegador de las pruebas.
- Un PDF real de un flyer: el repo no trae ninguno, así que `pdf-bands` se saltea.
- Las Edge Functions y la RLS reales: todo corrió contra la nube simulada.
- Los Excel abiertos en Excel: se leyeron con ExcelJS.
- Pantallas sin captura de referencia (las ventanas de cada slice): se compararon con estilos calculados y a ojo, no píxel por píxel.

## Etapa 5: el corte

**Hecha** el 6-nov-2026, en commits locales de `refactor/react`. La raíz tiene la app React. **No se publicó nada**: `main` y `origin/main` siguen en `a88f5e8`, y GitHub Pages sigue sirviendo la versión vieja hasta que el dueño apruebe subir.

### Cómo se arma

- **`npm run release`** = `vite build` + `scripts/release.ts`. Antes de tocar la raíz comprueba que `dist/` tenga `index.html`, `version.json` y `assets/`, y que ningún archivo empiece con `_`, `.`, `#` o `~` (Pages no los publicaría). Si falta algo, no toca nada. Después borra `assets/` de la raíz entero (así no quedan archivos de un armado anterior), copia lo de `dist/` y, en la etapa 5, borraba el archivo con toda la app anterior.
- El armado es repetible: dos armados seguidos dan los mismos archivos, byte por byte.
- **La versión anterior dejó de armarse en la raíz:** hasta la etapa 6 se armaba aparte, en una carpeta sin versionar, sólo para las pruebas que comparaban contra ella.
- **`npm run ci`** hace el corte y corre todo. `ci.yml` además falla si después de eso `git status` no queda limpio: la raíz del commit tiene que ser la que se probó.

### Qué cambió en la raíz

| Archivo | Antes | Ahora |
|---|---|---|
| `index.html` | La app anterior, con su CSP y su script principal | La app React, con su CSP (sin `unsafe-inline`), el aviso de versión (`build-v`) y la conexión previa al backend |
| `assets/` | No existía | Todo el código, los estilos, las librerías (jsPDF, JSZip, ExcelJS, xlsx, pdf.js con su worker y sus WASM), cada uno con su hash en el nombre |
| `version.json` | El hash del armado viejo | El de React, con la misma forma (`{"v":"…"}`): una página vieja abierta ve otro número y ofrece recargar, y al recargar llega la nueva |
| `favicon.jpg` | Del armado viejo | El de `web/public/`, que es el mismo archivo |
| El archivo con toda la app adentro | La app anterior entera, en un HTML | **Ya no se publica** (ver abajo) |
| Los scripts, la librería de Excel y la imagen de ejemplo de la app anterior | Los usaba la página | Quedaron hasta la etapa 6, que los borró (la librería de Excel pasó a `web/`) |

**El archivo con toda la app no se mantiene.** Servía para abrir la app suelta (desde el disco o el bucket) y, en su momento, para subirla como flyer. React no puede ser un solo archivo sin sumar una herramienta y meter adentro todo lo que hoy baja aparte (varios MB), y dejar la vieja publicada habría mantenido una segunda versión de la app escribiendo en los mismos datos, con errores que React ya no tiene. Subir un HTML como flyer en Config → Flyer sigue andando con cualquier HTML que traiga la imagen (`baseImg.src="data:image…"`). La frase de esa pantalla que nombraba el archivo viejo se sacó en la etapa 6.

**CSP:** la de React pide menos que la vieja. Ya no permite `unsafe-inline` ni cdnjs ni jsDelivr, porque todo se sirve desde el sitio. Sigue permitiendo Supabase, `www.galicia.ar` (logos de promociones), Google Fonts, `blob:`/`data:` y `wasm-unsafe-eval` (pdf.js). Las pruebas corren con esa política puesta.

### Cómo se probó

Todo contra lo que quedó en la raíz, servido por `http://127.0.0.1` bajo `/flyer-galicia/`, como Pages: el servidor de las pruebas de React ahora es `scripts/serve-static.ts` sobre la raíz (con `FLYER_BASE_PATH`), ya no `vite preview` sobre `dist/`.

| Qué | Resultado |
|---|---|
| `npm run ci` completo | exit 0 |
| lint, complejidad, límites, tipos, formato | en verde |
| `npm test` | 360 archivos, 4548 pruebas pasan, 5 salteadas, sin bajar umbrales |
| Pruebas de navegador, los cuatro proyectos | 1455 pasan, 5 salteadas |
| … contra React (la raíz) | todas pasan, también las 85 capturas, los 6 casos del flyer impreso (PDF y PNG idénticos, sin tolerancia) y `weight-budget`. Salteada: `pdf-bands` (no hay PDF reales) |
| … contra la versión anterior | todas pasan; las 4 salteadas son las de siempre |
| `design-system` y `flyer-engine` | 76 y 7 pasan |
| Contrato de red | ninguna prueba contra React pidió algo fuera de `network-contract.json` |
| Referencias de `tests/fixtures/` | sin cambios |

La prueba nueva `build/release-output` controla que la raíz sea `dist/` byte por byte, que no quede ningún archivo de un armado anterior, y en la etapa 5 también que no estuviera el archivo con toda la app anterior y que siguieran los que necesitaba una página vieja (la etapa 6 sacó esas dos comprobaciones). Se rompió a propósito (un `version.json` cambiado y un archivo viejo en `assets/`) y falló. `scripts/release.test.ts` prueba el script.

También se abrió la raíz en el navegador de la app: la pantalla de entrada se ve bien, sin errores en la consola y sin ningún pedido a Supabase. No se ingresó: el armado apunta al Supabase real.

En la primera corrida falló una prueba de componentes de Estudio («the second press while it publishes does nothing»): esperaba un tiempo fijo de 600 ms y, con la máquina cargada, la primera publicación terminaba antes del segundo toque. Ahora la subida queda retenida hasta que la prueba ve el aviso (commit propio). En otra corrida, 54 archivos de prueba de componentes no llegaron a abrirse («SyntaxError» al importarlos) justo después de haber corrido un archivo suelto sin coverage; `npm test` entero pasó en las dos corridas siguientes. No se llegó a reproducir: si vuelve a pasar, sospechar de la caché de vitest compartida entre corridas con y sin coverage.

### Lo que no se pudo comprobar

- GitHub Pages de verdad (el corte no se subió) ni su paso de Jekyll: se imitó con la ruta `/flyer-galicia/` y la regla de los nombres con `_`.
- `ci.yml` en Linux: que el armado dé los mismos archivos en otro sistema y que el chequeo de `git status` quede limpio.
- El Supabase real, la red del banco, una PC de sucursal, un celular, un PDF real de un flyer y los Excel abiertos en Excel, como en la etapa 4.
- La transición de una página vieja abierta a la nueva con datos reales: se comprobó que `version.json` cambia y que los archivos que la vieja necesita siguen en la raíz, no el recorrido en producción.

### Para publicar (sólo con el OK del dueño)

1. Revisar las decisiones pendientes del informe de la etapa 4.
2. Subir un PDF real en Config → Flyer con la app React, contra el Supabase real, con una cuenta de prueba.
3. Llevar los commits a `main` y hacer `push`. Volver atrás es restaurar la versión anterior en `main` (la etiqueta `respaldo-antes-gestiones-v2` no sirve: es más vieja; conviene etiquetar `a88f5e8` antes).

## Etapa 6: sin la versión anterior

**Hecha** el 6-nov-2026, en commits locales de `refactor/react` (de `c25d579` a `e4c9f22`, más el de la documentación). Hoy nadie usa la app, así que no hizo falta ninguna transición (decisión del dueño): **la versión anterior ya no está en el repo**, vive sólo en la historia de git (el último commit que la tiene es `02a555d`). `main` y `origin/main` siguen en `a88f5e8`.

### Qué se borró

- La plantilla HTML, la hoja de estilos de texto, el script de armado con sus 247 chequeos, los tres scripts de la app (el principal, el de Gestiones y el de Benchmark) y la imagen de ejemplo.
- Lo que la armaba aparte para las pruebas: el script, la carpeta sin versionar, el comando, el proyecto de Playwright que corría contra ella y su driver entero.
- La idea de «dos versiones» en las pruebas: la opción `target`, la etiqueta que separaba las specs que valían para React y los `test.skip` de la versión anterior. Ahora hay un solo proyecto para la app, `app`.
- Las 14 specs que no corrían contra React, y los métodos de driver que sólo ellas usaban. Cada regla que protegían ya la cubría otra prueba (la lista estaba en `tests/LEEME.md`).
- Las tres pruebas unitarias de Gestiones que corrían el script viejo dentro de Node: cada caso quedó en una prueba del slice `commercial-actions` (se sumaron seis y se amplió una).
- Las excepciones de lint, formato, `.gitignore` y lefthook que existían sólo por esos archivos, y la regla de `lint:policy` contra sus variables globales.
- La carpeta local de capturas de las pruebas viejas.

### Qué se movió o cambió

- **La librería de Excel** (SheetJS 0.20.3, que React también usa) pasó de la raíz a `web/src/shared/lib/vendor/`, con su hash.
- **Config → Flyer** ya no nombra el archivo con toda la app anterior; las tres capturas de esa pantalla se regrabaron con la app (decisión del dueño).
- **`design-system`** ya no abre la versión anterior: lo que leía de ella (tokens en las 4 paletas y en claro y oscuro, los valores de cada componente en cada estado y dónde estaba cada uno) se guardó una vez en `tests/fixtures/design-system/reference-look.json`, antes de borrarla. No se puede volver a grabar.
- **`contract:record`, `perf:baseline` y la demo de Gestiones** corren contra la app que quedó en la raíz. La demo ya no adelanta los avisos: llegan cada 90 s, como para cualquiera.
- **`release`** ya no borra el archivo con toda la app ni exige que sigan los archivos de la versión anterior.
- Los comentarios que decían «la app actual» refiriéndose a la anterior ahora dicen «la app vieja».

### Las referencias

Las capturas (salvo las tres de Config → Flyer), el flyer impreso, `network-contract.json` y `performance-baseline.json` no cambiaron y la app las sigue cumpliendo. `performance-baseline.json` nombra el script principal de la versión anterior: es la foto de lo que bajaba ella y no se toca.

### Cómo se probó

| Qué | Resultado |
|---|---|
| `npm run ci` completo, sobre el código de `e4c9f22` | exit 0 |
| `npm test` | 357 archivos, 4420 pruebas pasan, 5 salteadas, sin bajar umbrales |
| Pruebas de navegador (`app`, `design-system`, `flyer-engine`) | 772 pasan, 1 salteada (`pdf-bands`, sin PDF reales) |
| `design-system` | 76 pasan, contra lo guardado. Se cambió un token a propósito y falló |
| La demo de Gestiones en modo chequeo | 3 de 3 ventanas en Gestiones, sin errores |
| `perf:baseline` | Corre contra React (355 KB de JS gzip); la referencia se devolvió a como estaba |
| La raíz en el navegador de la app | La pantalla de entrada se ve igual, sin errores en la consola y sin pedidos a Supabase. No se ingresó |
| Nombres viejos en el repo | Sólo en la historia de la sección 4 de `CLAUDE.md` y en `performance-baseline.json` |

Lo que no cambia: `pdfjs-dist/legacy/…` es el nombre de una carpeta del paquete de pdf.js, y las «legacy keys» del comentario de `auth-admin` se reescribieron como «la clave anterior de Supabase». **El primer commit de la etapa (`c25d579`) no pasa `npm run ci` solo**: movió la librería de Excel antes de borrar el armado viejo, que todavía la copiaba; `e4c9f22` deja todo en verde. No se reescribió la historia para arreglarlo.

## Pruebas y coverage

**Coverage funcional:** se prueba el comportamiento por la API pública de cada componente (estados, interacciones y composiciones), en Vitest Browser Mode con Chromium. La lógica pura corre en Node. Las pruebas de navegador con Playwright cubren los flujos completos.

Umbrales por archivo. Un componente sin prueba hace fallar `npm test`:

| Zona | Funciones | Líneas | Ramas |
|---|---:|---:|---:|
| `shared/ui`, `shared/domain`, `shared/flyer-engine` | 100 % | 90 % | 85 % |
| El resto de `web/src` | 90 % | 85 % | 80 % |

## Complejidad del código anterior

Las funciones **no** se pueden portar tal cual. El método es portar, fijar el comportamiento con pruebas y partir hasta cumplir el límite.

Medido con oxlint al planificar: 118 funciones del frontend anterior superaban 15 (93 en el script principal, 16 en el de Gestiones y 9 en el de Benchmark); 23 del principal superaban 30 y la peor llegaba a 65. Las Edge Functions quedan fuera de la regla porque el backend no se toca: 30 funciones la superan y quedan como deuda.

## Errores de la versión anterior que encontraron las pruebas

Los seis que había se corrigieron en la versión anterior el 4-nov-2026, cada uno con su prueba, y React tiene que conservar ese comportamiento corregido: pegar desde Excel distingue una falla de una empresa que no está, el número del botón Admin baja al eliminar, "Tu empresa" en lugar de "Empresa de Vos", "Limpiar filtros" aparece con cualquier filtro, "Para contactar" se cierra al elegir una persona, "Limpiar" del Masivo espera mientras bajan las librerías y Benchmark no ensancha la página en el celular. Queda sin tocar lo que sigue: al pasar esa pantalla a React hay que decidir con el dueño si se conserva o se corrige. Las pruebas no fijan estos comportamientos.

- **Reglas que decía un chequeo del armado y la app no cumple:** sin rubro no siempre va la Opción 1 (elige el flyer general vigente con imagen), los vacíos van al final sólo en orden ascendente, "Guardar el actual" usa una ventana del navegador y la lupa no es sólo del admin (depende de la facultad `padron_buscar`).

## Límites conocidos

- `ci.yml` no se puede ejecutar de verdad sin `push`: está validado sólo a través de `npm run ci`.
- Las capturas de referencia toleran 0,1 % de píxeles distintos (un cambio de pocas letras puede pasar), muestran lo que entra en la ventana más 15 imágenes de contenido, esconden el flyer de fondo en las 8 pantallas que lo tapan, y sólo valen para macOS. El flyer impreso se compara píxel por píxel. Detalle en `tests/LEEME.md`.
- Los drivers hacen lo que hace una persona. Los de la versión anterior leían su código por dentro en algunos puntos; las 14 specs que necesitaban eso se borraron en la etapa 6 y sus reglas quedaron en pruebas de componente.
- Los chequeos del armado anterior se clasificaron uno por uno en `docs/CHEQUEOS_BUILD.md`.
- En local no se comprueba la red del banco, las PC de sucursal ni Pages. La nube simulada imita RLS y Edge Functions, no las ejercita.
- El corte final llega a todos a la vez: si se publica, volver atrás es restaurar la versión anterior en `main`.
- **El contrato de red registra lo que recorren las pruebas, no todo lo que hace la app.** La app borra archivos del bucket (`storage.remove`) y sube `index_<hora>.html` y `_active*_img.*`, y nada de eso figura en el contrato: `shared/supabase` lo soporta igual. Al portar las pantallas aparecieron más pedidos que ninguna spec recorre, en ninguna de las dos versiones, y que sólo prueban las pruebas de componente: borrar un diseño, una propuesta o una combinación de Estudio, el «Ver» de una propuesta, borrar gestiones y prospectos, la lectura previa de Registrar gestión (la spec `other-screens` la contesta a mano), guardar el interruptor de Gestiones, borrar una cargada a mano de Benchmark, subir y borrar versiones de un flyer y escribir `_legal.json`. Hay que sumarlos cuando se regrabe el contrato.
- postgrest-js repite solo una lectura sin respuesta durante unos 7 s, también en la versión anterior: un corte de red tarda eso en verse como falla.
- dependency-cruiser todavía no soporta TypeScript 7. Lee el código con swc y muestra un aviso que se puede ignorar. Se comprobó con violaciones reales que detecta los cruces, también en `.tsx` y en imports de tipos.
