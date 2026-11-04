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

No se tocaron, porque la versión actual queda igual hasta el corte. Al pasar cada pantalla a React hay que decidir si se conservan o se corrigen, con el dueño. Las pruebas no fijan estos comportamientos, salvo donde se aclara.

- **Pegar desde Excel, en la agenda de Gestiones:** si falla la revisión de empresas, cada fila dice que la empresa no está en la base, en lugar de "No se pudo revisar". Va contra la regla de no confundir una falla de red con un resultado vacío.
- **Número del botón Admin:** al eliminar una cuenta pendiente no baja hasta recargar.
- **Agenda de Gestiones:** un oficial que elige su propia empresa ve "Empresa de Vos".
- **Lista de Gestiones:** "Limpiar filtros" no aparece después de elegir un filtro, y "Para contactar" queda abierta tapando la acción.
- **Masivo:** "Limpiar" mientras bajan las librerías puede dejar la tanda sin hacer nada (deducido del código, no reproducido).
- **Benchmark en un celular de 390 px:** "Resumen por rubro" ensancha la página y deja afuera las últimas solapas (no se probó en un teléfono real).
- **Reglas que decía un chequeo del armado y la app no cumple:** sin rubro no siempre va la Opción 1 (elige el flyer general vigente con imagen), los vacíos van al final sólo en orden ascendente, "Guardar el actual" usa una ventana del navegador y la lupa no es sólo del admin (depende de la facultad `padron_buscar`).

## Límites conocidos

- `ci.yml` no se puede ejecutar de verdad sin `push`: está validado sólo a través de `npm run ci`.
- Las capturas de referencia toleran 0,1 % de píxeles distintos (un cambio de pocas letras puede pasar), muestran lo que entra en la ventana más 15 imágenes de contenido, esconden el flyer de fondo en las 8 pantallas que lo tapan, y sólo valen para macOS. El flyer impreso se compara píxel por píxel. Detalle en `tests/LEEME.md`.
- Las pruebas y sus drivers todavía leen código viejo en algunos puntos, que hay que resolver en React: `_vigSumarEstudio`, el cambio de `baseImg`, `necesitaRevision`, el catálogo en memoria, `gesListaLimpiar` y `search.nameFirstFlyer`.
- Los chequeos de `_build.mjs` se clasificaron uno por uno en `docs/CHEQUEOS_BUILD.md`. Cada método nuevo de los drivers necesita su versión en `driver/react/` cuando llegue su slice.
- En local no se comprueba la red del banco, las PC de sucursal ni Pages. La nube simulada imita RLS y Edge Functions, no las ejercita.
- El corte final llega a todos a la vez: si se publica, volver atrás es restaurar la versión anterior en `main`.
- dependency-cruiser todavía no soporta TypeScript 7. Lee el código con swc y muestra un aviso que se puede ignorar. Se comprobó con violaciones reales que detecta los cruces, también en `.tsx` y en imports de tipos.
