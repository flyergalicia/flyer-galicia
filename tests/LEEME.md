# Pruebas automáticas

Son las pruebas que se corren antes de cada cambio para no romper lo que ya anda. **Ninguna toca el Supabase real:** es producción, y con credenciales reales la app escribe datos reales y puede mandar mails. Todo pasa contra una nube simulada, con personas y empresas inventadas, porque el repo es público.

## Cómo correrlas

Primero armá la app, porque las pruebas abren `index.html`:

```bash
node _build.mjs
```

Todas las de navegador contra la versión actual:

```bash
npx playwright test --project=legacy
```

Sólo una carpeta o un archivo:

```bash
npx playwright test --project=legacy logo-strip/build-strip
```

Las que no usan navegador y las de componentes, con su coverage:

```bash
npm test
```

Todos los chequeos juntos, los mismos de `ci.yml`:

```bash
npm run ci
```

Lo común de la app nueva (`shared`) contra la versión actual. Necesita Storybook armado:

```bash
npm run storybook:build
```

```bash
npx playwright test --project=design-system
```

El motor del flyer nuevo contra el flyer impreso de referencia. También necesita Storybook armado:

```bash
npx playwright test --project=flyer-engine
```

La primera vez hay que instalar el navegador con `npx playwright install chromium`.

## Qué hay acá

| Carpeta                              | Qué tiene                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/specs/`                         | Las pruebas de navegador, por dominio. Dicen qué hace el usuario y qué tiene que ver                                               |
| `e2e/support/driver/`                | Cómo se hace cada cosa, con métodos nombrados por intención. `legacy/` maneja la versión actual; `react/` manejará la nueva        |
| `e2e/specs/design-system/`           | `shared` contra la versión actual: tokens, componentes, capturas, red y letra mínima. Se explica en `docs/PLAN_MIGRACION_REACT.md` |
| `e2e/support/design-system/`         | Qué story tiene que igualar a qué parte de la app (`cases.ts`), y cómo se mide                                                     |
| `e2e/specs/flyer-engine/`            | `shared/flyer-engine` contra `fixtures/golden/`: los mismos píxeles y el mismo PDF, sin tolerancia                                 |
| `e2e/support/flyer-engine/`          | Abre la story del motor y baja lo que sale. Trae las entradas grabadas de cada caso (`golden-inputs.json`)                         |
| `e2e/support/cloud/`                 | La nube simulada: tablas, bucket, funciones y reglas. Se crea una por prueba                                                       |
| `unit/`                              | Lógica suelta, sin navegador                                                                                                       |
| `fixtures/data/`, `fixtures/logos/`  | Lo que sirve la nube simulada: flyer, catálogo de promociones, geografía y logos                                                   |
| `fixtures/visual/`                   | Capturas de referencia de la versión actual                                                                                        |
| `fixtures/golden/`                   | PNG y resumen de los PDF de referencia del flyer impreso                                                                           |
| `fixtures/network-contract.json`     | Todo lo que la app le pide a la nube: tablas, funciones y acciones                                                                 |
| `fixtures/performance-baseline.json` | Peso y tiempos de la versión actual                                                                                                |

Los números viejos (`t79`, `u05`) que aparecen en `CLAUDE.md` se encuentran buscándolos: la primera línea de cada prueba nombra el archivo que reemplaza, y los archivos viejos siguen en la historia de git.

## Cómo escribir una prueba

El ejemplo a copiar es `e2e/specs/logo-editor/replace-logo.spec.ts`.

- La spec no conoce globales, `id` ni `page.evaluate`: `npm run lint:policy` lo controla. Así, la misma prueba sirve para las dos versiones.
- Lo que no se puede expresar con texto visible o roles va por el driver del dominio.
- Se usa `expect.soft`, para ver todo lo que falla y no sólo lo primero.
- Toda funcionalidad nueva suma su prueba. Las que ya valen para React llevan la etiqueta `@react`.
- Una prueba vale si falla cuando se rompe lo que protege. Antes de darla por buena, rompé esa regla en una copia de la app y mirá que falle: con `FLYER_STATIC_ROOT=<copia>` el servidor de las pruebas sirve esa carpeta.

## Referencias

Se actualizan **sólo a propósito**, y hay que mirar la diferencia antes de aceptarla.

| Qué                      | Cómo se actualiza                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Capturas y flyer impreso | `npx playwright test --project=legacy --grep "@visual\|@golden" --update-snapshots`                                                        |
| Contrato de red          | `npm run contract:record`. Corre toda la suite y reemplaza el archivo entero: nunca con un filtro, porque quedaría sólo lo de esas pruebas |
| Peso y tiempos           | `npm run perf:baseline`                                                                                                                    |

Límites de las capturas:

- Toleran hasta 0,1 % de píxeles distintos, porque las letras cambian un poco de una corrida a otra. Un cambio de pocas letras puede pasar: eso lo cuidan las pruebas de funcionamiento. El flyer impreso se compara píxel por píxel, sin tolerancia.
- Muestran lo que entra en la ventana, más una imagen del contenido en las pantallas que abren con filtros arriba.
- Valen sólo para macOS, y por eso no corren en CI. En otro sistema hay que generarlas ahí.
- El proyecto `design-system` compara recortes de esas mismas capturas: no tiene referencias propias. Si cambia una captura a propósito, él se entera solo.

## El motor del flyer contra la referencia

`e2e/specs/flyer-engine/` abre la story `EngineHarness` y baja el PNG y el PDF con la API pública del motor, sin formulario ni nube. Lee `fixtures/golden/`, nunca las escribe. Lo que depende de la plataforma lleva `@golden` y no corre en CI.

`e2e/support/flyer-engine/golden-inputs.json` son los datos de cada caso, tal como los tenía la app actual en el momento de descargar. No hay nada personal: son personas y empresas inventadas. Las direcciones son de un dominio `.invalid`, y sólo contestan los archivos de `fixtures/`.

Hay que regrabarlas sólo si cambia un caso de `golden/flyer-output.spec.ts` o la calibración de `fixtures/data/`, así:

1. Con una spec temporal en `specs/golden/` (no se versiona), hacer lo mismo que el caso y envolver `window.fullRes` antes de apretar el botón, para guardar los valores que recibe.
2. Guardar también `window.FLYER_CFG` (con un recorte, `_fgRec.cfg0` y `_fgRec.cortes`), el texto de `#filename` y las claves de `_fgLg.imgs`. Del Masivo se guardan las filas.
3. Cambiar la dirección del flyer por la de `golden-inputs.json`, también en `logosSrc`.
4. Si las referencias no cambiaron, el motor tiene que seguir dando diferencia 0: eso demuestra que las entradas están bien.

## Casos especiales

- Toda prueba contra React falla si la app pide algo que no está en `fixtures/network-contract.json`: lo controla `support/test.ts`.
- `pdf-bands` compara PDF de verdad, que no se versionan. Se saltea si no se indican: `FG_PDFS="a.pdf;b.pdf"`.
- `tests/unit/benchmark/normalize.test.ts` consulta MODO en vivo sólo con `FLYER_LIVE_TESTS=1`, porque depende de internet y de lo que publique MODO ese día.
- Cada prueba arranca en una fecha fija (`FIXED_NOW`, en `e2e/support/clock.ts`) porque el catálogo de `fixtures/data` es una foto y sus promos vencen. Si se renueva el catálogo, hay que mover esa fecha.
- Las pruebas de la versión actual necesitan internet para bajar las librerías de los CDN. Si una falla por tiempos de red, repetila sola antes de buscar un error.

## Demo de Gestiones

No es una prueba: sirve para probar a mano. Abre ventanas visibles de Oficial, Hunter y Líder sobre la misma nube simulada, y lo que hace una persona lo ve la otra en vivo:

```bash
npm run demo:commercial-actions
```

También se pueden elegir personas, con `npm run demo:commercial-actions -- oficial hunter2`.
