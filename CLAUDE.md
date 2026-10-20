# CLAUDE.md

Guía para cualquier herramienta de IA (o persona) que retome este proyecto. Está en español y sin datos personales ni claves, porque **el repositorio es público**.

---

## 1. Qué es este proyecto y para qué sirve

**Armador de flyers Galicia**: una página web (de una sola pantalla) que usa un asesor u oficial de banco para armar flyers de productos con sus datos (nombre, celular, mail, sucursal, empresa, montos de cashback, etc.). Los datos se pueden cargar a mano, pegar desde un texto copiado, traer de un padrón de empresas o cargar en masa desde un Excel. El resultado se baja como PDF o PNG.

Además tiene: login con roles, guardado de datos en la nube, buscador de promociones vigentes (Banco Galicia), perfil "Hunter" (busca una empresa y baja su flyer), gestiones comerciales (visitas, prospectos, altas) con tablero, panel de administración y mails de aviso.

**Quién lo usa:** el dueño del producto trabaja en el banco y **no es programador**. Piensa en lo que ve en pantalla, no en arquitectura. Ver sección 8.

---

## 2. Cómo está armado

No hay `package.json` ni gestor de paquetes. La única herramienta de armado es `_build.mjs`, que se corre directo con Node: `node _build.mjs`.

### Lo que se edita (frontend: todo corre en el navegador)

| Archivo | Para qué sirve |
|---|---|
| `_source.html` | Plantilla del HTML/CSS/estructura. **Es el que se edita**, nunca `index.html`. El dueño a veces la regenera entera, por eso la lógica que debe sobrevivir va en `auth.js`. |
| `_newcss.txt` | Estilos extra que el armado inyecta sobre `_source.html` (incluye el diseño "premium" y las paletas de color). |
| `auth.js` | Casi toda la lógica: pantalla, login, llamadas a Supabase, motor que dibuja el flyer, calibrador, padrón, promociones, tutorial, tema claro/oscuro, parseo de texto pegado. JavaScript plano, sin transpilar. |
| `gestiones.js` | Módulo aparte de Gestiones comerciales; se baja solo cuando hace falta. |
| `_build.mjs` | Genera los archivos de salida y corre **chequeos de contrato** (si uno falla, no escribe `index.html`). |

### Lo que se genera (NO editar a mano)

- `index.html` → producción (lo sirve GitHub Pages). Enlaza `auth.js?v=<hash>`.
- `index_export.html` → misma app con `auth.js` incrustado, para usarla suelta desde cualquier lado.
- `flyer_default.jpg` → imagen de ejemplo que se carga si no hay flyer activo.
- `version.json` → hash del armado; la app lo compara y avisa "hay versión nueva". Sin guion bajo a propósito: GitHub Pages no sirve archivos que empiezan con `_`.
- Las librerías de exportación (jsPDF, xlsx, JSZip, ExcelJS) no van en el `<head>`: `auth.js` las baja bajo demanda con verificación de integridad. Si se agrega una función que use alguna, hay que envolverla en `_libInit`.

### Backend (carpeta `supabase/`)

- `functions/auth-admin/` → Edge Function (Deno) con las operaciones privilegiadas (altas, claves, aprobaciones, auditoría, mails). Usa una llave de servidor que **el navegador nunca tiene**.
- `functions/promos-galicia/` → Edge Function puente hacia la API de promociones del banco.
- `migrations/001…023_*.sql` → estructura de la base y reglas de acceso (RLS). Se aplican **a mano, en orden**.
- `INVENTARIO_RPC.md` → qué funciones expone la base, a quién y qué valida cada una. Revisarlo al agregar una función `security definer`.
- `mail/apps-script.gs` → código del Gmail de la app (envío de avisos).
- `_runsql.mjs` / `_deployfn.mjs` → ayudantes para correr SQL y para publicar una Edge Function.
- `_verify_*.sql` → consultas de verificación de permisos.

### Regla de separación

- UI, estado de pantalla, formato de datos pegados, tema → `auth.js` / `_source.html`.
- Credenciales privilegiadas, reglas de acceso a datos, lógica que no debe verse en el navegador → `supabase/`.

### Archivos que NO son parte del proyecto activo

`_backup_*` (copias puntuales), `deploy.zip`, `deploy_new.zip`, `_authjs.txt` (copia vieja de `auth.js`), `*.pptx` (presentaciones), `scratchpad/` (pruebas y parches de una sola vez; está en `.gitignore` y queda sólo en la PC).

---

## 3. Servicios conectados (sin claves)

| Servicio | Qué se usa |
|---|---|
| **Supabase** | Base de datos con reglas de acceso por usuario (RLS), login, almacenamiento (bucket público donde viven flyers, legales, padrón, configuraciones en archivos `.json`) y las 2 Edge Functions. La dirección del proyecto y la clave **pública** están dentro de `auth.js` (es normal y está pensado así). |
| **GitHub** | Repo `flyergalicia/flyer-galicia` (cuenta de trabajo, autor de commits neutro). **GitHub Pages** publica el sitio: https://flyergalicia.github.io/flyer-galicia/ (se actualiza solo 1-2 min después de subir). El repo debe seguir siendo público (en plan gratuito, privado apaga Pages). |
| **Gmail + Apps Script** | Una casilla Gmail propia de la app manda los mails de aviso (registro, aprobación, cambio de clave). Se llama desde la Edge Function `auth-admin`. 100 mails/día gratis. |
| **API de promociones de Galicia** | Pública; la consulta la Edge Function `promos-galicia` y guarda copia en la base. |
| **CDN de librerías / Google Fonts** | pdf.js, jsPDF, xlsx, JSZip, ExcelJS, Figtree. Cada una con hash de integridad (SRI) y permitida en la política de seguridad (CSP) que inyecta `_build.mjs`. Si se suma un origen nuevo, hay que agregarlo a la CSP o el navegador lo bloquea en silencio. |

### Dónde viven los secretos (nunca en el repo)

- **Secretos de las Edge Functions** (se cargan en Supabase): `ADMIN_SECRET`-derivado para cifrar pedidos de clave, `MAIL_HOOK_URL`, `MAIL_HOOK_SECRET`, `MAIL_ADMIN`, y la llave de servidor de Supabase.
- **Token personal de la API de gestión de Supabase** (para correr SQL y publicar funciones): lo tiene el dueño (panel de Supabase → Access tokens). Los scripts lo leen de la variable de entorno `SB_TOKEN`. **Pedírselo al usuario y pasarlo por entorno; no escribirlo en ningún archivo.**
- **GitHub**: se autentica con el administrador de credenciales del sistema (inicio de sesión por navegador). Nunca poner un token dentro de la URL del remoto.
- Remoto `oldorigin` = repo viejo de una cuenta personal, **congelado: no tocar** salvo pedido.

---

## 4. Qué se hizo hasta ahora (resumen)

- **Armador completo:** motor que dibuja el flyer sobre una imagen base (se ajusta solo al tamaño real), hasta **4 oficiales** (el flyer crece), recorte del blanco inferior, legales editables con negritas y marcadores `{importe}`, PDF/PNG, historial, modo Masivo por Excel, zoom con Ctrl+rueda.
- **Subir un flyer = PDF limpio + calibrador visual** (se arrastran las zonas; no hace falta rearmar el HTML cada mes).
- **Varias "opciones" de armador** configurables (flyer genérico, por rubro combustible/súper, sueldo, etc.), cada una con su flyer y legal. Solo el admin ve el selector.
- **Padrón de empresas** (Excel → búsqueda por razón social/CUIT con lupa y autocompletado; completa cashback y oficiales; avisa si el flyer no corresponde al rubro; propone actualizar el padrón al descargar). Privado por usuario con reglas de acceso.
- **Pegar datos del oficial** (⚡ Pegar): extrae nombre, celular y mail de un texto desordenado, garantizando que no se altere ningún dígito.
- **Buscador de Promociones** de Galicia: valida qué marcas del flyer siguen vigentes; exporta a Excel.
- **Perfiles:** admin, VIP, asesor, Hunter, Líder, Prospect (cuenta de prueba). Facultades por perfil que el admin enciende/apaga.
- **Gestiones comerciales** (visitas, prospectos, altas, tablero) — **en prueba**, sólo admin y cuentas de prueba.
- **Mails de aviso** con diseño propio; freno al reemplazar el Excel de empresas (muestra qué se va/entra/cambia).
- **Diseño:** estilo "premium", 4 paletas (la elegida: Marfil), modo oscuro, tutorial guiado.
- **Rendimiento (oct-2026):** ingreso 3-4 veces más rápido, Validar promos y Masivo sin trabas, reglas de base 15-50 veces más rápidas, Excel sin corte en 1000 filas.
- **Seguridad (oct-2026):** funciones de la base cerradas a visitantes, registro directo de Supabase cerrado (el alta pasa siempre por `auth-admin`), pedido de clave que **no bloquea** la cuenta y se guarda cifrado, tope por IP, tabla de auditoría (Admin → Auditoría), escape de todo texto ajeno (contra XSS), CSP + SRI.
- **Revisión Claude + Codex + Gemini (15-oct-2026):** barra fija "Vista previa · Descargar PDF · Otros" al pie del panel en PC; letra mínima 12 px en toda la interfaz (11 px en rótulos en mayúscula); logo y nombre completo en el header del celular (y arreglo del header entre 481 y 900 px); un corte de red al entrar ofrece Reintentar sin cerrar la sesión; errores del login en castellano; los ZIP del Masivo/padrón se liberan de la memoria y un error no traba el botón; la lupa ignora los puntos (S.A. = SA). El 16-oct: interruptor "Mostrar en el flyer" en el título de Oficiales (oculta todos sin borrar) y zoom en la Vista previa. Descartado a pedido del dueño: corrección de montos con formato de celda con decimales, PNG masivo con menos memoria y flechas del calibrador.
- **Promociones (16-oct-2026):** Galicia mudó su API de `catalogo/v1` a `personalizacion/v1` y la vieja da 403 a todos (no era un bloqueo a nosotros; pedirle algo al banco no es opción). La Edge Function `promos-galicia` prueba la ruta nueva y la vieja de respaldo (tabla `RUTAS`), usa los filtros `provincia`/`localidad` en minúscula, normaliza la fecha "Desde" (viene DD/MM/AAAA), pagina por `totalSize` y no pisa la copia guardada si llega menos de la mitad. Desde el mismo día se actualiza sola **todos los días a las 9** (pg_cron + pg_net, migración 024, clave `PROMOS_CRON_SECRET` en la función y `promos_cron_secret` en el Vault); la app ya no se actualiza al abrir la solapa ni al no encontrar una marca (queda el botón). Si vuelve a fallar: mirar qué rutas usa hoy beneficios.galicia.ar (bundle `pages/index-*.js`, bloque `personalizacion_v1`). Además: si falla la actualización de las 9 llega un **mail al admin** (mismo Gmail de la app que auth-admin); etiqueta **"Nueva"** (columna `primera_vez`, últimos 7 días) con el tilde "Sólo las nuevas" en Activas; estado **"Próximamente"** con "Empieza el dd/mm" (`proximamente`, `fecha_desde`; migración 025). Entre dos promos de la misma marca se prefiere la vigente (`_promoMejorQue`).
- **Cambiar logos + Estudio (16-oct-2026):** botón **Cambiar logos** en la vista previa: tocar un logo lo detecta solo en la imagen base (sin calibrar; junta partes a menos de `_FG_LG_GAP` px) y se reemplaza por una marca del catálogo de Promociones, un logo subido de la PC, un texto (Figtree; la letra sugerida sale de los renglones del original) o se mueve/agranda el mismo logo (`orig:x,y,w,h`). Arrastrando se marca un recuadro a mano (avisa si corta otro dibujo). Es temporal: viaja en `v.logos`. Solapa **Estudio** (facultad `estudio`, apagada por defecto salvo admin): cada uno guarda sus diseños en la tabla `flyer_disenos` (migración 026, RLS dueño/admin + trigger `flyer_disenos_guardia`), los reusa y pide publicarlos; el admin ve todos y **Aprobar y publicar** crea una opción nueva en la misma solapa con la imagen ya modificada, el legal y la calibración de la original, las mismas facultades y `rubro:'ninguno'`. Revisado por Codex (carreras de estado, doble publicación, número ocupado: corregido). Mismo día: **"Usar"** abre el diseño como **pestaña de prototipo** en la barra de opciones (al lado de su flyer base, con el nombre del diseño; vive en memoria hasta recargar, `_fgProtos`, con `_fgProtoTurno` para que tocar rápido no aplique uno viejo), y **"Desactivar"** un flyer pide confirmación (la variante "PRUEBA" quedó sin imagen por ese botón y se veía "con formato mal"; se arregla con "Activar" de su imagen en Config → Flyers). **Armar franja** (botón en la barra de Cambiar logos): se marca con un recuadro toda una franja de logos, se tildan marcas de Promociones en orden (↑ ↓ ×, vista previa en vivo) y la app tapa la franja y los acomoda en filas (automático = mismas filas que el original, repartidos parejo; o N por fila). Una entrada `franjaBase` tapa la franja y cada logo es un cambio común con el mismo `franja`; volver a marcar la misma zona retoma la selección. No repone los textos de días de la franja de súper (ahí conviene logo por logo). Las dos ventanas de marcas (un logo y Armar franja) usan los filtros de "Activas" (`_fgPfFiltrar`): provincia, **localidad** (se pide a Galicia por la Edge Function y se cachea en `_fgLocIds`; si falla se avisa y se reintenta), **una por marca** (`_promoBaseMarca`/`_promoClaveMarca`) y **sin las online**; con provincia, las locales van primero y las online llevan la etiqueta "Online". Desde Armar franja, **"Elegir en pantalla completa"** lleva a Promociones → Activas con esos filtros (`_fgElegir`): la primera columna pasa a ser un botón **+** con el número de orden y una barra (arriba en PC, fija abajo en el celular) tiene "Volver a la franja" (reabre la ventana con lo elegido) y "Cancelar"; si el flyer cambió mientras tanto, se pide marcar la franja de nuevo y lo elegido se conserva (`_fgFr.pendiente`). El **+** también está en la solapa **Buscar** (pegar marcas, validar y elegir); vencidas y de otra provincia lo muestran apagado, y cambiar la coincidencia de una fila "Revisar" reemplaza la elegida. En la vista previa de la ventana cada logo se toca y se arrastra, con su tamaño y "Tamaño de todos" (`s.dx/dy/k`, `st.kt`, `_fgFrAjustar`; se guardan en la franja y vuelven al retomarla). Mejoras de Gemini aplicadas (3, 5 y 7 de su lista del 16-oct): ventana de texto con "← Elegir una marca" arriba, Cancelar/"Poner el texto" abajo y colores con tilde; pestaña de prototipo con el estilo de las demás; la ayuda del modo se va a los 7 s (salvo en modo franja) y la barrita de ajuste vive al pie de la vista previa (sticky), no al lado del logo. Propuestas de Gemini evaluadas y NO hechas: Deshacer/Rehacer, completar la franja con las promos de la localidad en un clic, Armar franja en 2 pasos en el celular; descartadas (ya existían o es otra pantalla): vista previa liviana, chips de Promociones, estado "en revisión" en Estudio. **"Tu selección" se ordena arrastrando** (`_fgFrDragInit`: con el mouse desde la fila, con el dedo desde el agarre ⠿; las flechas siguen). **19-oct-2026:** la ventana Armar franja pone la vista previa **arriba, a todo el ancho y con tamaño fijo** (`st.prevW`: se mide sólo al abrir, al cambiar el tamaño de la ventana o con "Ampliar vista previa", que se esconde si no agranda), con un circulito con el número de orden en cada logo; "Tu selección" lleva la miniatura de cada marca y queda sincronizada con la vista previa (tocar una fila marca el logo y al revés; el marcado sigue al logo al reordenar, `_fgFrSelMarcar`). En el celular la vista previa queda fija arriba al recorrer. En Cambiar logos: **Deshacer / Rehacer** de a un paso (botones y Ctrl+Z / Ctrl+Y; `_fgLgHist`): no se marcan los pasos a mano, `_fgLgListo` compara la lista con el paso actual 450 ms después del último toque (un arrastre o una tanda de + es un paso) y el nombre sale de comparar las copias; se reinicia al cambiar de flyer, en `_fgLgLimpiar` y al abrir/cerrar un prototipo. El diseño abierto ya no se suelta cuando la lista queda vacía. Botón **Ver limpio** (`fgLgLimpio`): esconde marcos, barrita y botones y el flyer no responde a toques; Escape o "Seguir editando" vuelven. **19-oct (2):** Armar franja en automático reparte las marcas en **las mismas filas que el original** (20 en una franja de 2×7 → 2 filas de 10) y sólo suma una fila si por fila quedarían más de 1,5 veces las originales; esa fila nueva se reparte dentro de la zona donde estaban los logos, no en todo el recuadro (antes pisaba el título y el texto de abajo; diagnóstico coincidente con Gemini). **Shift + clic** elige varios logos (en el flyer: `_fgLg.grupo`, `_fgLgElegidos`; en la vista previa de la franja: `st.grupo`, `_fgFrElegidos`) y se mueven, agrandan, centran y vuelven a su lugar juntos; **Shift + recuadro** en un lugar libre elige todos los que toca. Deshacer suelta lo elegido. **19-oct (3):** **Guías con imán** al arrastrar (`_fgLgGuias`: bordes y centros de los demás logos, centro del flyer y centro del lugar original; 6 px de pantalla; Alt = sin imán). Con 2 o más elegidos la barrita suma **Arriba / Al medio / Abajo / Repartir (3 o más) / Mismo tamaño**, tomando como referencia al último tocado. **Duplicar** (botón o Ctrl+C / Ctrl+V; la copia lleva `dup:true`, no tapa nada y su lugar original es donde cae) y **Supr** / tacho = volver lo elegido al original. **Recortar (19-oct):** botón en la barra de Cambiar logos; se arrastra sobre una franja horizontal y se quita (lo de abajo sube y se une; los bordes se ajustan ±25 px a las dos filas más parecidas, `_fgRecMejorUnion`). Mismo truco que el calibrador: `window.baseImg` pasa a ser la imagen recortada (`_fgRecArte`) y `window.FLYER_CFG` la calibración corrida (`_fgRecCfg`: lo anclado arriba que queda debajo del corte sube, lo anclado abajo que queda arriba del corte se compensa, lo de adentro se apaga con `off`). Si se va la zona de importes: no se dibujan, el legal no los inyecta (`_fgSinImportes`) y la tarjeta de Montos se esconde. Temporal (cambiar de opción lo suelta en `_fgApplyOption`); se guarda en Estudio (`datos.recortes` y `datos.legal`) y al aprobar nace la opción "sin cashback" con la imagen recortada, los importes apagados y el legal del diseño. **Restaurar** también vuelve el flyer entero (`fgResetVals` → `_fgRecOlvidar`). Traer con la lupa una empresa **con** cashback a un flyer sin importes muestra el cartel "Esta empresa tiene cashback" (`_padAvisoSinImportes`): "Mostrar los importes" quita el recorte o vuelve a la opción original (`cfg.recDe`, que la opción publicada guarda al nacer). **Borradores (19-oct):** el primer cambio sobre el flyer original (recorte, logo o texto) se muda solo a una pestaña **"Borrador N"** al lado (`_fgBorradorAuto`, desde `_fgLgListo` y `fgRecAplicar`); el original queda limpio. **+ Nuevo borrador** (`fgBorradorNuevo`) abre otro desde el flyer limpio. Son prototipos sin fila en Estudio (`p.temp`, pestaña punteada): guardan logos, recortes, legal y logos subidos al ir y venir; cerrar uno con cambios pide confirmación; **Guardar en Estudio** lo convierte en diseño (la pestaña toma su nombre). Viven hasta recargar la página. La lupa dentro de un borrador o diseño no borra sus cambios; Restaurar vuelve al original y el borrador conserva lo suyo. **19-oct (4):** Deshacer también deshace un **recorte** (cada paso guarda logos y recortes; la clave es la imagen entera, `_fgLgHistClave`). El **historial** guarda recortes y logos (`v.recortes`, `v.recBase`): volver a descargar sale igual (`_fgConRecortes`) y cargar lo abre en un borrador (`_fgHistDiseno`). **Armar franja en el celular** va en dos pasos (Elegir marcas / Ordenar y ver; en la PC no cambia). **Estudio:** "Ver completo" (`_estArmarImagen`, la misma imagen que se publicaría) y aviso por mail al admin al pedir publicación. **20-oct:** **Marcas vigiladas:** el admin carga las marcas de cada flyer desde Promociones → Buscar ("Vigilar estas marcas en…", `_vigBarraBuscar`) y las de los logos publicados desde Estudio se suman solas (`_vigSumarEstudio`, `origen:"estudio"`); viven en `_vigilar.json` del bucket y se ven/quitan en Admin → Config → **Marcas vigiladas** (`_vigEstado`: vigente, vence en ≤7 días, sin promo vigente). La Edge Function `promos-galicia` las revisa después de cada actualización (la de las 9 y la manual: `revisarVigiladas`/`evaluarVigiladas`) y manda **un** mail si hay algo vencido o por vencer (firma en `_vigilar_aviso.json`, no se repite mientras no cambie). **Borradores guardados en la PC** (`localStorage` `fg_borradores_<id>`, 1 s después del último cambio; tope ~2 MB sin logos subidos): al entrar se ofrece Recuperar / Descartar (`_fgBorrOfrecer`). **Sugerir marcas** en Armar franja (`_fgFrSugerir`): completa los lugares con vigentes de la zona, una por marca, rubros por turnos, las que vencen más tarde primero y +peso a las Nuevas; marcadas con ✨ y "Quitar sugeridas". **Admin → Uso** (`_usoCargar`): flyers por flyer, perfil, semana y top 10, más lo de Estudio, desde `flyer_logs` (30/90 días/año). **20-oct (2), franjas que se pisaban:** una franja se **retoma** sólo si el centro de lo marcado cae adentro de una ya armada (antes alcanzaba con pisarla más de la mitad y una franja nueva de abajo se mezclaba con la de arriba); si no, el recuadro se **recorta** para no meterse en la otra. Al aplicar, los logos de **otra** franja nunca se borran y lo de antes en la zona se quita también por donde está dibujado (sin residuos). Retomar arma la selección con lo que la franja tiene hoy (`_fgFrSelActual`: no vuelven logos borrados o reemplazados). **Sugerir marcas** respeta el rubro elegido y, con provincia o localidad, no trae las online. **20-oct (3):** los **recuadros punteados** de Cambiar logos ya no se ven en reposo: con el mouse sobre el flyer aparecen tenues y el de abajo del mouse entero (`_fgLgCerca`, clase `cerca`), el elegido sigue sólido, el recién cambiado parpadea 1,3 s (`_fgLgMkFlash`) y en pantallas táctiles quedan tenues siempre. **Mover un logo del propio flyer** (`orig:`) ya no lo deforma: el recorte de la imagen base no se achica a la tinta (`_fgLgLimpiarLogo(c,true)`), porque se dibuja en la caja del recuadro original y se estiraba (pasó con La Anónima). **Logos subidos nítidos:** un PNG que ya trae fondo transparente no se "limpia" desde los bordes (se comía las letras claras y dejaba el contorno dentado, pasó con Toledo); sólo se le saca un recuadro blanco grande de adentro (`_fgLgSinParche`). Al limpiar un fondo opaco los bordes quedan suaves (transparencia según el parecido al fondo). Al subir se achica de a la mitad (`_fgLgAchicar`), los logos se dibujan con `imageSmoothingQuality='high'` y un logo casi todo blanco avisa (`_fgLgEsBlanco`). **Logo con fondo oscuro** (el Toledo del catálogo es "Toledo" blanco en un cuadrado azul): sacarle el fondo dejaba letras blancas invisibles; ahora, si lo de adentro es claro, se pinta del color del fondo y el cuadrado se va; si tiene colores, el cuadrado queda entero (prueba t54 con el PNG real en `pruebas/datos/logo_toledo.png`).

---

## 5. Qué quedó pendiente o a medias (en orden de prioridad)

1. **Probar el alta de usuario desde Admin → Usuarios → Nuevo usuario** (chequeo de un minuto): confirma que el alta funciona con el registro directo cerrado. Si fallara, reabrir el registro con `disable_signup=false` y avisar.
2. **Probar un mail de aviso real de punta a punta** (por ejemplo un cambio de clave de la cuenta Prospect). Hasta hoy sólo se probó un mail de prueba.
3. **Gestiones:** desde el 20-oct los prospectos se separan por **paquete** (Caja de Ahorro, Plus, Plus Gold, Eminent Platinum, Eminent Black; `GES_PAQ` en `gestiones.js`, columna `paquete`, migración 027), no por rango de renta: a los hunters se los mide por los paquetes que captan. El tablero muestra "Altas por paquete" y, debajo de cada hunter, sus altas por paquete; el Excel también. La columna vieja `renta` queda sin uso. **No pasar Gestiones de "prueba" a "on" sin que el dueño lo pida.**
4. **Puesta en marcha que sólo puede hacer el dueño con su sesión:** crear las opciones nuevas (Rubros, Sueldo, "Ambos") en Config → Opciones, subir cada PDF limpio, calibrar, cargar legales y habilitar en Facultades.
5. **Variante de flyer "sin cashback":** se arma con **Recortar** + Estudio; al aprobarla queda vinculada a la original (`sinCB` en la lista de opciones) y desde ahí **se elige sola**: lupa, "Generar flyers" del padrón y Masivo mandan cada empresa sin cashback a esa versión y las que tienen cashback a la original. Falta que el dueño la cree y la habilite por perfil.
6. **Opciones sin imagen real** en la base (las "VIEJO…" y "Sin cashback"): si se elige una, sale descentrada. Cualquier código que elija una opción debe verificar que tenga imagen.
7. **Contraseñas filtradas (HIBP):** requiere plan Pro de Supabase. Alternativa gratis: lista de claves comunes en la app.
8. **"Volver a como estaba"** del Excel de empresas (propuesto, usando un registro de cambios).
9. **Ideas propuestas y no elegidas:** Deshacer al restaurar, avisos con tipo/acción, mini vista previa fija en celular, esqueletos de carga, app instalable (PWA), vista previa de la primera fila del Masivo.
10. **Paneo horizontal con zoom alto:** el canvas no puede ser más ancho que el panel (CSS heredado de `_source.html`). No se tocó por ser cambio de diseño en producción sin poder verlo logueado.
11. **Calibrador:** los ajustes finos de oficiales por sede (`ehS`, `titH`, `ewS`) viven en la configuración pero no tienen campos en pantalla.
12. **Opcional:** dar de baja el repo viejo personal.
13. **Aprobar en Estudio con dos admins a la vez** puede pisar la lista de opciones (mismo límite que Config → Opciones: es un archivo). Hoy hay un solo admin; si eso cambia, mover la lista a una tabla.
14. **Estudio recién publicado:** prenderlo por perfil en Facultades cuando el dueño decida. Hecho el 19-oct: mail al admin cuando llega un pedido (acción `notify_estudio_pedido` de `auth-admin`; hay que publicar la función) y "Ver completo" antes de aprobar.

---

## 6. Decisiones importantes y por qué

- **Todo lo durable va en `auth.js`**, no en `_source.html`: el dueño regenera la plantilla seguido y se perdería.
- **El formulario arranca vacío** (sin datos de ejemplo): cada uno carga lo suyo o usa asesores guardados.
- **El padrón manda:** una empresa sin oficiales asignados limpia los campos en vez de arrastrar los del flyer anterior. **La razón social es la clave, no el CUIT** (dos grupos distintos pueden compartir CUIT). El padrón **no** se retroalimenta solo con los flyers: la fuente de verdad es el Excel del dueño.
- **El mail del oficial se toma sólo si viene con arroba y textual** al pegar: en el banco muchos mails no derivan del nombre y deducirlo inventaba un dato.
- **Sin cashback se marca desde el padrón** (celda vacía o "SIN"), sin agregar opciones en el armador.
- **Zoom sólo con Ctrl + rueda** (la rueda sola recorre el flyer).
- **Atajos nuevos con Alt, no Ctrl+letra** (en el navegador del dueño Ctrl+G busca en internet).
- **Repo público a propósito** (Pages gratis). Por eso: `scratchpad/`, capturas de pruebas (`.playwright-mcp/`), backups y presentaciones están en `.gitignore`, y nada personal se versiona.
- **Facultad "guardar historial y borrador" apagada por defecto** para asesores; el admin la enciende por perfil.
- **El alta de usuarios pasa siempre por la Edge Function** `auth-admin` (exige mail del banco). El rol nunca se toma de los datos del registro.
- **Pedido de cambio de clave no bloquea la cuenta** (si no, cualquiera con el mail ajeno podía dejar afuera a alguien). La clave pedida se guarda cifrada hasta que el admin aprueba.
- **Los mails de aviso nunca llevan la clave ni links**, y un mail que falla nunca hace fallar la operación.
- **Subir un Excel de empresas nunca reemplaza sin mostrar antes el resumen** (salvo la primera carga).
- **Rendimiento:** se probó y descartó cachear la imagen achicada, partir/minificar `auth.js` o bajar la calidad JPEG (poca ganancia o afecta lo impreso). No reintentar sin medir distinto.
- **Hallazgos de revisiones externas ya descartados** (no "arreglar" de nuevo): inyección de fórmulas en Excel (todo es `.xlsx` de texto), XSS en historial (ya se escapa), librerías sin SRI (ya lo tienen), limpiar `localStorage` al salir (rompería el historial por usuario).

### Invariantes (lo acordado que ya se rompió una vez por un cambio en otra parte)

1. El zoom se ancla donde está el mouse → usar `redrawNow()`, nunca `redraw()` (que difiere el dibujado).
2. El aviso de "flyer equivocado" sale **siempre** al traer una empresa desde la lupa o el autocompletado.
3. Todo lo que se oculta por rol se tiene que volver a mostrar en el mismo lugar (si no, el admin se queda sin armador al salir de la vista previa de Hunter).
4. **Un flyer nuevo siempre es una dirección nueva** (`?v=<hora>`): la imagen se cachea 1 h. Nunca re-subir con el mismo nombre.
5. Los JSON del bucket se leen **sólo** con `_bucketJson` (un único `fetch` al bucket en todo `auth.js`).
6. Un dato que llega tarde para una opción no pisa a la opción que ya está activa.
7. Lecturas de más de 1000 filas se paginan con `_sbTodo`.
8. En reglas de base nuevas, `auth.uid()`, `is_active()`, `get_my_role()` y `gestiones_on()` van envueltas en `(select …)`.
9. Funciones SQL nuevas nacen **sin** permiso para visitantes; para que las use la app con sesión hay que darles `grant execute … to authenticated`. Toda `security definer` lleva `set search_path = public`.
10. Toda columna nueva de `profiles` que use el cliente se agrega al `select` de `checkProfile` (hay chequeo en el armado).
11. Todo camino nuevo que muestre el formulario de ingreso debe llamar antes a `_bootFin()` (si no, queda escondido tras "Ingresando…").
12. Todo texto que escribió otro usuario se pinta con `_escHtml`; en un `onclick` van sólo ids, nunca texto.
13. Los teléfonos se detectan por grupos de dígitos (no con una expresión glotona) y el CUIT se tapa antes. No volver a `cfgIdx` directo para el cashback del Excel: usar `_padCfgParse`.
14. Al insertar texto arbitrario con `.replace`, pasar siempre una función (un `$'` duplicó el HTML una vez).
15. **Letra mínima 12 px (11 en rótulos en mayúscula)**: ninguna regla ni estilo en línea nuevo por debajo (hay chequeo en el armado). Lo que pisa a `_source.html` va en el bloque "B2" **al principio** de `_newcss.txt`: al final pisaba reglas propias (el textarea de 16 px del celular, que evita el zoom del iPhone).
16. La vista previa dibuja **exactamente lo que se descarga**: nada de textos de relleno (el dueño rechazó el "Nombre de la empresa" en gris el 16-oct-2026; hay chequeo).
19. **Interruptor de Oficiales** ("Mostrar en el flyer", en el título de la tarjeta; `_fgOficialesOn`): apagado, ningún oficial en el flyer y la tarjeta los esconde con la clase `fg-of-off` **sin borrar nada**. La barrita vieja del Asesor 1 queda en el DOM (escondida): `_fgBlock` necesita la tripleta `.sec → .toggle-row → campos`. El historial/borrador lo guardan como `v.sinOficiales`; Restaurar lo prende, y **traer una empresa de la base (lupa o autocompletado) también lo prende** (`_padApply`): el interruptor es sólo para el flyer en curso. El masivo, el padrón y el Hunter no lo usan. **Ocultar los oficiales cuenta como una modificación** (pedido del dueño): al bajar una empresa de la base con el interruptor apagado sale el aviso "Actualizar mis empresas" con "Oficial N: − nombre (se quita)" (`_padFormAsesores` los toma como vacíos).
20. Zoom de la Vista previa (`_fgMZInit`): 100 % = el flyer entero en la PC (al ancho en el celular); Ctrl + ruedita (la rueda sola recorre), doble clic, pellizco, arrastre y teclas + − 0. Un arrastre que termina afuera no cierra la ventana.
17. Los botones Vista previa / Descargar PDF / Otros viven en `#fg-dock` en la PC y vuelven a `.btns` en el celular (`_fgDockUbicar`): todo lo que los busque (tutorial incluido) va por id o por `#tab-individual`, nunca por `.btns .btn…`.
22. **Recortar** cambia `window.baseImg` y `window.FLYER_CFG`: todo lo que los reemplace tiene que llamar antes a `_fgRecOlvidar()` (si no, queda la imagen entera con la calibración corrida o al revés).
21. **Cambiar logos:** el dibujo de los cambios va en dos pasadas (primero se tapa todo, después se dibuja) y sólo si `v.logosSrc` es la imagen actual; el masivo, el padrón y el Hunter no lo usan. Traer una empresa con la lupa limpia los cambios salvo que haya un diseño de Estudio o un borrador abierto (`if(!_fgProtoActivo())_fgLgLimpiar()` en `_padApply`). Al publicar, los archivos de la opción nueva se nombran a mano (`'_active'+n2+'.json'`): `_activeFile(n)` pasa por `_optN` y con un número que todavía no existe devuelve la 1 y la pisaría.
18. Un error **pasajero** al leer el perfil (sin red, 5xx, 408, 429) NO cierra la sesión: tarjeta Reintentar (`_fgIngresoSinRed`). Sólo una respuesta real (perfil inexistente, inactivo, pendiente) la cierra.

---

## 7. Cómo se prueba y se ejecuta

**Armar y publicar**

1. Editar `_source.html`, `_newcss.txt` y/o `auth.js` (y `supabase/` si aplica).
2. `node _build.mjs` → regenera `index.html` e `index_export.html` y corre los chequeos de contrato. Si algo falla, **no** escribe nada.
3. Si se tocó `supabase/functions/*`, publicarla aparte con `supabase/_deployfn.mjs` (necesita `SB_TOKEN` en el entorno).
4. Si hay una migración nueva, aplicarla con `supabase/_runsql.mjs <archivo.sql>` (necesita `SB_TOKEN`) y verificarla con los `_verify_*.sql`.
5. `git add -A && git commit && git push origin main` → GitHub Pages se actualiza solo. **Pedir confirmación al usuario antes de subir.**

**Probar**

- Abrir `index.html` por `http://localhost` (**no** por `file://`: la política de seguridad no lo permite) con cualquier servidor estático.
- La app necesita login real de Supabase; para probar pantallas sin sesión se hacía un "bypass" desde pruebas automáticas (Playwright) seteando el estado a mano.
- **Pruebas automáticas: viven en `pruebas/`** (Playwright + nube simulada, sin tocar Supabase). Correrlas con `node pruebas/correr.mjs` después de `node _build.mjs` (o sólo algunas: `node pruebas/correr.mjs t39 t41`). Ver `pruebas/LEEME.md`. Toda funcionalidad nueva suma su prueba ahí. Las capturas quedan en `pruebas/capturas/` (fuera del repo). Los logos se bajan de galicia.ar: sin internet algunas fallan, y alguna puede fallar por tiempos de red (repetirla sola antes de buscar un bug).
- **Si el usuario dice "no veo el cambio":** antes de buscar un bug, mirar qué versión sirve producción (`curl` a `index.html` y `auth.js`) y sugerir Ctrl+F5. GitHub Pages cachea 10 min.
- Cuando algo no se pueda ver logueado desde la sesión, **decirlo** y pedirle al usuario que lo revise en vivo.

---

## 8. Reglas y preferencias del usuario

- **Responder siempre en español, claro y sin jerga.** Nombrar las cosas como se ven en pantalla ("la lupa del buscador", "el botón Pegar"), no por el nombre de la función.
- **Preguntarle sólo decisiones de producto** (qué ve cada perfil, cómo se llama una solapa). Las decisiones técnicas se resuelven solas y se cuentan en una línea. Si un detalle técnico lo afecta, explicarlo con una analogía corta **antes** de preguntar, y decir si tiene que hacer algo.
- **No romper lo que ya funciona.** Es exigente con la estética y con la experiencia de uso. Invertir en verificar y decirle qué se verificó y qué no se pudo ver.
- **Antes de arreglar hallazgos de otra IA, comprobarlos contra el código** (hay falsos positivos).
- **No subir a GitHub ni pasar nada a producción sin su confirmación**; no encender funciones en prueba (Gestiones) por cuenta propia.
- **Quiere ver antes de decidir** (propuestas visuales, tutorial automático apagado hasta que lo apruebe).
- **Prioriza fluidez en las PC de sucursal:** nada pesado en lo visual.
- **Privacidad:** identidad de trabajo separada de la personal. Autor de commits neutro; no versionar nombres, mails ni capturas con datos reales.
- **Claves:** nunca pedirlas por chat ni escribirlas en archivos o commits; viven en variables de entorno.
- **Orquestación con otras IA (preferencia global del usuario):** Claude resuelve solo por defecto; deriva a Gemini sólo para imágenes o segunda opinión con contexto largo, y a ChatGPT (Codex) sólo para revisión, siempre en modo lectura. Avisar en una línea por qué antes de derivar; si falla por cupo o login, decirlo sin inventar el resultado.
