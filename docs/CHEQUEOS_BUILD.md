# Chequeos de `_build.mjs`

`_build.mjs` tiene un objeto `checks` con 247 comprobaciones sobre el texto de `auth.js`, `gestiones.js`, `_newcss.txt` y el HTML generado. Desaparecen junto con el código viejo, así que cada regla necesita antes un lugar donde seguir viva. Este archivo dice dónde quedó cada una.

Es una migración de reglas, no de código: una prueba de navegador sigue valiendo cuando la app pasa a React y no conoce nombres internos.

## Las cuatro clases

| Clase | Qué significa | Cuántas |
|---|---|---:|
| **cubierto** | Una prueba existente ejerce el mismo comportamiento con la app corriendo. Se abrió la prueba para confirmarlo. | 54 |
| **prueba nueva** | Regla que ve el usuario, o regla de datos, sin prueba real hasta ahora. Se escribió. | 167 |
| **armado** | Cómo se genera la salida. Se comprueba sobre `dist/` en `tests/e2e/specs/build/`, o se retira si sólo tenía sentido para `_build.mjs`. | 14 |
| **regla de código** | Cómo se escribe el código. Dice qué la sostiene en React y, si se puede medir, también se mide. | 12 |

Las rutas son relativas a `tests/e2e/specs/` y sin `.spec.ts`.

## Lo que la app no cumple tal como decía el chequeo

Son diferencias entre lo que decía el comentario del chequeo y lo que hace el código. No se cambió la app ni se forzó la prueba: quedan para decidir.

- **«padron: cada empresa sale en el flyer vigente de su rubro»**: el comentario dice que una empresa sin rubro va «a la Opción 1 SIEMPRE». El código elige el flyer vigente entre los de Flyer Galicia que tienen imagen. La prueba fija lo que hace hoy: no depende de la pantalla.
- **«promos: orden por columna»**: los vacíos «caen al final» sólo en orden ascendente. Al invertir la columna Hasta, encabezan la tabla. La prueba cubre el ascendente.
- **«ux: sin confirm() nativo»**: se cumple para `confirm`, pero «Guardar el actual» de los asesores guardados pregunta el nombre con `prompt()`. La regla `no-alert` lo va a impedir en React.
- **`padron: lupita solo admin`**: el nombre quedó viejo. Hoy va por la facultad `padron_buscar`, no por ser admin.

## Lo que falta en React

- `preconnect` a Supabase y Figtree por `<link>` con `preconnect`: la salida de Vite todavía no los tiene porque no hay cliente ni fuentes. Se suman con `shared/supabase` y `shared/ui` (filas 195 y 198).
- Las técnicas de rendimiento (filas 197, 205 a 209) son tareas de las etapas 2 y 3: no se pueden medir de forma estable sin dar falsas alarmas.
- Las pruebas nuevas corren hoy contra la versión actual. Cada método nuevo de los drivers necesita su versión en `driver/react/` cuando llegue su slice.

## Una fila por chequeo

| # | Chequeo | Clase | Dónde vive o por qué se retira |
|---:|---|---|---|
| 1 | CSS full-screen | prueba nueva | La ventana no se desplaza: el armador ocupa lo que deja el header. Vive en: `shell/layout-and-text`. |
| 2 | layout height | prueba nueva | Alto del armador = ventana menos header. Vive en: `shell/layout-and-text`. |
| 3 | panel height | prueba nueva | El formulario se desplaza adentro de su panel. Vive en: `shell/layout-and-text`. |
| 4 | Supabase SDK (version fija) | armado | React empaqueta supabase-js (no hay CDN). Lo que sigue valiendo, versión exacta: «the versions of what is installed are exact». Vive en: `build/build-output`. |
| 5 | auth.js | armado (retirado) | Retirado: en React no existe `auth.js`; el equivalente es el nombre con hash de cada asset (fila siguiente). Vive en: `build/build-output`. |
| 6 | cache-busting auth.js | armado | Vite pone el hash en cada nombre de asset: «every asset has its content in the name». Vive en: `build/build-output`. |
| 7 | SRI: todos los scripts CDN con integrity | armado | Sin scripts externos en la salida de Vite; si aparece uno, debe traer SRI: «no script comes from outside unless it brings its hash». Y `smoke` comprueba que no se pide nada afuera. Vive en: `build/build-output` `build/smoke`. |
| 8 | libs de exportacion bajo demanda (fuera del head, con SRI en la meta) | armado | Carga diferida con `import()` en la etapa 3; hoy se comprueba que ninguna librería de exportación está en la primera carga: «the libraries of exports are not in the first load». En la versión actual, `flyer-sections/pdf-to-image` ejerce la carga bajo demanda de pdf.js. Vive en: `build/build-output`. |
| 9 | CSP: pdf.js baja sus archivos y compila WASM, sin eval | cubierto | Convierte un PDF bajo la CSP real, con el WASM verificado. En React también lo fija «the policy lets WASM compile but never eval». Vive en: `flyer-sections/pdf-to-image` `build/build-output`. |
| 10 | SRI: pdf.js dinamico con integrity | cubierto | «a tampered WASM…» y «a tampered worker…»: con el hash cambiado no corre. Vive en: `flyer-sections/pdf-to-image`. |
| 11 | CSP: en index.html, no en export | armado | La mitad de `index.html` sigue valiendo y la cubre «the security policy comes before any script». La mitad del export se retira: en el plan no hay `index_export.html`. Vive en: `build/build-output`. |
| 12 | export: auth.js inlineado | armado (retirado) | Retirado: `index_export.html` no existe en React (el plan publica `dist/`). |
| 13 | export: sin HTML duplicado (una sola imagen base, un solo auth.js) | armado (retirado) | Retirado: era un error de armar el export con `String.replace`; sin export, no aplica. |
| 14 | imagen base fuera de index.html (fallback flyer_default) | armado | «the page itself stays light»: sin imágenes adentro y menos de 400 KB. La regla de usuario (no bajar la imagen de ejemplo en silencio) está en `flyer-editor/flyer-fails-to-load`. Vive en: `build/build-output`. |
| 15 | escape: helper con comillas | prueba nueva | Comillas y etiquetas de terceros salen como texto, en cada pantalla. Vive en: `session/untrusted-text`. |
| 16 | escape: panel usuarios/registros | prueba nueva | Usuarios, Registros, Cambios y Auditoría con un nombre hostil. Vive en: `session/untrusted-text`. |
| 17 | onclick solo con ids (versiones/eliminar) | regla de código | JSX no permite `onclick` con texto y la CSP de React no tiene `unsafe-inline` (`build/build-output`). Hoy además: un archivo con comillas en el nombre no rompe ni ejecuta nada. Vive en: `session/untrusted-text`. |
| 18 | sesion: signOut si la cuenta no esta activa | prueba nueva | Cuenta inactiva o pendiente: mensaje, formulario y sesión cerrada. Vive en: `session/entry`. |
| 19 | portapapeles: DOMParser | prueba nueva | Pegar HTML en el legal conserva las negritas y no ejecuta nada. Vive en: `flyer-editor/legal`. |
| 20 | excel: vista previa escapada | prueba nueva | Encabezados y celdas hostiles del Excel en la validación. Vive en: `session/untrusted-text`. |
| 21 | toast: unico (debounce) | prueba nueva | Un solo aviso a la vez; gana el último. Vive en: `shell/layout-and-text`. |
| 22 | promos: espera de catalogo en vuelo | prueba nueva | Validar con el catálogo en camino espera, no ignora; el botón queda trabado mientras. Vive en: `promotions/table-and-matching`. |
| 23 | registro: solo dominio del banco | prueba nueva | Registro: sólo @bancogalicia.com.ar, clave de 8 y no se pide nada antes de validar. Vive en: `session/entry`. |
| 24 | asesores guardados: slot 3/4 | prueba nueva | «Guardar el actual» desde el Asesor 3 guarda el 3. Vive en: `flyer-editor/officers-card`. |
| 25 | asesores guardados: en la nube | prueba nueva | La lista viene de la nube y se guarda con `asesores_replace`. Vive en: `flyer-editor/officers-card` `company-registry/database-screen`. |
| 26 | buscador de pantallas: Cmd/Ctrl+K y boton en el header | cubierto | Todo el comportamiento del buscador. Vive en: `search/screen-search`. |
| 27 | layout hidden | prueba nueva | Sin sesión, el armador está escondido. Vive en: `session/entry`. |
| 28 | version: meta build-v + chequeo en auth.js | prueba nueva | Cartel de versión nueva sólo si difiere. En React: `build/smoke` cubre `version.json` y el slice de shell debe portar el cartel. Vive en: `session/entry`. |
| 29 | login-ov | prueba nueva | Sin sesión aparece el formulario. Vive en: `session/entry`. |
| 30 | admin-panel | cubierto | Cada prueba del panel lo abre. Vive en: `admin/usage-board` `admin/panel-and-faculties`. |
| 31 | calcSC | cubierto | `calcSC` es la escala de la vista previa: se ejerce al hacer zoom. Vive en: `flyer-editor/preview-zoom`. |
| 32 | initApp | cubierto | `initApp` es el arranque: lo ejerce toda prueba; explícito en «the right password goes in». Vive en: `session/entry`. |
| 33 | header menu (hdr-dropdown) | cubierto | El menú del nombre se abre y se usa. Vive en: `session/switch-test-account` `shell/keyboard-and-menu`. |
| 34 | modal clave | prueba nueva | «Cambiar contraseña» abre y cierra su ventana. Vive en: `shell/keyboard-and-menu`. |
| 35 | modal notas | prueba nueva | El bloc de notas abre con su facultad. Vive en: `shell/keyboard-and-menu`. |
| 36 | campos asesor (nombre/nombre2) | prueba nueva | Campos de los oficiales 1 a 4. Vive en: `flyer-editor/officers-card`. |
| 37 | campos empresa/celular/email | prueba nueva | Campos de empresa, celular y mail, escritos y dibujados. Vive en: `flyer-editor/officers-card`. |
| 38 | titulos Asesor 1/2 (popover) | prueba nueva | Tocar el título «Asesor N» abre su lista de guardados. Vive en: `flyer-editor/officers-card`. |
| 39 | config setCfg | prueba nueva | Elegir una configuración cambia los importes dibujados. Vive en: `flyer-editor/drawing-rules`. |
| 40 | toggles a1/a2 | prueba nueva | Mostrar y quitar oficiales (los interruptores viejos quedaron adentro de + Agregar / ✕ Quitar). Vive en: `flyer-editor/officers-card`. |
| 41 | legal-text | prueba nueva | El legal se escribe, se dibuja y es de cada opción. Vive en: `flyer-editor/legal`. |
| 42 | loadExcel (override) | cubierto | Subir el Excel del Masivo. Vive en: `flyer-editor/bulk-excel`. |
| 43 | subir acepta PDF/img | prueba nueva | El campo acepta PDF e imágenes; otro archivo se rechaza. Vive en: `admin/options-and-cashback`. |
| 44 | rasterizar PDF/img | cubierto | Rasterizar PDF e imagen. Vive en: `flyer-sections/pdf-to-image`. |
| 45 | render PDF en bandas | prueba nueva | Un PDF más alto que una banda sale entero y cada franja en su lugar. Nota: la comparación con PDF reales de `flyer-sections/pdf-bands` se saltea sin `FG_PDFS`. Vive en: `flyer-sections/tall-pdf`. |
| 46 | calibrador visual | prueba nueva | Zonas, arrastre y guardado del calibrador. Vive en: `admin/calibrator`. |
| 47 | activar flyer imagen | prueba nueva | «Activar» de un archivo de la lista escribe el `_active` de esa opción. Vive en: `admin/options-and-cashback`. |
| 48 | selector 3 opciones | cubierto | La barra de opciones, con el flyer elegido y los demás. Vive en: `flyer-editor/option-bar-favorite`. |
| 49 | archivos por opcion | cubierto | Cada opción lee y escribe sus propios archivos. Vive en: `flyer-editor/flyer-fails-to-load` `flyer-editor/legal`. |
| 50 | legales: una solapa por opcion (dinamico) | prueba nueva | Una solapa de Legales por opción, que guarda sólo su archivo. Vive en: `flyer-editor/legal`. |
| 51 | opciones configurables | prueba nueva | Agregar una opción la suma a Facultades y Legales. Vive en: `admin/options-and-cashback`. |
| 52 | preguntar opcion al subir | prueba nueva | Subir pregunta a qué opción; cancelar no sube nada. Vive en: `admin/options-and-cashback`. |
| 53 | registro de descargas | prueba nueva | Cada descarga queda en `flyer_logs`. Vive en: `flyer-editor/downloads-and-history`. |
| 54 | opcion en registros/historial | prueba nueva | El registro dice qué opción se usó; el Historial las muestra. Vive en: `flyer-editor/downloads-and-history`. |
| 55 | legal persistente por opcion | prueba nueva | Una edición queda en su opción. Vive en: `flyer-editor/legal`. |
| 56 | legal: sin arrastre entre opciones | prueba nueva | No viaja a otra opción; mientras carga no se muestra el ajeno; Restaurar no cae en otro. Vive en: `flyer-editor/legal`. |
| 57 | empresa sin default | prueba nueva | El formulario arranca vacío. Vive en: `flyer-editor/officers-card`. |
| 58 | asesores 3 y 4 | prueba nueva | Oficiales 3 y 4 en el formulario y en el flyer. Vive en: `flyer-editor/officers-card`. |
| 59 | flyer crece (2 filas) | prueba nueva | Con cuatro el flyer crece y va de a dos. Vive en: `flyer-editor/officers-card`. |
| 60 | masivo/plantilla 4 asesores | prueba nueva | La plantilla del Masivo trae los cuatro oficiales. Vive en: `flyer-editor/batch-rules`. |
| 61 | etiquetas Agregar asesor N | prueba nueva | El botón visible hoy es «+ Agregar asesor»; las barritas con ese rótulo ya no se ven. Vive en: `flyer-editor/officers-card`. |
| 62 | autocompletar mail | prueba nueva | El mail sigue al nombre hasta que se escribe a mano. Vive en: `flyer-editor/officers-card`. |
| 63 | alta progresiva asesores | prueba nueva | Arranca uno; se agregan de a uno hasta cuatro. Vive en: `flyer-editor/officers-card`. |
| 64 | asesor 1: boton Borrar (y quitar borra los datos) | prueba nueva | Borrar vacía el primero; quitar no devuelve los datos. Vive en: `flyer-editor/officers-card`. |
| 65 | padron: privado por usuario (tabla, no archivo) | prueba nueva | La lupa sólo trae lo que tiene el usuario como dueño; el control real es RLS (`supabase/`, no cambia). Vive en: `company-registry/search-rules`. |
| 66 | base de datos: empresas por usuario (solo lectura) | prueba nueva | El admin consulta sin poder editar. Vive en: `company-registry/database-screen`. |
| 67 | padron: freno del Excel | prueba nueva | Muestra qué se va, entra y cambia; cancelar no toca nada; sin poder releer, no se reemplaza. Vive en: `company-registry/sheet-import`. |
| 68 | padron: motor | prueba nueva | Búsqueda por palabras y CUIT. Vive en: `company-registry/search-rules`. |
| 69 | padron: excel | prueba nueva | Subir, bajar y plantilla, con las mismas columnas. Vive en: `company-registry/sheet-import`. |
| 70 | padron: lupita solo admin | prueba nueva | La lupa va con la facultad. Vive en: `company-registry/search-rules`. |
| 71 | base de datos: pantalla propia (menu del nombre) | prueba nueva | Se abre desde el menú con cualquiera de las dos facultades. Vive en: `company-registry/database-screen`. |
| 72 | base de datos: solapa Mis empresas | prueba nueva | Mis empresas dentro de Base de datos. Vive en: `company-registry/database-screen` `company-registry/sheet-import`. |
| 73 | base de datos: solapa Mis asesores (ver/editar/Excel) | prueba nueva | Mis asesores: corregir y guardar en la nube. Vive en: `company-registry/database-screen`. |
| 74 | base de datos: solapas internas segun facultad (3, con render propio) | prueba nueva | Las solapas según las facultades; una sola, sin barra. Vive en: `company-registry/database-screen`. |
| 75 | hunter fase 3: tildadas arriba, Ctrl+Enter, simbar, iconos, conversacion | prueba nueva | Tildadas arriba, Ctrl+Enter, conversación de propuestas. Vive en: `hunter/hunter-screen` `company-registry/substitute-access`. |
| 76 | propuestas: proponer (hunter) y aprobar/rechazar (oficial), vía RPC | prueba nueva | Crear, aprobar, rechazar y repreguntar por su RPC, sin reescribir la lista. Vive en: `hunter/hunter-screen`. |
| 77 | textos: la palabra padron no aparece en pantalla | prueba nueva | Se lee el texto en pantalla y el nombre del archivo. Vive en: `shell/layout-and-text`. |
| 78 | premium: capa visual (marino + naranja, Figtree, tarjetas, login partido) | cubierto | Lo cubren las imágenes de referencia (login, tarjetas, paletas) y la tipografía se mide en `shell/layout-and-text`. La versión React se compara contra las mismas capturas. Vive en: `visual/reference-screens`. |
| 79 | padron: generar flyers (ZIP por formato + resumen) | cubierto | ZIP por formato y `Resumen.txt` en `batches-skip-broken-flyer`; el registro de la tanda en `batch-rules`. Vive en: `flyer-editor/batches-skip-broken-flyer` `flyer-editor/batch-rules`. |
| 80 | padron: editor en linea | prueba nueva | «Editar en línea» guarda lo editado. El resto del editor ya estaba en `editor-and-generator`. Vive en: `company-registry/sheet-import` `company-registry/editor-and-generator`. |
| 81 | panel admin: 3 pilares | prueba nueva | Los tres pilares. Vive en: `admin/panel-and-faculties`. |
| 82 | panel admin: subsolapas por pilar | prueba nueva | Las hojas de cada pilar. Vive en: `admin/panel-and-faculties`. |
| 83 | facultades: matriz por rol | prueba nueva | La matriz se muestra, se guarda y llega a ese perfil. Vive en: `admin/panel-and-faculties`. |
| 84 | facultades: defaults = comportamiento previo | prueba nueva | Sin nada guardado cada perfil tiene lo de siempre. Vive en: `admin/panel-and-faculties`. |
| 85 | tutorial guiado | prueba nueva | Ver tutorial y el arranque automático con su facultad. El capítulo de Gestiones está en `commercial-actions/tutorial`. Vive en: `shell/keyboard-and-menu`. |
| 86 | promos: solapa de primer nivel + facultad + matching + excel | prueba nueva | Solapa con su facultad y Excel; la coincidencia, en `search-brings-all-promotions`. Vive en: `promotions/table-and-matching` `promotions/search-brings-all-promotions`. |
| 87 | promos: match tolerante a espacios y palabras genericas | prueba nueva | «Sushi Club» = «SushiClub»; «Club» solo no alcanza. Vive en: `promotions/table-and-matching`. |
| 88 | promos: catalogo paginado (limite de 1000 de PostgREST) | prueba nueva | Un catálogo de más de una página llega entero. Vive en: `promotions/table-and-matching`. |
| 89 | promos: filtros por columna + buscador | prueba nueva | Filtros por columna y buscador que no pierde el foco. Vive en: `promotions/table-and-matching`. |
| 90 | promos: orden por columna | prueba nueva | Orden por estado (urgencia) y por columna. Vive en: `promotions/table-and-matching`. |
| 91 | facultades: una por opcion del armador | prueba nueva | Cada opción nueva tiene su fila. Vive en: `admin/panel-and-faculties` `admin/options-and-cashback`. |
| 92 | logos subidos nítidos (PNG transparente respetado, bordes suaves) | cubierto | Mira los píxeles del logo subido. Vive en: `logo-editor/uploaded-logo-stays-sharp`. |
| 93 | logo con fondo oscuro (Toledo) pintado del color del fondo | cubierto | Mismo logo Toledo real. Vive en: `logo-editor/dark-background-logo`. |
| 94 | logos 21-oct: guías con teclado, filtros de Activas, días de súper, borrar de verdad, Shift en grupo, un logo a pantalla completa | cubierto | Una spec por cada punto. Vive en: `logo-editor/keyboard-guides` `logo-strip/filters-follow-active-promotions` `promotions/supermarket-days` `logo-editor/delete-for-real` `logo-editor/shift-group-on-flyer-logos` `logo-strip/single-logo-full-screen`. |
| 95 | días de súper sólo del %, buscados debajo del logo, en Armar franja; doble clic; Shift mueve originales | cubierto | Días sobre un flyer real y en franjas. Vive en: `promotions/supermarket-days-on-real-flyer` `logo-strip/supermarket-days`. |
| 96 | teclas + y − cambian el tamaño (Cambiar logos y Armar franja) | cubierto | Teclas + y − en las dos pantallas. Vive en: `logo-editor/plus-minus-keys`. |
| 97 | atajos V (Vista previa), R (Recortar), F (Armar franja), I (Insertar) y N (Nuevo borrador) en el modo edición | cubierto | V, R, F y N estaban; la I se sumó a la misma spec. Vive en: `logo-editor/single-letter-shortcuts`. |
| 98 | deshacer dentro de Armar franja y marcas vencidas en rojo | cubierto | Deshacer de la franja y marcas vencidas. Vive en: `logo-strip/undo-and-expired-brands`. |
| 99 | volver al editor de una franja armada (Editar franja) | cubierto | Editar franja. Vive en: `logo-strip/edit-built-strip`. |
| 100 | el editor de un logo muestra el logo de ahora y abre el cambio elegido | cubierto | Miniatura y cambio elegido. Vive en: `logo-editor/editor-shows-current-logo`. |
| 101 | Marcas guardadas: guardar y aplicar combinaciones en el modelo nuevo | cubierto | Guardar y aplicar. Vive en: `studio/saved-brands`. |
| 102 | Marcas guardadas: Así queda, Atrás, ir a un paso, reemplazar, provincia y miniaturas | cubierto | Así queda, Atrás, puntitos, reemplazar y provincia. Vive en: `studio/saved-brands`. |
| 103 | logo del flyer movido sin deformarse | cubierto | Proporciones exactas al mover. Vive en: `logo-editor/move-original-keeps-proportions`. |
| 104 | recuadros de Cambiar logos discretos (sólo al pasar el mouse) | cubierto | En reposo y con el mouse. Vive en: `logo-editor/discreet-markers`. |
| 105 | franjas que no se pisan y sugerir que respeta los filtros | cubierto | Franjas y Sugerir. Vive en: `logo-strip/strips-do-not-overlap` `logo-strip/suggest-brands`. |
| 106 | marcas vigiladas, borradores guardados, sugerir marcas y tablero de uso | cubierto | Una spec por cada punto. Vive en: `promotions/watched-brands` `flyer-sections/saved-drafts` `logo-strip/suggest-brands` `admin/usage-board`. |
| 107 | deshacer recorte, historial con recorte, version sin cashback, franja en pasos y Estudio ver completo | cubierto | Una spec por cada punto. Vive en: `flyer-sections/undo-crop-and-history` `flyer-sections/no-cashback-version` `logo-strip/phone-steps` `studio/complete-view-and-request-notice`. |
| 108 | borradores: el primer cambio se muda a una pestania y la lupa no los borra | cubierto | Incluye que la búsqueda no borra el borrador. Vive en: `flyer-sections/drafts`. |
| 109 | recortar: quita una parte, corre la calibracion y apaga los importes | cubierto | Recortar, calibración e importes. Vive en: `flyer-sections/crop` `flyer-sections/restore-and-cashback-notice`. |
| 110 | logos: guias con iman, alinear/repartir, duplicar y quitar | cubierto | Imán, alinear, duplicar y borrar. Vive en: `logo-editor/guides-align-duplicate`. |
| 111 | logos: Shift elige varios (flyer y franja) y la franja reparte en las filas originales | prueba nueva | Shift en flyer y franja ya estaba; que las marcas vayan en las filas del original no lo probaba nadie (una mutación sobrevivía a toda `logo-strip`). Prueba nueva. Vive en: `logo-editor/shift-select-several` `logo-strip/rows-of-brands`. |
| 112 | logos: deshacer/rehacer de a un paso y Ver limpio | cubierto | Deshacer de a un paso y Vista previa. Vive en: `logo-editor/undo-redo-and-clean-preview`. |
| 113 | logos: cambiar, mover, textos y subir (vista previa = descarga) | cubierto | Cambiar, mover, texto y subir. Vive en: `logo-editor/replace-logo` `logo-editor/adjust-placed-logo` `logo-editor/write-text-and-move-original` `logo-editor/upload-logo-from-pc`. |
| 114 | benchmark: solapa aparte, facultad apagada, carga diferida, tablas con RLS y sin tocar Promociones | cubierto | Solapa, facultad y carga diferida. Las reglas RLS y las Edge Functions no cambian con la migración y siguen con `supabase/_verify_*.sql`. Vive en: `benchmark/access` `benchmark/comparison`. |
| 115 | estudio: solapa + facultad + tabla con RLS + aprobar como opcion nueva | cubierto | Solapa, facultad y publicación. RLS como en la fila anterior. Vive en: `studio/save-and-approve` `studio/ask-and-share`. |
| 116 | rubros: solapa + opciones por solapa + cartel del beneficio | prueba nueva | Solapa propia y líneas del beneficio con empresa y tope. Vive en: `flyer-editor/drawing-rules`. |
| 117 | sueldo: solapa + monto unico de cashback | prueba nueva | Solapa propia y un solo importe: el mayor. Vive en: `flyer-editor/drawing-rules`. |
| 118 | sueldo: sin cashback tapa igual con el fondo real | prueba nueva | Tapa con el fondo real y no escribe nada. Vive en: `flyer-editor/drawing-rules`. |
| 119 | solapas: generalizadas a N (un solo registro) | prueba nueva | Las solapas Rubros y Sueldo aparecen sólo con opciones; que sean un solo registro en el código es regla de diseño del slice `flyer-editor`. Vive en: `flyer-editor/drawing-rules`. |
| 120 | legal: variables de montos ({cashback}, {plusgold}, ...) | prueba nueva | Cada marcador, y el desconocido queda como está. Vive en: `flyer-editor/legal`. |
| 121 | calibrador: tamano, peso y color por zona | prueba nueva | Tamaño, peso y color se guardan y el flyer los usa. Vive en: `admin/calibrator`. |
| 122 | sueldo: el naranja del flyer | prueba nueva | El color con el que se dibuja el importe. Vive en: `flyer-editor/drawing-rules`. |
| 123 | header: arranca en la primera solapa | prueba nueva | Abre en la primera solapa visible para ese perfil. Vive en: `session/entry`. |
| 124 | header: solapas reordenables manteniendo apretado | prueba nueva | Mantener apretado y arrastrar; el orden llega a todos; un asesor no puede. Vive en: `shell/keyboard-and-menu`. |
| 125 | legal: chips de marcadores en el panel | prueba nueva | Los chips pegan el marcador en el legal de esa opción. Vive en: `flyer-editor/legal`. |
| 126 | facultades: vista previa por perfil | prueba nueva | Saca y devuelve todo; sin panel durante la vista previa. Vive en: `admin/panel-and-faculties`. |
| 127 | facultades: columna Vos del admin (profiles.facultades) | prueba nueva | Se guarda en su perfil y no en el de los demás. Vive en: `admin/panel-and-faculties`. |
| 128 | base de datos: cambios en las empresas (solapa Data) | prueba nueva | La hoja lee `padron_log`. Vive en: `admin/panel-and-faculties`. |
| 129 | admin: auditoria de acciones (solapa Admin) | prueba nueva | La hoja lee `audit_log`. Vive en: `admin/panel-and-faculties`. |
| 130 | facultades: gating bidireccional (quitar tambien saca) | prueba nueva | Sacar una facultad también saca lo que da. Vive en: `admin/panel-and-faculties`. |
| 131 | facultades: gating aplicado tras cargar la matriz | prueba nueva | Lo que se ve sale de la matriz leída (perfil sin nada guardado y al guardar). Vive en: `admin/panel-and-faculties`. |
| 132 | rol Pro | prueba nueva | El formulario de usuario ofrece Pro. Vive en: `admin/panel-and-faculties`. |
| 133 | gestiones: modulo aparte bajo demanda, interruptor, Lider y cuenta de prueba | prueba nueva | Se baja al abrir, interruptor apagado/prueba, «Probar como»; el Líder en `team-workflow`. Vive en: `commercial-actions/module-and-options` `commercial-actions/team-workflow`. |
| 134 | preview: zoom con Ctrl + rueda (la rueda sola recorre), armador y Hunter | prueba nueva | Con y sin Ctrl, en el armador y en el Hunter. Vive en: `flyer-editor/preview-zoom` `hunter/hunter-screen`. |
| 135 | gestiones: Accion/Feria, repeticion cada N dias y "solo lo mio" del admin | prueba nueva | Tipos sin «Visita», cada N días y «sólo lo mío». Vive en: `commercial-actions/module-and-options`. |
| 136 | avisos de gestiones (hunter y dueño) y menu "Mis propuestas" | prueba nueva | Número en la solapa; mensajes nuevos en `team-workflow` y marcas de leído en `actions-list`. Vive en: `commercial-actions/module-and-options` `commercial-actions/team-workflow` `commercial-actions/actions-list`. |
| 137 | rol Hunter | prueba nueva | El perfil se ofrece en el formulario y entra a su pantalla. Vive en: `admin/panel-and-faculties` `hunter/hunter-screen`. |
| 138 | hunter: usa el flyer vigente habilitado, con su legal, o no lo arma | prueba nueva | Flyer vigente habilitado, con su legal, o dice por qué no. Vive en: `hunter/hunter-screen`. |
| 139 | hunter: solapa propia, candado en _can y descarga que no toca la base | prueba nueva | Candado del perfil y descarga que sólo escribe el registro. Vive en: `hunter/hunter-screen`. |
| 140 | cashback: solapa + guardado en la nube | prueba nueva | Se edita y se guarda en la nube. Vive en: `admin/options-and-cashback`. |
| 141 | cashback: se aplica a todos al loguear | prueba nueva | Quien entra después ve el importe nuevo. Vive en: `admin/options-and-cashback`. |
| 142 | padron: sin oficiales asignados | prueba nueva | Vacía los campos y lo dice debajo de la empresa. Vive en: `company-registry/search-rules`. |
| 143 | padron: actualizar al generar | prueba nueva | Ofrece y guarda; la razón social no se toca. Vive en: `company-registry/update-after-download`. |
| 144 | padron: alta de empresa nueva | prueba nueva | Ofrece agregarla aparte. Vive en: `company-registry/update-after-download`. |
| 145 | padron: typeahead en empresa | prueba nueva | Desde 2 letras o 3 dígitos; Enter la trae. Vive en: `company-registry/search-rules`. |
| 146 | padron: popup sin cierre accidental | prueba nueva | Tocar afuera no cierra; decir no se respeta hasta otro cambio. Vive en: `company-registry/update-after-download`. |
| 147 | padron: el nombre identifica la empresa | prueba nueva | Mismo CUIT y otro nombre = otra empresa, con aviso. Vive en: `company-registry/update-after-download`. |
| 148 | padron: cashback tolerante + informe | prueba nueva | «1.0», «config 2»; lo desconocido se informa con su fila. Vive en: `company-registry/search-rules` `company-registry/sheet-import`. |
| 149 | padron: sin cashback | prueba nueva | Vacío, SIN o desconocido: aviso e importes en blanco. Vive en: `company-registry/search-rules`. |
| 150 | padron: SIN explicito + nombre de archivo | prueba nueva | SIN no se queja, y el nombre del archivo sigue a la empresa. Vive en: `company-registry/sheet-import` `company-registry/search-rules`. |
| 151 | 3 asesores: banda ancha | prueba nueva | Con tres, columnas parejas sobre casi todo el ancho. Vive en: `flyer-editor/officers-card`. |
| 152 | padron: filas saneadas al cargar | prueba nueva | Filas incompletas no rompen nada. Vive en: `company-registry/search-rules`. |
| 153 | historial: aplica todos los asesores | prueba nueva | Cargar del historial trae todos y no deja restos. Vive en: `flyer-editor/downloads-and-history`. |
| 154 | nombre de archivo seguro | prueba nueva | Caracteres prohibidos, puntos finales, control y largo. Vive en: `flyer-editor/downloads-and-history`. |
| 155 | masivo: el ZIP no pisa repetidos | prueba nueva | Nombres repetidos no se pisan en el ZIP. Vive en: `flyer-editor/batch-rules`. |
| 156 | montos y empresa: fondo muestreado (sin cuadrito) | prueba nueva | El color que tapa sale del arte. Vive en: `flyer-editor/drawing-rules`. |
| 157 | fondo muestreado: de la imagen, no del canvas (no cambia con el zoom) | prueba nueva | El color no cambia con el zoom. Vive en: `flyer-editor/drawing-rules`. |
| 158 | montos: grilla 2x2 (posicion propia por caja) | prueba nueva | Cada caja en su lugar y con su color; el calibrador mueve una o todas. Vive en: `flyer-editor/drawing-rules` `admin/calibrator`. |
| 159 | preview: zoom maximo 130% + full canvas reutilizado | prueba nueva | El tope de 130 % se mide. Reutilizar el canvas es técnica: tarea de la etapa 3 (`flyer-engine`). Vive en: `flyer-editor/preview-zoom`. |
| 160 | arranque: no se pinta el flyer hasta saber la solapa | prueba nueva | No se pinta nada hasta que llega el flyer de ese perfil. Vive en: `session/entry`. |
| 161 | facultades: opciones agrupadas por solapa | prueba nueva | Agrupadas, plegadas y con cuenta por perfil. Vive en: `admin/panel-and-faculties`. |
| 162 | rubros: cartel de promo adicional (Pasa tu sueldo) | prueba nueva | Dos columnas con el nombre y el tope. Vive en: `flyer-editor/drawing-rules`. |
| 163 | opciones: la nueva reemplaza a la vieja (el padron la sigue) | prueba nueva | «Reemplaza a» se guarda y la empresa sigue al nuevo. Vive en: `admin/options-and-cashback` `hunter/hunter-screen`. |
| 164 | padron: cada empresa sale en el flyer vigente de su rubro | prueba nueva | Sale de la fila, no de la pantalla; un rubro sin flyer se informa. Vive en: `admin/options-and-cashback`. |
| 165 | masivo: resumen antes de generar | prueba nueva | Pregunta cuántas van en cada flyer. Vive en: `flyer-editor/batch-rules`. |
| 166 | calibrador: partir de una base | prueba nueva | Partir de una base sin arrastrar cambios a la siguiente. Vive en: `admin/calibrator`. |
| 167 | calibrador: zoom + zona elegida sola | prueba nueva | Botones, Ctrl + rueda, tope y zona elegida. Vive en: `admin/calibrator`. |
| 168 | calibrador: editor redimensionable (barrita, esquina, Ampliar) | prueba nueva | Ampliar, barrita y esquina. Vive en: `admin/calibrator`. |
| 169 | pegar: parser | prueba nueva | Una firma completa, dígito por dígito. Vive en: `flyer-editor/paste-officer`. |
| 170 | pegar: prioriza mail de Galicia | prueba nueva | Gana el mail del banco; otro se avisa. Vive en: `flyer-editor/paste-officer`. |
| 171 | pegar: boton por asesor, segun facultad | prueba nueva | Con su facultad y uno por oficial. Vive en: `flyer-editor/paste-officer`. |
| 172 | pegar: aplica/limpia/deshace | prueba nueva | Completa, limpia y Deshacer. Vive en: `flyer-editor/paste-officer`. |
| 173 | pegar: celular sin codigo de area (15+8) | prueba nueva | 15 + 8 dígitos. Vive en: `flyer-editor/paste-officer`. |
| 174 | pegar: el cuadro se cierra al traer del padron | prueba nueva | Se cierra al traer una empresa. Vive en: `flyer-editor/paste-officer`. |
| 175 | pegar: el mail solo si tiene arroba, textual | prueba nueva | Sin arroba no hay mail: nunca se deduce. Vive en: `flyer-editor/paste-officer`. |
| 176 | pegar: el legajo no se cuela en el nombre | prueba nueva | El legajo no entra al nombre ni al teléfono. Vive en: `flyer-editor/paste-officer`. |
| 177 | ux: trabajo guardado gateado por facultad | prueba nueva | El historial queda sólo con la facultad. Vive en: `flyer-editor/downloads-and-history`. |
| 178 | ux: validacion en linea (no bloquea) | prueba nueva | Avisa al escribir y no frena la descarga. Vive en: `flyer-editor/downloads-and-history`. |
| 179 | oficiales por sede | prueba nueva | Con su facultad, hasta 8, con ubicación; al apagar pregunta y borra. Vive en: `flyer-editor/downloads-and-history`. |
| 180 | ux: compartir (solo PDF, boton oculto si no se puede) + Otros (PNG) | prueba nueva | Oculto si el navegador no puede; PNG en Otros; registra «compartir». Vive en: `flyer-editor/downloads-and-history`. |
| 181 | promos: columna con el link a la promo | prueba nueva | El enlace con el formato del sitio de Galicia. Vive en: `promotions/table-and-matching`. |
| 182 | promos: filtro por provincia | cubierto | Provincia y «Fuera de la provincia». Vive en: `promotions/several-provinces` `promotions/modo-promotions`. |
| 183 | promos: MODO (tilde, sin repetidas, logos por _promoLogoSrc) | cubierto | Tilde, repetidas y logos. Vive en: `promotions/modo-promotions`. |
| 184 | promos: nuevas y proximamente | prueba nueva | Etiqueta Nueva, «Sólo las nuevas» y «Empieza el dd/mm». Vive en: `promotions/table-and-matching`. |
| 185 | promos: solapa "Activas" | cubierto | Activas por provincia y localidad. Vive en: `promotions/several-provinces` `promotions/modo-promotions` `logo-strip/locality-filters`. |
| 186 | promos: una sola fila por marca | prueba nueva | Une sucursales sólo si el nombre corto existe; las farmacias distintas quedan. Vive en: `promotions/table-and-matching` `promotions/search-brings-all-promotions`. |
| 187 | ux: globito con el atajo del PDF | prueba nueva | El globito aparece con el mouse. Vive en: `shell/layout-and-text`. |
| 188 | ux: Ctrl+Enter tambien valida promociones | prueba nueva | Ctrl+Enter valida desde el cuadro. Vive en: `promotions/table-and-matching`. |
| 189 | ux: teclado (solapas + Ctrl+Enter + Esc) | prueba nueva | Flechas en las solapas, Ctrl+Enter y Escape. Vive en: `shell/keyboard-and-menu`. |
| 190 | ux: negrita del legal | prueba nueva | Botón y Ctrl+B ponen y sacan. Vive en: `flyer-editor/legal`. |
| 191 | ux: sin confirm() nativo | regla de código | Regla `no-alert` en `.oxlintrc.json` (agregada). Hoy: `app.dialogs()` queda vacío en «the app asks with its own windows». Queda un `prompt()` en «Guardar el actual» (ver aviso abajo). Vive en: `shell/keyboard-and-menu`. |
| 192 | pegar: telefono por grupos de digitos | prueba nueva | CUIT, fecha y separadores no se confunden. Vive en: `flyer-editor/paste-officer`. |
| 193 | perf: sin el armador muerto del template | armado (retirado) | Retirado: es el código muerto de `_source.html`, que React no tiene. |
| 194 | perf: favicon fuera del head | armado | «the page itself stays light» pide el favicon por `link`. React lo hace desde `web/index.html`. Vive en: `build/build-output`. |
| 195 | perf: fuentes por <link> + preconnect | armado | «fonts never come by @import». Falta en la etapa 2: pedir Figtree por `<link>` con `preconnect` (hoy React no pide fuentes). Vive en: `build/build-output`. |
| 196 | perf: redraw coalescido por frame | regla de código | Se mide: una ráfaga de cambios dibuja como uno. En React: el store del editor agrupa por frame (etapa 3). Vive en: `flyer-editor/drawing-economy`. |
| 197 | perf: legal con cache de medidas y de word-wrap | regla de código | Técnica de rendimiento. Tarea de la etapa 3: `flyer-engine` con su prueba de lógica pura; `golden` fija el resultado. |
| 198 | perf: preconnect a Supabase (antes de los scripts) | armado | Falta en la etapa 2: la salida de Vite todavía no hace `preconnect` a Supabase (aún no hay cliente). Sumar al plugin y a `build-output` cuando exista `shared/supabase`. |
| 199 | perf: configuracion del bucket pedida junta al entrar (_bucketJson) | regla de código | Regla `no-restricted-globals` para `fetch` en `web/src` fuera de `shared/supabase` y `shared/lib` (agregada). Tarea de la etapa 2: `bucketJson`. Hoy se mide: cada archivo se pide una vez al entrar. Vive en: `session/entry`. |
| 200 | perf: facultades y opciones sin descargas repetidas | prueba nueva | Una sola descarga de `_facultades.json` y `_opciones.json`. Vive en: `session/entry`. |
| 201 | perf: legal de la opcion en paralelo con sus datos | prueba nueva | El legal no espera a los datos de la opción. Vive en: `session/entry`. |
| 202 | arranque: la Opcion 1 no pisa a otra opcion | prueba nueva | La opción 1 que llega tarde no pisa imagen ni calibración. Vive en: `session/entry`. |
| 203 | ux: Ingresando con sesion guardada (sin el formulario) | prueba nueva | Con sesión guardada dice «Ingresando» y no muestra el formulario. Vive en: `session/entry`. |
| 204 | perf: imagenes de flyer con cache larga (solo nombres unicos) | prueba nueva | Sólo el archivo con hora lleva un año de caché; el de nombre fijo no. Vive en: `admin/options-and-cashback`. |
| 205 | perf: normalizaciones recordadas (promos y empresas) | regla de código | Técnica de rendimiento: TanStack Query y `shared/domain` en la etapa 2. El resultado se mide en `promotions/table-and-matching` (catálogo de 2.300). |
| 206 | perf: generacion en tanda sin pausas fijas | regla de código | Técnica de rendimiento: tarea de la etapa 3 (generación en tanda). El resultado está en `flyer-editor/batch-rules`. |
| 207 | perf: un solo armado del PDF (_fgPdfDe) | regla de código | Un solo armado del PDF: un módulo en `shared/flyer-engine` (etapa 3); los límites de carpetas de dependency-cruiser lo sostienen. |
| 208 | perf: canvas de alta resolucion reutilizado | regla de código | Técnica de rendimiento: tarea de la etapa 3 (`flyer-engine`). |
| 209 | perf: color de fondo de la vista previa recordado | regla de código | Técnica de rendimiento: tarea de la etapa 3 (`flyer-engine`); el resultado (mismo color) está en `drawing-rules`. Vive en: `flyer-editor/drawing-rules`. |
| 210 | exportes completos (sin el corte de 1000 filas) | prueba nueva | Registros, tablero, Cambios y Hunter con 2.300 filas. Vive en: `admin/exports-whole`. |
| 211 | seg: Edge Functions con supabase-js fijo (misma version que la app) | armado | «the functions of the server pin the library they import». Cuando la app instale supabase-js, comparar además que sea la misma versión. Vive en: `build/build-output`. |
| 212 | ingreso: un corte de red no cierra la sesion (tarjeta Reintentar) | prueba nueva | Corte de red: tarjeta Reintentar, sin cerrar la sesión. Vive en: `session/entry`. |
| 213 | ingreso: errores del login en castellano | prueba nueva | Errores en castellano y botón libre. Vive en: `session/entry`. |
| 214 | zip: masivo y padron sueltan la memoria (revoke) | prueba nueva | La memoria del ZIP se devuelve. Vive en: `flyer-editor/batch-rules`. |
| 215 | masivo: una fila o el ZIP que fallan no traban el boton | prueba nueva | Fila rota en `bulk-excel`; ZIP roto en `batch-rules`. Vive en: `flyer-editor/batch-rules` `flyer-editor/bulk-excel`. |
| 216 | ux: "Cargando..." se va apenas carga la opcion | prueba nueva | El aviso se va al llegar la opción. Vive en: `shell/layout-and-text`. |
| 217 | ux: tilde en Configuracion de Montos | prueba nueva | Se lee el título en pantalla. Vive en: `shell/layout-and-text`. |
| 218 | oscuro: boton de montos elegido legible | prueba nueva | Contraste medido en oscuro. Vive en: `shell/layout-and-text`. |
| 219 | pulido: menu del usuario sin pildoras naranjas | cubierto | Mide el menú del nombre. Vive en: `flyer-editor/visual-polish`. |
| 220 | pulido: oscuro legible (opcion elegida y logos de Promociones) | cubierto | Contraste medido. Vive en: `flyer-editor/visual-polish`. |
| 221 | pulido: boton apagado se ve apagado | cubierto | Opacidad medida. Vive en: `flyer-editor/visual-polish`. |
| 222 | pulido: una sola tipografia (sin Syne ni DM Sans) | prueba nueva | Tipografías medidas en pantalla. En React: `build-output`. Vive en: `shell/layout-and-text` `build/build-output`. |
| 223 | pulido: nombre de archivo sin "flyer" de relleno | cubierto | El nombre con marcadores vacíos. Vive en: `flyer-editor/visual-polish`. |
| 224 | pulido: Cambiar logos no abre con el flyer sin cargar | cubierto | No abre con el flyer sin cargar. Vive en: `flyer-editor/visual-polish`. |
| 225 | pulido: Activas sin contadores que siempre dan 0 | cubierto | Contadores de Activas. Vive en: `flyer-editor/visual-polish`. |
| 226 | pulido: Descargar en la pastilla del celular | cubierto | La pastilla toca Descargar PDF. Vive en: `flyer-editor/visual-polish`. |
| 227 | pulido: beneficio en Promociones (tabla y Excel) | cubierto | En pantalla en `visual-polish`; en el Excel en `table-and-matching`. Vive en: `flyer-editor/visual-polish` `promotions/table-and-matching`. |
| 228 | pulido: Promociones en tarjetas en el celular | cubierto | Tarjetas en el celular. Vive en: `flyer-editor/visual-polish`. |
| 229 | promos: Buscar trae todas las promos de cada marca (+ una sola fila por marca) | cubierto | Todas las promos y una fila por marca. Vive en: `promotions/search-brings-all-promotions`. |
| 230 | recorte: el flyer recortado sigue listo (editar, guardar y descargar) | cubierto | Editar y descargar el recortado. Vive en: `flyer-sections/cropped-stays-editable`. |
| 231 | promociones: puntito rojo y filtro de super con % (Activas y Buscar) | cubierto | Puntito y filtro en Activas y Buscar. Vive en: `promotions/percent-discount-marks`. |
| 232 | barra de flyers: 2 fijos + favorito + Otros (profiles.flyer_fav) | cubierto | Dos fijos, favorito y Otros. Vive en: `flyer-editor/option-bar-favorite`. |
| 233 | ventanas de marcas: puntito rojo y filtro de super con % | cubierto | Ventanas de marcas, y por zona. Vive en: `promotions/percent-discount-marks` `promotions/percent-discount-by-zone`. |
| 234 | pulido: Base de datos con explicacion plegable | cubierto | Plegada por defecto. Vive en: `flyer-editor/visual-polish`. |
| 235 | lupa: los puntos no cuentan al buscar (S.A. = SA) | prueba nueva | «S.A.» encuentra «SA» y al revés, en la lupa y en el Hunter. Antes sólo lo protegía el texto. Vive en: `company-registry/search-rules` `hunter/hunter-screen`. |
| 236 | ux: barra fija con Descargar PDF (PC) y tutorial al dia | prueba nueva | La barra queda a la vista al recorrer el formulario. Vive en: `shell/layout-and-text`. |
| 237 | ux: Pegar/Borrar con teclado y area tactil | prueba nueva | Enter los activa y miden lo que pide el dedo. Vive en: `flyer-editor/paste-officer` `flyer-editor/officers-card`. |
| 238 | ux: header del celular con logo y nombre completo | prueba nueva | Logo y nombre en 390 px. Vive en: `shell/layout-and-text`. |
| 239 | ux: interruptor de Oficiales (oculta sin borrar; historial y Restaurar) | prueba nueva | Oculta sin borrar; Restaurar lo prende; el historial lo recuerda. Vive en: `flyer-editor/officers-card` `flyer-editor/downloads-and-history`. |
| 240 | ux: traer una empresa de la base prende los oficiales | prueba nueva | Traer una empresa lo prende. Vive en: `company-registry/search-rules`. |
| 241 | ux: lo que se quita del padron va en rojo (y aviso si estan ocultos) | prueba nueva | Lo que se va en rojo; aviso si están ocultos. Vive en: `company-registry/update-after-download`. |
| 242 | ingreso: Reintentar no queda en Ingresando si leer la sesion no contesta | prueba nueva | Si leer la sesión no contesta, vuelve la tarjeta. Vive en: `session/entry`. |
| 243 | ux: oficiales ocultos = modificacion para el padron | prueba nueva | Ocultarlos cuenta como quitarlos. Vive en: `company-registry/update-after-download`. |
| 244 | ux: zoom en la Vista previa (Ctrl+ruedita, doble clic, pellizco) | prueba nueva | Ctrl + rueda, doble clic, teclas, arrastre que no cierra. El pellizco no se puede simular en este navegador: queda el mismo evento `wheel` con Ctrl. Vive en: `flyer-editor/preview-zoom`. |
| 245 | ux: vista previa sin texto de relleno (lo que se ve es lo que se baja) | prueba nueva | Campos vacíos no dibujan texto de relleno. Vive en: `flyer-editor/officers-card`. |
| 246 | ux: letra minima (nada < 11 px salvo simbolos) | regla de código | Tokens de `shared/ui` en la etapa 2. Hoy se mide en el navegador: nada por debajo de 12 px (11 en mayúsculas) en el armador y el panel. Vive en: `shell/layout-and-text`. |
| 247 | perf: un solo listener de resize (el de auth.js, con demora) | regla de código | Se mide: cambiar la ventana varias veces dibuja como una vez. En React: un solo `ResizeObserver` en el controlador del canvas (etapa 3). Vive en: `flyer-editor/drawing-economy`. |
