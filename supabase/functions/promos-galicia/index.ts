// Edge Function: promos-galicia
// Puente hacia el buscador de promociones de Banco Galicia (beneficios.galicia.ar).
// Necesaria porque la API de Galicia sólo acepta llamadas con
// Origin/Referer=beneficios.galicia.ar (CORS + WAF la rechazan si se la llama
// directo desde el navegador de la app). Corriendo del lado servidor no hay
// restricción de CORS y podemos imitar esos headers.
//
// Acciones:
//   status    -> devuelve metadata de la última sincronización (fecha, total)
//   sync      -> baja el catálogo completo de Galicia y refresca la tabla caché
//   detalle   -> dado un array de ids de promoción, devuelve su fechaDesde
//                (ese campo sólo viene en el detalle, no en el listado)
//   ubicacion -> ids de las promos de una provincia/localidad puntual, en vivo
//                (la localidad no se puede precalcular: son ~4200)
//
// Todas requieren un usuario logueado que sea admin O que tenga la facultad
// "promos_buscar" habilitada en _facultades.json (mismo criterio que usa el
// cliente para mostrar/ocultar la pestaña, pero validado acá del lado
// servidor: la facultad del cliente es sólo interfaz, esto es lo que de
// verdad autoriza o rechaza).
// Versión FIJA, la misma que usa la app (SUPABASE_JS_URL en _build.mjs): con "@2"
// cada deploy tomaba la última 2.x que hubiera, sin que nadie la probara.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("ADMIN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Autorización: admin, o rol con la facultad promos_buscar habilitada ────
async function requireCan(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  // El perfil y las facultades se piden A LA VEZ (antes uno detrás del otro: cada
  // llamada a esta función, por ejemplo cada tanda de fechas "Desde", pagaba
  // una vuelta de red de más). Si las facultades no se pueden leer, no autoriza.
  const [{ data: prof }, fac] = await Promise.all([
    admin.from("profiles").select("role,status").eq("id", data.user.id).single(),
    fetch(SUPABASE_URL + "/storage/v1/object/public/flyers/_facultades.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  // Sólo cuentas activas: una desactivada/pendiente conserva el JWT hasta que
  // vence, pero no tiene que poder disparar consultas hacia Galicia.
  // (reset_pending = tiene un pedido de cambio de clave en curso; la cuenta anda igual)
  if (!prof || (prof.status !== "active" && prof.status !== "reset_pending")) return false;
  const role = prof.role || "";
  if (role === "admin") return true;
  return !!(fac?.roles?.[role]?.promos_buscar);
}

// ── Tarea programada: la base dispara el sync todos los días a las 9 ───────
// pg_cron (migración 024) llama a esta función sin usuario, con el header
// x-cron-secret. La clave vive en los secretos de la función
// (PROMOS_CRON_SECRET) y en el Vault de la base, nunca en el repo. Sólo
// habilita la acción "sync": no da acceso a nada más.
function esCron(req: Request): boolean {
  const esperado = Deno.env.get("PROMOS_CRON_SECRET") || "";
  const recibido = req.headers.get("x-cron-secret") || "";
  if (esperado.length < 32 || recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return dif === 0;
}

// ── Mail al admin cuando falla la actualización de las 9 ───────────────────
// Mismo camino que los avisos de auth-admin (Gmail de la app vía Apps Script,
// secretos MAIL_HOOK_URL / MAIL_HOOK_SECRET / MAIL_ADMIN, compartidos por todas
// las funciones del proyecto) y mismo aspecto: esto es una copia reducida de
// armarHtml/enviar de auth-admin, porque cada función se publica como un único
// archivo. Sin links ni imágenes; un mail que falla no cambia la respuesta.
const MAIL_URL = Deno.env.get("MAIL_HOOK_URL") || "";
const MAIL_SECRET = Deno.env.get("MAIL_HOOK_SECRET") || "";
const MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAIL_ADMIN = (Deno.env.get("MAIL_ADMIN") || "").split(",").map((x) => x.trim()).filter((x) => MAIL_RE.test(x));

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
type Mail = { asunto: string; titulo: string; parrafos: string[]; datos: [string, string][] };
function mailTexto(m: Mail): string {
  const l: string[] = [m.titulo.toUpperCase(), ""];
  m.parrafos.forEach((p) => l.push(p, ""));
  m.datos.forEach(([k, v]) => l.push(`${k}: ${v}`));
  l.push("", "—", "Armador de flyers · Mensaje automático.");
  return l.join("\n");
}
function mailHtml(m: Mail): string {
  const F = "font-family:'Segoe UI',Helvetica,Arial,sans-serif;";
  const parrafos = m.parrafos.map((p) =>
    `<p style="${F}margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2f36">${esc(p)}</p>`).join("");
  const datos = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:#f6f7f9;border-radius:8px"><tr><td style="padding:12px 16px">` +
    m.datos.map(([k, v]) =>
      `<div style="${F}font-size:14px;line-height:1.7;color:#2b2f36"><span style="color:#6b7280">${esc(k)}:</span> <strong>${esc(v)}</strong></div>`).join("") +
    `</td></tr></table>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.asunto)}</title></head>` +
    `<body style="margin:0;padding:0;background:#eceef2">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2"><tr><td align="center" style="padding:28px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">` +
    `<tr><td style="background:#14213D;padding:20px 28px;border-bottom:4px solid #F26122">` +
    `<div style="${F}font-size:18px;font-weight:700;letter-spacing:.2px;color:#ffffff">Armador de flyers</div></td></tr>` +
    `<tr><td style="padding:28px 28px 10px">` +
    `<h1 style="${F}margin:0 0 18px;font-size:21px;line-height:1.3;color:#14213D">${esc(m.titulo)}</h1>` +
    parrafos + datos +
    `</td></tr>` +
    `<tr><td style="padding:14px 28px 24px;border-top:1px solid #e5e7eb">` +
    `<div style="${F}font-size:12px;line-height:1.6;color:#6b7280">Mensaje automático del Armador de flyers.</div>` +
    `</td></tr></table></td></tr></table></body></html>`;
}
async function mailsAdmins(): Promise<string[]> {
  if (MAIL_ADMIN.length) return MAIL_ADMIN;
  const { data } = await admin.from("profiles").select("email").eq("role", "admin").in("status", ["active", "reset_pending"]);
  return (data || []).map((r: { email: string | null }) => r.email || "").filter((x: string) => MAIL_RE.test(x));
}
async function avisarAdmin(m: Mail): Promise<void> {
  if (!MAIL_URL || !MAIL_SECRET) return;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const to = await mailsAdmins();
    if (!to.length) return;
    const r = await fetch(MAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: MAIL_SECRET, to: to.join(","), subject: m.asunto, body: mailTexto(m), html: mailHtml(m) }),
      signal: ctl.signal,
    });
    const txt = await r.text();
    if (!r.ok || !/"ok":\s*true/.test(txt)) console.error("mail: respuesta inesperada", r.status, txt.slice(0, 200));
  } catch (e) {
    console.error("mail:", String((e as Error)?.message || e));
  } finally {
    clearTimeout(t);
  }
}
async function ultimaCopia(): Promise<string> {
  const { data } = await admin.from("promos_galicia_meta").select("last_sync_at,total").eq("id", 1).maybeSingle();
  if (!data?.last_sync_at) return "ninguna";
  const f = new Date(data.last_sync_at).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return `${f} (${data.total || 0} promociones)`;
}
const MAILS = {
  fallo: (error: string, copia: string): Mail => ({
    asunto: "Armador de flyers · No se pudo actualizar el catálogo de promociones",
    titulo: "No se pudo actualizar el catálogo de promociones",
    parrafos: [
      "La actualización automática de las 9 falló. La solapa Promociones sigue andando con la última copia guardada, pero puede que falten promociones nuevas.",
      "Podés reintentar con el botón «Actualizar catálogo ahora». Si vuelve a fallar, es probable que Galicia haya cambiado algo en su sitio y haya que adaptar la app.",
    ],
    datos: [["Error", error], ["Última copia buena", copia]],
  }),
  sinProvincias: (error: string): Mail => ({
    asunto: "Armador de flyers · Promociones actualizadas sin provincias",
    titulo: "Promociones actualizadas, pero sin las provincias",
    parrafos: [
      "La actualización de las 9 trajo el catálogo nuevo, pero no pudo calcular en qué provincia vale cada promoción. Se conservaron las provincias de la copia anterior, así que las promos nuevas pueden aparecer como «Fuera de la provincia».",
      "Podés reintentar con el botón «Actualizar catálogo ahora».",
    ],
    datos: [["Error", error]],
  }),
};

// ── Cliente hacia la API de Galicia (imitando el navegador real) ───────────
const GALICIA_BFF = "https://loyalty.bff.bancogalicia.com.ar/api/portal";
const GALICIA_HEADERS: Record<string, string> = {
  "Accept": "application/json",
  "Origin": "https://beneficios.galicia.ar",
  "Referer": "https://beneficios.galicia.ar/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// Entre el 13 y el 16-oct-2026 Galicia mudó su sitio de /catalogo/v1 a
// /personalizacion/v1 y la ruta vieja pasó a dar 403 a todo el mundo (también
// desde su propio sitio, con un navegador real): no era un bloqueo a nosotros.
// Se prueba la nueva primero y la vieja de respaldo, por si alguna vez vuelve.
// Ojo con los filtros de ubicación: en la nueva van en MINÚSCULA (provincia,
// localidad) y en la vieja capitalizados (Provincia, Localidad). Con el nombre
// equivocado el WAF contesta 403, no 400, así que un typo parece una caída.
// Los nombres de provincia van tal cual los da ubicacion/filtro ("NEUQUEN"):
// con tilde o en otro formato Galicia devuelve 0 promos sin error.
type Ruta = {
  nombre: string;
  catalogo: string;
  ubicaciones: string;
  detalle: string;
  prov: string;
  loc: string;
};
const RUTAS: Ruta[] = [
  {
    nombre: "personalizacion/v1",
    catalogo: "/personalizacion/v1/promociones/catalogo",
    ubicaciones: "/personalizacion/v1/locales/ubicacion/filtro",
    detalle: "/personalizacion/v1/promociones/idPromocion/",
    prov: "provincia",
    loc: "localidad",
  },
  {
    nombre: "catalogo/v1",
    catalogo: "/catalogo/v1/promociones",
    ubicaciones: "/catalogo/v1/locales/ubicacion/filtro",
    detalle: "/catalogo/v1/promociones/idPromocion/",
    prov: "Provincia",
    loc: "Localidad",
  },
];

// Pide a cada ruta en orden hasta que una conteste. La que anduvo queda primera
// mientras la función siga viva, así las tandas de "detalle" no pagan cada vez
// el 403 de una ruta muerta. Si fallan todas, el error dice qué contestó cada una.
let rutaIdx = 0;
async function conRuta<T>(fn: (r: Ruta) => Promise<T>): Promise<T> {
  const errores: string[] = [];
  for (let k = 0; k < RUTAS.length; k++) {
    const i = (rutaIdx + k) % RUTAS.length;
    try {
      const res = await fn(RUTAS[i]);
      rutaIdx = i;
      return res;
    } catch (e) {
      errores.push(`${(e as Error)?.message || "error"} (${RUTAS[i].nombre})`);
    }
  }
  throw new Error(errores.join("; "));
}

async function galiciaJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: GALICIA_HEADERS });
  if (!r.ok) throw new Error(`Galicia respondió ${r.status}`);
  return await r.json();
}

// El catálogo ya pasó las 2400 promos y antes se pedía con pageSize=3000 sin
// mirar si venía entero. Ahora se pide de a 5000 y, si Galicia informa un total
// mayor (totalSize), se siguen pidiendo páginas (page=2, 3...). Una respuesta sin
// lista es un cambio de formato: se corta con error en vez de seguir con vacío.
const PAGINA = 5000;
function promosUrl(ruta: Ruta, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ pageSize: String(PAGINA), ...params });
  return `${GALICIA_BFF}${ruta.catalogo}?${qs}`;
}
async function listadoCompleto(ruta: Ruta, params: Record<string, string> = {}): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const p = page === 1 ? params : { ...params, page: String(page) };
    const d = await galiciaJson(promosUrl(ruta, p));
    const list = d?.data?.list;
    if (!Array.isArray(list)) throw new Error("Galicia cambió el formato del listado");
    out.push(...list);
    const total = Number(d?.data?.totalSize);
    if (list.length < PAGINA || !Number.isFinite(total) || out.length >= total) break;
  }
  return out;
}

// La ruta nueva da las fechas del detalle como DD/MM/AAAA ("24/11/2025") y el
// listado como AAAA-MM-DDThh:mm:ss. La app espera AAAA-MM-DD para mostrar y
// ordenar ("Desde"), así que todo se normaliza acá. Algo irreconocible → null.
function isoFecha(f: unknown): string | null {
  const s = String(f ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ── Geografía: qué promos se pueden usar en cada provincia ─────────────────
// Galicia no expone la provincia dentro del catálogo; la única forma de saberlo
// es pedir el listado filtrado provincia por provincia. Son 24 llamadas: ~8,7s
// en serie, ~2s con 6 en paralelo (mismo patrón que detalle()). Las promos que
// no aparecen en ninguna (~307 de 1922) son de compra online, sin local físico.
// Usa la misma ruta con la que se bajó el catálogo.
async function geoPorProvincia(ruta: Ruta): Promise<{
  ubicaciones: any[];
  porPromo: Map<number, string[]>;
}> {
  const u = await galiciaJson(`${GALICIA_BFF}${ruta.ubicaciones}`);
  const ubicaciones: any[] = Array.isArray(u?.data) ? u.data : [];
  if (!ubicaciones.length) throw new Error("Galicia no devolvió la lista de provincias");

  const porPromo = new Map<number, string[]>();
  let idx = 0;
  async function worker() {
    while (idx < ubicaciones.length) {
      const prov = String(ubicaciones[idx++]?.nombre || "");
      if (!prov) continue;
      // Una provincia que falle aborta el sync geográfico entero: es preferible
      // conservar la geografía anterior (completa) a guardar uno incompleto,
      // que se vería como "esta marca no está en tu provincia" siendo mentira.
      const list = await listadoCompleto(ruta, { [ruta.prov]: prov });
      for (const p of list) {
        const arr = porPromo.get(p.id);
        if (arr) arr.push(prov);
        else porPromo.set(p.id, [prov]);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, ubicaciones.length) }, worker));
  return { ubicaciones, porPromo };
}

// Freno contra un catálogo "raro": si Galicia devuelve mucho menos de lo que ya
// está guardado (un cambio de formato, un filtro que dejó de andar), no se pisa
// la copia buena, porque el paso final borra todo lo que no vino.
const MINIMO_RELATIVO = 0.5;

async function syncCatalogo(): Promise<{ total: number; proximas: number; conProvincia: number; geoError: string | null; ruta: string }> {
  const { ruta, crudo } = await conRuta(async (r) => ({ ruta: r, crudo: await listadoCompleto(r) }))
    .catch((e) => {
      throw new Error(`${(e as Error).message} al pedir el catálogo`);
    });
  // Una fila sin id numérico no se puede guardar ni enlazar: se descarta sola en
  // vez de hacer fallar la tanda entera.
  const list = crudo.filter((p) => Number.isFinite(p?.id));
  if (!list.length) throw new Error("El catálogo de Galicia vino vacío");

  const { count: guardadas } = await admin
    .from("promos_galicia_cache").select("id", { count: "exact", head: true });
  if (guardadas && list.length < guardadas * MINIMO_RELATIVO) {
    throw new Error(
      `Galicia devolvió sólo ${list.length} promociones y la copia guardada tiene ${guardadas}: ` +
        "no se reemplaza por las dudas",
    );
  }

  // La geografía se trae ANTES del upsert para que cada fila se guarde completa
  // de una y no queden estados intermedios. Si falla, el catálogo se guarda
  // igual SIN tocar la columna provincias: quedarse sin catálogo por no poder
  // calcular la provincia sería mucho peor, y la geografía anterior sigue
  // sirviendo (el catálogo cambia poco de un día para el otro).
  let geo: { ubicaciones: any[]; porPromo: Map<number, string[]> } | null = null;
  let geoError: string | null = null;
  try {
    geo = await geoPorProvincia(ruta);
  } catch (e) {
    geoError = (e as Error)?.message || "error desconocido";
    console.error("promos sync: no se pudo traer la geografía:", geoError);
  }

  // Las "próximamente" (Galicia ya las publicó pero arrancan más adelante) se
  // guardan con su fecha de inicio, que sólo viene en el detalle: son ~75, una
  // llamada cada una de a 6. Para el resto fecha_desde queda vacía y la app la
  // sigue pidiendo a demanda como siempre (acción "detalle"). Si el detalle
  // falla, la promo igual queda marcada como próxima, sin fecha.
  const proximas = list.filter((p) => p.proximamente === true).map((p) => p.id);
  const desdeProximas = proximas.length ? await detalle(proximas, 400) : {};

  // Un único timestamp para todas las filas de esta corrida: así, al final,
  // "lo que quedó con updated_at viejo" es justo lo que ya no está en el
  // catálogo (se borró/venció y se cayó del listado) y se puede limpiar sin
  // armar un IN gigante con 1700+ ids.
  const syncStartedAt = new Date().toISOString();
  const rows = list.map((p) => {
    const row: Record<string, unknown> = {
      id: p.id,
      titulo: p.titulo || "",
      subtitulo: p.subtitulo || "",
      imagen: p.imagen || "",
      fecha_hasta: isoFecha(p.fechaHasta),
      tipo_promocion: p.tipoPromocion || "",
      proximamente: p.proximamente === true,
      fecha_desde: desdeProximas[String(p.id)] ?? null,
      updated_at: syncStartedAt,
      // primera_vez NO se manda: al insertar toma now() (default de la columna)
      // y al actualizar el upsert no la toca. Es lo que marca a una promo
      // como "Nueva" en la app.
    };
    // Sin geografía no se manda la columna: el upsert sólo pisa las columnas
    // presentes, así que las provincias que ya estaban guardadas sobreviven.
    if (geo) row.provincias = geo.porPromo.get(p.id) || [];
    return row;
  });

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("promos_galicia_cache").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error("Guardando el catálogo: " + error.message);
  }

  const { error: delErr } = await admin
    .from("promos_galicia_cache").delete().lt("updated_at", syncStartedAt);
  if (delErr) throw new Error("Limpiando promos vencidas del caché: " + delErr.message);

  const meta: Record<string, unknown> = { last_sync_at: syncStartedAt, total: rows.length };
  if (geo) meta.ubicaciones = geo.ubicaciones;
  const { error: metaErr } = await admin
    .from("promos_galicia_meta").update(meta).eq("id", 1);
  if (metaErr) throw new Error("Guardando metadata: " + metaErr.message);

  return {
    total: rows.length,
    proximas: proximas.length,
    conProvincia: geo ? geo.porPromo.size : 0,
    geoError,
    ruta: ruta.nombre,
  };
}

// Promos de una provincia/localidad puntual, en vivo contra Galicia. Devuelve
// sólo los ids: el cliente ya tiene el catálogo entero en memoria y lo hidrata
// desde ahí. Existe por la localidad, que no se puede precalcular como la
// provincia (son ~4200 y cada una necesitaría su propia llamada).
async function porUbicacion(provincia: string, localidad: string): Promise<{ ids: number[] }> {
  const prov = String(provincia || "").trim();
  if (!prov) throw new Error("Falta la provincia");
  const loc = String(localidad || "").trim();
  const list = await conRuta((r) => {
    const params: Record<string, string> = { [r.prov]: prov };
    if (loc) params[r.loc] = loc;
    return listadoCompleto(r, params);
  });
  return { ids: list.map((p) => p.id).filter((n) => Number.isFinite(n)) };
}

// Tope de 80 por pedido desde la app (la app los manda en tandas); el sync de
// las "próximamente" usa uno más alto.
async function detalle(ids: number[], tope = 80): Promise<Record<string, string | null>> {
  const capped = ids.filter((n) => Number.isFinite(n)).slice(0, tope);
  const results: Record<string, string | null> = {};
  let idx = 0;
  async function worker() {
    while (idx < capped.length) {
      const id = capped[idx++];
      try {
        const d = await conRuta((r) => galiciaJson(`${GALICIA_BFF}${r.detalle}${id}`));
        results[String(id)] = isoFecha(d?.data?.fechaDesde);
      } catch {
        results[String(id)] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, capped.length) }, worker));
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* body vacío */ }
  const action = body?.action;

  const cron = action === "sync" && esCron(req);
  const can = cron || await requireCan(req);
  if (!can) return json({ error: "No autorizado" }, 403);

  // La actualización de las 9 no tiene a nadie mirando la pantalla: si falla,
  // se avisa por mail al admin. (La manual muestra el error en la app.)
  if (cron) {
    try {
      const data = await syncCatalogo();
      if (data.geoError) await avisarAdmin(MAILS.sinProvincias(data.geoError));
      return json({ data });
    } catch (e) {
      const msg = (e as Error)?.message || "Error";
      await avisarAdmin(MAILS.fallo(msg, await ultimaCopia()));
      return json({ error: msg }, 500);
    }
  }

  try {
    if (action === "status") {
      const { data, error } = await admin
        .from("promos_galicia_meta").select("last_sync_at,total,ubicaciones").eq("id", 1).single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }
    if (action === "sync") {
      const data = await syncCatalogo();
      return json({ data });
    }
    if (action === "detalle") {
      const ids = Array.isArray(body?.ids) ? body.ids : [];
      const data = await detalle(ids);
      return json({ data });
    }
    if (action === "ubicacion") {
      const data = await porUbicacion(body?.provincia, body?.localidad);
      return json({ data });
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message || "Error" }, 500);
  }
});
