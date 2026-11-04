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

**Por qué TanStack Query y no sólo Context:** hoy `auth.js` y `gestiones.js` resuelven a mano cachés, cargas compartidas y turnos contra respuestas tardías (`_padCargando`, `_fgProtoTurno`, `GES.ag`, `_EST.hiloT`). Con Context habría que volver a escribir todo eso. TanStack Query ya lo trae, y su `isError` cumple la regla “una falla de red no es un resultado vacío” (invariante 24). Va sin refetch al volver a la pestaña y sin reintentos automáticos en las mutaciones.

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
| `_build.mjs` mezcla armado y validación | Comandos separados: `lint`, `typecheck`, `test`, `build`. Los chequeos viejos siguen sólo hasta el corte |
| No hay CI, y sin `push` GitHub Actions no corre | `npm run ci` es la fuente de verdad. `ci.yml` llama a ese script, con permisos de lectura y sin deploy |
| No hay lint ni formateador | oxlint y oxfmt, con lo generado y el código viejo excluidos |
| El hook de commits había que activarlo a mano, y en este clon no corría | lefthook se instala solo con `npm install` |
| README y `CLAUDE.md` pedían commits en español | Regla nueva: en inglés |
| `.nvmrc` y la terminal no coincidían | `devEngines` rechaza otra versión de Node |
| Playwright sin versión fija y buscado en la caché de npx | Fijado en `package.json` |
| No estaba definido dónde vive la configuración | Un solo `package.json` y `vite.config.ts` en la raíz, con la app en `web/` |
| La raíz sirve a Pages y sería también el proyecto | `index.html` de la raíz sigue siendo el viejo hasta el corte |

### Etapas siguientes

| # | Etapa | Termina cuando |
|---|---|---|
| 1 | Referencia de la versión actual (capturas, PDF/PNG, contrato de red, peso) y las 87 pruebas viejas en TS, contra las dos versiones | Todas pasan contra la versión actual |
| 2 | `shared`: tokens, `ui`, Supabase, sesión | Storybook coincide con las capturas y el contrato de red pasa |
| 3 | `flyer-engine` en TS, partido hasta cumplir la complejidad | PDF y PNG idénticos a la referencia |
| 4 | Slices, en orden: `auth` y shell, `promotions`, `company-registry`, `logo-editor`, `flyer-editor`, `hunter`, `studio`, `commercial-actions`, `benchmark`, `admin`, `search` y `tour` | Cada slice pasa lint, complejidad, coverage y sus pruebas antes de seguir |
| 5 | Corte local con `npm run release`, que copia `dist/` a la raíz | Todo en verde y paridad con la referencia |
| 6 | Limpieza del código viejo y documentación | Sin rastros del código viejo |

## Etapa 2: cómo se compara `shared` con la referencia

`shared` no arma pantallas enteras, así que las capturas de `tests/fixtures/visual/` no se pueden comparar de una contra una story. Se compara por partes, con el proyecto `design-system` de Playwright, en `tests/e2e/specs/design-system/`. Lo que cada story tiene que igualar está en una lista: `tests/e2e/support/design-system/cases.ts`.

| Qué se compara | Contra qué | Cómo | Dónde corre |
|---|---|---|---|
| Los tokens | La app actual abierta | El valor de cada variable, en las 4 paletas, en claro y en oscuro. Una variable de la app que falte acá hace fallar la prueba | `tokens.spec.ts`, también en CI |
| Lo que cada componente termina mostrando | El mismo elemento en la app actual abierta | 31 propiedades calculadas (colores, bordes, letra, espacios, sombras), en reposo y en los estados que se pueden tocar. En un celular, sólo en reposo | `component-look.spec.ts`, también en CI |
| Los estados que ninguna captura muestra | El mismo HTML agregado a la app actual, para leer sus reglas | Igual que el anterior, sin imagen | `component-look.spec.ts` |
| La imagen | Un recorte de la captura de referencia | Se abre la story con la misma ventana y el mismo tema, se la pone en el lugar que tiene en la app y sobre el mismo fondo, y se comparan los dos recortes píxel por píxel. También tiene que dar el mismo alto y, donde corresponde, el mismo ancho | `reference-images.spec.ts`, sólo macOS (`@visual`) |
| La red | `tests/fixtures/network-contract.json` | Las 161 entradas pasan por la API pública de `shared`, contra la nube simulada, y lo que la nube anotó tiene que ser exactamente el contrato. La lista de lo que no se puede repetir está vacía, y una prueba lo controla | `network-contract.spec.ts`, también en CI |
| La letra mínima | Las reglas de `CLAUDE.md` | Todas las stories, en claro y en oscuro: nada por debajo de 12 px, salvo mayúsculas y números de contador (11 px) | `story-rules.spec.ts` y `tests/unit/design-system/css-rules.test.ts` |

La misma tolerancia de las capturas: el umbral por píxel por defecto y 0,1 % de píxeles distintos. En un botón chico eso no llega a un borde de letra, así que siempre se permiten 12 píxeles (con la máquina ocupada apareció una diferencia de 8; correr un badge un píxel cambia más de 100). Las lupas, los flyers y lo que pertenece a una pantalla se tapan en los dos recortes (`mask`), y lo mismo las esquinas de una ventana, porque muestran lo que tiene detrás.

**Lo que esta etapa NO compara**, porque todavía no existe:

- **Pantallas enteras.** Vuelven a compararse contra las capturas completas en la etapa 4, con el proyecto `react`, cuando cada slice las arme. El encabezado de la app y el login partido son de `auth` y shell: en `shared` sólo están sus piezas.
- **Sólo con valores calculados, sin imagen**, porque no aparecen en ninguna captura: `ConfirmDialog`, `Toast`, `Spinner`, `Skeleton`, `EmptyState`, `Notice`, `ProgressBar`, `Textarea`, el campo marcado con error y los botones `secondary`, `green`, `soft-ok` y `soft-muted`. También los estados al pasar el mouse y con foco.
- **Sólo con una prueba de uso, sin referencia:** tamaños sin equivalente exacto en la app (el `Button` `dialog` de una ventana) y `Modal` en tamaños `narrow` y `regular`.

Todo el proyecto desaparece con la versión actual, en la etapa 6: compara contra ella.

### Decisiones de la etapa

- **Tokens** en `web/src/shared/ui/tokens/`. Conservan los nombres de la app actual, salvo `--azul` (`--blue`) y los alias viejos `--dark`, `--light` y `--red` (`--ink`, `--paper`, `--accent`). Los colores fijos que tenían los componentes pasaron a tokens, y las reglas de `html.dark` también: un módulo CSS no tiene colores ni tamaños de letra propios (lo controla `css-rules.test.ts`). Las paletas siguen siendo las clases `t-*` y `dark` en `<html>`, con las claves `fg_theme` y `fg_palette`.
- **`shared/ui`:** `Button`, `Field` (con `Input`, `Select` y `Textarea`), `Checkbox`, `Switch`, `Tabs`, `Card`, `StatCard`, `Badge`, `Avatar`, `ListRow`, `Modal`, `ConfirmDialog`, `Menu`, `DataTable`, `Toast`, `Spinner`, `Skeleton`, `EmptyState`, `Notice`, `ProgressBar`, `SectionLabel`, `Icon`, `PalettePicker` y `ThemeProvider`. En los compuestos, las partes van en `X.parts.tsx` y el objeto armado en `X.ts`. Quedan para sus slices las piezas de una sola pantalla: `cfg-btn`, la barra de zoom, la barra fija de abajo y el encabezado.
- **Rarezas de la app actual que se conservan** porque el aspecto no cambia: en oscuro, un campo con foco no cambia de borde; las tarjetas del panel admin tienen otra superficie (`--raised`) que las del armador (`--card`); en el celular el `Input` mediano va a 16 px y el `Input` grande y el `Select` no.
- **Tipos de la base:** `npm run db:types` los genera de `supabase/migrations/`, sin red. La base de `profiles` y `flyer_logs` no tiene `create table` en ninguna migración: están declaradas a mano en el generador, y una prueba controla que esa lista no crezca.

## Pruebas y coverage

**Coverage funcional:** se prueba el comportamiento por la API pública de cada componente (estados, interacciones y composiciones), en Vitest Browser Mode con Chromium. La lógica pura corre en Node. Las pruebas de navegador con Playwright cubren los flujos completos.

Umbrales por archivo. Un componente sin prueba hace fallar `npm test`:

| Zona | Funciones | Líneas | Ramas |
|---|---:|---:|---:|
| `shared/ui`, `shared/domain`, `shared/flyer-engine` | 100 % | 90 % | 85 % |
| El resto de `web/src` | 90 % | 85 % | 80 % |

## Complejidad del código actual

Las funciones **no** se pueden portar tal cual. El método es portar, fijar el comportamiento con pruebas y partir hasta cumplir el límite.

Medido con oxlint al planificar: 118 funciones del frontend superan 15 (`auth.js` 93, `gestiones.js` 16, `benchmark.js` 9); 23 de `auth.js` superan 30 y la peor llega a 65. Las Edge Functions quedan fuera de la regla porque el backend no se toca: 30 funciones la superan y quedan como deuda.

## Errores de la versión actual que encontraron las pruebas

Los seis que había se corrigieron en la versión actual el 4-nov-2026, cada uno con su prueba, y React tiene que conservar ese comportamiento corregido: pegar desde Excel distingue una falla de una empresa que no está, el número del botón Admin baja al eliminar, "Tu empresa" en lugar de "Empresa de Vos", "Limpiar filtros" aparece con cualquier filtro, "Para contactar" se cierra al elegir una persona, "Limpiar" del Masivo espera mientras bajan las librerías y Benchmark no ensancha la página en el celular. Queda sin tocar lo que sigue: al pasar esa pantalla a React hay que decidir con el dueño si se conserva o se corrige. Las pruebas no fijan estos comportamientos.

- **Reglas que decía un chequeo del armado y la app no cumple:** sin rubro no siempre va la Opción 1 (elige el flyer general vigente con imagen), los vacíos van al final sólo en orden ascendente, "Guardar el actual" usa una ventana del navegador y la lupa no es sólo del admin (depende de la facultad `padron_buscar`).

## Límites conocidos

- `ci.yml` no se puede ejecutar de verdad sin `push`: está validado sólo a través de `npm run ci`.
- Las capturas de referencia toleran 0,1 % de píxeles distintos (un cambio de pocas letras puede pasar), muestran lo que entra en la ventana más 15 imágenes de contenido, esconden el flyer de fondo en las 8 pantallas que lo tapan, y sólo valen para macOS. El flyer impreso se compara píxel por píxel. Detalle en `tests/LEEME.md`.
- Las pruebas y sus drivers todavía leen código viejo en algunos puntos, que hay que resolver en React: `_vigSumarEstudio`, el cambio de `baseImg`, `necesitaRevision`, el catálogo en memoria y `search.nameFirstFlyer`.
- Los chequeos de `_build.mjs` se clasificaron uno por uno en `docs/CHEQUEOS_BUILD.md`. Cada método nuevo de los drivers necesita su versión en `driver/react/` cuando llegue su slice.
- En local no se comprueba la red del banco, las PC de sucursal ni Pages. La nube simulada imita RLS y Edge Functions, no las ejercita.
- El corte final llega a todos a la vez: si se publica, volver atrás es restaurar la versión anterior en `main`.
- **El contrato de red registra lo que recorren las pruebas, no todo lo que hace la app.** `auth.js` borra archivos del bucket (`storage.remove`) y sube `index_<hora>.html` y `_active*_img.*`, y nada de eso figura en el contrato: `shared/supabase` lo soporta igual, y tiene que volver a mirarse al pasar esas pantallas.
- postgrest-js repite solo una lectura sin respuesta durante unos 7 s, también en la versión actual: un corte de red tarda eso en verse como falla.
- dependency-cruiser todavía no soporta TypeScript 7. Lee el código con swc y muestra un aviso que se puede ignorar. Se comprobó con violaciones reales que detecta los cruces, también en `.tsx` y en imports de tipos.
