# CLAUDE.md

**Armador de flyers Galicia**: una app web con la que asesores y oficiales del banco arman flyers de productos con sus datos y los bajan en PDF o PNG. Además tiene padrón de empresas, Promociones, Hunter, Estudio, Gestiones, Benchmark y un panel de administración. Cómo está armada y cómo se corre: `README.md`.

El dueño del producto trabaja en el banco y **no es programador**: piensa en lo que ve en pantalla.

## Reglas firmes

- **Ningún commit a `main` ni `push` sin el OK del dueño** (vale también para subagentes y sin `--no-verify`): todo lo que llega a `main` se publica.
- **El repo es público** (`docs/adr/0008-…`): nada personal ni ninguna clave en archivos, commits o capturas.
- `SB_TOKEN` (token de gestión de Supabase) se le pide al dueño y se pasa por el entorno. GitHub entra con el administrador de credenciales, nunca con un token en la URL del remoto. El remoto `oldorigin` está congelado.
- Las funciones en prueba (Gestiones) se encienden sólo si el dueño lo pide.
- Antes de arreglar un hallazgo de otra IA, comprobalo contra el código: hay falsos positivos (`docs/adr/0012-…`).

## Vocabulario

El código y los commits van en inglés; la documentación y los textos de pantalla, en español. **`docs/GLOSARIO.md`** une cada nombre de pantalla con su nombre en el código: usalo para encontrar el código de una pantalla y para nombrar algo nuevo.

## Dónde está lo que no se ve mirando carpetas

- Capas: `app → slices → shared` (lo controla `npm run lint:boundaries`). Desde afuera de un slice se importa sólo su `index.ts`.
- Estado: Context de React, TanStack Query para todo lo de Supabase, y un store propio del editor del flyer, fuera de los renders.
- **Legales** de cada flyer: los carga el admin en Config → Legales y viven en el bucket (`_legal<n>.json`); el respaldo es `shared/lib/flyer-workspace/default-legal.ts`.
- **Imagen y calibración** de un flyer: Config → Flyer, con el calibrador. El cuadro del beneficio de Flyer Rubros está en `slices/admin/model/calibrator/benefit-templates.ts`.
- **Colores, letras y espacios**: sólo en `shared/ui/tokens/tokens.css`. Ningún estilo de pantalla trae los suyos.
- **CSP**: `scripts/vite/content-security-policy.ts`. Un origen externo nuevo se agrega ahí o el navegador lo bloquea en silencio. Lleva `'wasm-unsafe-eval'` por pdf.js.
- **SheetJS** se sirve desde `web/src/shared/lib/vendor/` con su hash (npm quedó en una versión vieja con avisos). Para subir de versión: archivo con otro nombre y su hash en `scripts/vite/sheet-library-integrity.ts`.
- **Clave pública de Supabase**: `web/.env.production`, a propósito. La llave de servidor sólo vive en las Edge Functions.
- **Migraciones** (`supabase/migrations/`): se aplican a mano y en orden, cada una antes del cliente que la necesita. Al agregar una función `security definer`, actualizar `supabase/INVENTARIO_RPC.md`.
- Lo que no debe verse en el navegador (credenciales privilegiadas, reglas de acceso) va en `supabase/`; lo demás, en `web/`.

## Servicios

- **Supabase**: base con RLS, login, bucket público (flyers, legales, padrón y configuraciones en `.json`) y tres Edge Functions. Secretos de las funciones: `MAIL_HOOK_URL`, `MAIL_HOOK_SECRET`, `MAIL_ADMIN`, la llave de servidor y las claves de cron (`PROMOS_CRON_SECRET`, `BENCH_CRON_SECRET`). Las claves de cron también están en el Vault (`promos_cron_secret`, `bench_cron_secret`): se rotan las dos copias a la vez.
- **GitHub Pages** publica `main` 1-2 min después del `push`. El repo es `flyergalicia/flyer-galicia`.
- **Gmail + Apps Script** (`supabase/mail/apps-script.gs`) manda los avisos; lo llama `auth-admin`. Tope: 100 mails por día.
- **APIs de promociones de Galicia y MODO**: públicas. Las lee `promos-galicia` todos los días a las 9. Las webs de Santander y Macro se leen sólo con la skill `benchmark-carga-asistida`.
- **Google Fonts** (Figtree) es lo único externo, además de Supabase y los logos de `www.galicia.ar`.

## Invariantes

Cada una se rompió alguna vez por un cambio hecho en otra parte.

1. El zoom se ancla donde está el mouse: se redibuja con `drawNow()` (`shared/flyer-engine/preview.ts`), nunca con `requestDraw()`.
2. Traer una empresa con la lupa o el autocompletado **siempre** avisa si el flyer no es el de su rubro.
3. Lo que se oculta por rol se vuelve a mostrar en el mismo lugar.
4. Un flyer nuevo siempre tiene una dirección nueva (`?v=<hora>`): la imagen se cachea 1 h.
5. Los JSON del bucket se leen sólo con `readJson` (`shared/supabase/bucket.ts`), que distingue "no existe" de "sin red".
6. Un dato que llega tarde no pisa a la opción que ya está activa.
7. Las lecturas de más de 1000 filas se paginan con `fetchAllRows`.
8. En las reglas de base, `auth.uid()`, `is_active()`, `get_my_role()` y `gestiones_on()` van envueltas en `(select …)`.
9. Una función SQL nueva nace sin permiso para visitantes y con `grant execute … to authenticated` si la usa la app. Una `security definer` lleva `set search_path = public`. Una función que se usa dentro de una policy tiene que poder ejecutarla `authenticated`.
10. Toda columna nueva de `profiles` que use la app se suma a `PROFILE_COLUMNS` (`shared/session/profile.ts`).
11. Todo camino que muestre el formulario de ingreso sale del estado "Ingresando…" (`shared/session/session-machine.ts`).
12. El texto que escribió otro usuario se muestra como texto: nunca va por `dangerouslySetInnerHTML`. La CSP no permite `unsafe-inline`.
13. Los teléfonos se detectan por grupos de dígitos, con el CUIT tapado antes. El cashback del Excel de empresas se lee con el lector tolerante de `shared/domain/company-registry/`, nunca por posición.
14. Al insertar texto arbitrario con `.replace`, el reemplazo es una función (un `$'` duplicó el HTML una vez).
15. Letra mínima 12 px (11 en rótulos en mayúscula), siempre desde los tokens. En el celular los campos van a 16 px para que el iPhone no haga zoom.
16. La vista previa dibuja exactamente lo que se descarga: sin textos de relleno, y el formulario arranca vacío.
17. Vista previa, Descargar PDF y Otros van en la barra fija en la PC y en el formulario en el celular: se buscan por su nombre visible, nunca por su posición.
18. Un error pasajero al leer el perfil (sin red, 5xx, 408, 429) muestra Reintentar y no cierra la sesión.
19. El interruptor "Mostrar en el flyer" de Oficiales esconde sin borrar y vale sólo para el flyer en curso: Restaurar y traer una empresa lo vuelven a prender. Bajar una empresa con los oficiales ocultos cuenta como cambio ("Actualizar mis empresas").
20. Cambiar logos dibuja en dos pasadas (primero tapa todo, después dibuja) y sólo si `v.logosSrc` es la imagen actual. La lupa limpia los cambios, salvo con un diseño o un borrador abierto. Publicar desde Estudio escribe `_active<n>.json` con el número nuevo.
21. Recortar cambia la imagen y la calibración juntas, en una sola escena (`cropScene`, `shared/flyer-engine/`). Los recortes guardados pueden traer secciones insertadas (`c.ins`): `cropScene` baja sus imágenes.
22. Un flyer que no cargó nunca se dibuja ni se baja sobre la imagen de otro (`shared/flyer-engine/flyer-slot.ts`); las tandas saltean ese grupo. "Sin flyer" es un dato firme; "sin red" se reintenta.
23. Una falla de red no se guarda como "vacío": muestra "No se pudo conectar · Reintentar" y no deja guardar encima. "Descargado" se dice después de que el archivo salió.
24. Las empresas de suplencia nunca se guardan como propias: sólo las recorren la lupa y el autocompletado, y un cambio sobre ellas se le pide al dueño.
25. Los logos de promos se arman sólo con `promotionLogoSource` (`shared/domain/promotions/promotion.ts`). Decidir si un logo del flyer sigue vigente mira el catálogo entero, con MODO, aunque «Incluir MODO» esté apagado.

## Decisiones y pendientes

- **`docs/adr/`**: decisiones del dueño que parecen errores o que alguien querría "mejorar". Antes de cambiar un comportamiento de producto, buscá ahí: el nombre de cada archivo es la decisión.
- **`docs/PENDIENTES.md`**: qué falta para publicar, qué hay que probar en vivo y el backlog. Leelo al planear trabajo nuevo o al preparar la publicación.

## Antes de dar algo por terminado

- `npm run ci` tiene que terminar bien antes de cada commit. Los commits van en inglés, con Conventional Commits.
- Toda funcionalidad nueva suma su prueba (`tests/LEEME.md`).
- Si el dueño dice "no veo el cambio", primero mirá qué versión sirve producción (`index.html` y `version.json`) y sugerí Ctrl+F5: Pages cachea 10 min.
- Lo que no se pudo ver con sesión iniciada se dice, y se le pide al dueño que lo revise en vivo.

## Cómo hablarle al dueño

- En español claro y sin jerga. Las cosas se nombran como se ven en pantalla ("la lupa del buscador"), no por el nombre de la función.
- Se le preguntan sólo decisiones de producto. Las técnicas se resuelven y se cuentan en una línea. Si un detalle técnico lo afecta, explicalo con una analogía corta antes de preguntar y decí si tiene que hacer algo.
- Es exigente con la estética y con la experiencia de uso, y quiere ver antes de decidir: mostrale propuestas visuales y contale qué se verificó y qué no.
- Las PC de sucursal son lentas: nada pesado en lo visual.
- Otras IA: Gemini sólo para imágenes o una segunda opinión con contexto largo, y Codex sólo para revisar, en modo lectura. Avisá en una línea antes de derivar. Si falla por cupo o login, decilo.
