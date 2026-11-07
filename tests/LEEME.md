# Pruebas automáticas

Son las pruebas que se corren antes de cada cambio para no romper lo que ya anda. **Ninguna toca el Supabase real:** es producción, y con credenciales reales la app escribe datos reales y puede mandar mails. Todo pasa contra una nube simulada, con personas y empresas inventadas, porque el repo es público.

## Cómo correrlas

Las de navegador abren lo que quedó en la raíz, bajo la misma ruta que GitHub Pages (`/flyer-galicia/`), así que primero hay que armar:

```bash
npm run release
```

Todas las de navegador de la app:

```bash
npx playwright test --project=app
```

Sólo una carpeta o un archivo:

```bash
npx playwright test --project=app logo-strip/build-strip
```

Ese proyecto también trae lo que vigila el armado: `build/build-output` (lo que dejó `dist/`), `build/release-output` (que la raíz sea exactamente `dist/`, sin archivos de un armado anterior; si falla, falta correr `npm run release`), `build/smoke` y `build/weight-budget`, que compara el peso de la primera carga con la referencia.

Las que no usan navegador y las de componentes, con su coverage:

```bash
npm test
```

Todos los chequeos juntos, los mismos de `ci.yml`. Arma la app y Storybook antes de las pruebas, así que deja la raíz al día; en `ci.yml`, además, falla si la raíz del commit no es la del armado:

```bash
npm run ci
```

Lo común de la app (`shared`) contra lo que se guardó de la versión anterior en `tests/fixtures/design-system/reference-look.json` (se grabó una sola vez, antes de borrarla, y no se puede volver a grabar). Necesita Storybook armado:

```bash
npm run storybook:build
```

```bash
npx playwright test --project=design-system
```

El motor del flyer contra el flyer impreso de referencia. También necesita Storybook armado:

```bash
npx playwright test --project=flyer-engine
```

La primera vez hay que instalar el navegador con `npx playwright install chromium`.

## Qué hay acá

| Carpeta                              | Qué tiene                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/specs/`                         | Las pruebas de navegador, por dominio. Dicen qué hace el usuario y qué tiene que ver                                                      |
| `e2e/support/driver/`                | Cómo se hace cada cosa, con métodos nombrados por intención: la interfaz de cada dominio, y en `react/` cómo se hace en la app            |
| `e2e/specs/design-system/`           | `shared` contra lo que se guardó de la versión anterior: tokens, componentes, capturas, red y letra mínima. Se explica en el plan         |
| `e2e/support/design-system/`         | Qué story tiene que igualar a qué parte de la app (`cases.ts`), cómo se mide y cómo se lee lo guardado (`reference-look.ts`)              |
| `e2e/specs/flyer-engine/`            | `shared/flyer-engine` contra `fixtures/golden/`: los mismos píxeles y el mismo PDF, sin tolerancia                                        |
| `e2e/support/flyer-engine/`          | Abre la story del motor y baja lo que sale. Trae las entradas grabadas de cada caso (`golden-inputs.json`)                                |
| `e2e/support/cloud/`                 | La nube simulada: tablas, bucket, funciones y reglas. Se crea una por prueba                                                              |
| `unit/`                              | Lógica suelta, sin navegador (las de cada pantalla viven al lado de su código, en `web/src`)                                              |
| `fixtures/data/`, `fixtures/logos/`  | Lo que sirve la nube simulada: flyer, catálogo de promociones, geografía y logos                                                          |
| `fixtures/visual/`                   | Capturas de referencia, tomadas de la versión anterior                                                                                    |
| `fixtures/golden/`                   | PNG y resumen de los PDF de referencia del flyer impreso                                                                                  |
| `fixtures/design-system/`            | Lo que el proyecto `design-system` leía de la versión anterior abierta: valores de los tokens, de cada componente y dónde estaba cada uno |
| `fixtures/network-contract.json`     | Todo lo que la app le pide a la nube: tablas, funciones y acciones                                                                        |
| `fixtures/performance-baseline.json` | Peso y tiempos de la versión anterior: lo que la app no puede superar                                                                     |

Los números viejos (`t79`, `u05`) que aparecen en `CLAUDE.md` se encuentran buscándolos: la primera línea de cada prueba nombra el archivo que reemplaza, y los archivos viejos siguen en la historia de git.

## Cómo escribir una prueba

El ejemplo a copiar es `e2e/specs/logo-editor/replace-logo.spec.ts`.

- La spec no conoce `id` ni `page.evaluate`: `npm run lint:policy` lo controla. Así, la spec sigue valiendo aunque cambie cómo está hecha una pantalla.
- Lo que no se puede expresar con texto visible o roles va por el driver del dominio.
- Se usa `expect.soft`, para ver todo lo que falla y no sólo lo primero.
- Toda funcionalidad nueva suma su prueba.
- Lo que una persona no puede hacer desde la pantalla no se prueba con una spec: va en una prueba de componente, al lado del código.
- Una prueba vale si falla cuando se rompe lo que protege. Antes de darla por buena, rompé esa regla en `web/`, corré `npm run release` y mirá que falle; al deshacerlo, volvé a correr `npm run release`. También se puede romper una copia de la raíz y servirla con `FLYER_STATIC_ROOT=<copia>`.

## Referencias

Se actualizan **sólo a propósito**, y hay que mirar la diferencia antes de aceptarla.

| Qué                      | Cómo se actualiza                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Capturas y flyer impreso | `npx playwright test --project=app --grep "@visual\|@golden" --update-snapshots`                                                           |
| Contrato de red          | `npm run contract:record`. Corre toda la suite y reemplaza el archivo entero: nunca con un filtro, porque quedaría sólo lo de esas pruebas |
| Peso y tiempos           | `npm run perf:baseline`, después de `npm run release`                                                                                      |
| `fixtures/design-system` | No se puede: se grabó de la versión anterior abierta, que ya no existe. Un caso nuevo de `cases.ts` se compara de otra forma               |

Las capturas, el flyer impreso, el contrato de red y el peso se tomaron de la versión anterior, y la app los cumple. Regrabarlos los pasa a ser de la app: hacelo sólo cuando un cambio de pantalla, de pedidos o de peso sea a propósito. Las tres capturas de Config → Flyer (`admin-flyer-config--*`) ya son de la app: se regrabaron el 6-nov-2026, al sacar de esa pantalla una frase que nombraba un archivo de la versión anterior.

Límites de las capturas:

- Toleran hasta 0,1 % de píxeles distintos, porque las letras cambian un poco de una corrida a otra. Un cambio de pocas letras puede pasar: eso lo cuidan las pruebas de funcionamiento. El flyer impreso se compara píxel por píxel, sin tolerancia.
- Muestran lo que entra en la ventana, más una imagen del contenido en las pantallas que abren con filtros arriba.
- Valen sólo para macOS, y por eso no corren en CI. En otro sistema hay que generarlas ahí.
- No dependen de que haya un mouse conectado. Con un mouse, macOS le da al navegador barras de desplazamiento clásicas, que mueven lo que se ve (un flyer centrado, el ancho de un desplegable) aunque Playwright las esconda. Por eso el navegador de las pruebas arranca siempre con las superpuestas: `support/browser/overlay-scrollbars.ts`. Lo vigila `visual/overlay-scrollbars.spec.ts`.
- El proyecto `design-system` compara recortes de esas mismas capturas. Si cambia una captura a propósito, revisá que el recorte que usa siga siendo el mismo componente.

## El motor del flyer contra la referencia

`e2e/specs/flyer-engine/` abre la story `EngineHarness` y baja el PNG y el PDF con la API pública del motor, sin formulario ni nube. Lee `fixtures/golden/`, nunca las escribe. Lo que depende de la plataforma lleva `@golden` y no corre en CI.

`e2e/support/flyer-engine/golden-inputs.json` son los datos de cada caso, tal como los tenía la versión anterior en el momento de descargar. No hay nada personal: son personas y empresas inventadas. Las direcciones son de un dominio `.invalid`, y sólo contestan los archivos de `fixtures/`. Si cambia un caso de `golden/flyer-output.spec.ts` o la calibración de `fixtures/data/`, hay que ajustar a mano los datos del caso para que el motor siga dando diferencia 0 con la referencia, o regrabar la referencia con la app (ver la tabla de arriba) mirando la diferencia.

## Casos especiales

- Toda prueba de navegador falla si la app pide algo que no está en `fixtures/network-contract.json`: lo controla `support/test.ts` (menos al regrabar el contrato).
- `pdf-bands` compara PDF de verdad, que no se versionan. Se saltea si no se indican: `FG_PDFS="a.pdf;b.pdf"`.
- `tests/unit/benchmark/normalize.test.ts` consulta MODO en vivo sólo con `FLYER_LIVE_TESTS=1`, porque depende de internet y de lo que publique MODO ese día.
- Cada prueba arranca en una fecha fija (`FIXED_NOW`, en `e2e/support/clock.ts`) porque el catálogo de `fixtures/data` es una foto y sus promos vencen. Si se renueva el catálogo, hay que mover esa fecha.

## Demo de Gestiones

No es una prueba: sirve para probar a mano. Abre ventanas visibles de Oficial, Hunter y Líder sobre la misma nube simulada, con la app que quedó en la raíz (`npm run release` antes). Lo que hace una persona le llega a la otra cuando la app lo vuelve a leer (cada 90 segundos, o cambiando de solapa):

```bash
npm run demo:commercial-actions
```

También se pueden elegir personas, con `npm run demo:commercial-actions -- oficial hunter2`, y comprobar que abre sin ventanas con `npm run demo:commercial-actions -- --check`.
