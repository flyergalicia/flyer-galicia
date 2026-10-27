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
  modo: (error: string): Mail => ({
    asunto: "Armador de flyers · No se pudieron actualizar las promociones de MODO",
    titulo: "No se pudieron actualizar las promociones de MODO",
    parrafos: [
      "Las promociones de Galicia se actualizaron bien, pero las de MODO no. En Promociones siguen las de MODO de la copia anterior.",
      "Podés reintentar con el botón «Actualizar catálogo ahora». Si vuelve a fallar, es probable que MODO haya cambiado algo en su sitio.",
    ],
    datos: [["Error", error]],
  }),
  vigiladas: (lineas: [string, string][]): Mail => ({
    asunto: "Armador de flyers · Marcas para revisar en tus flyers",
    titulo: "Marcas para revisar en tus flyers",
    parrafos: [
      "En la revisión de hoy hay marcas de tus flyers que ya no tienen promoción vigente o que vencen en los próximos 7 días. Conviene cambiarlas (Cambiar logos o Armar franja) o sacar el flyer de circulación.",
      "La lista completa y el estado de cada marca están en Admin → Config → Marcas vigiladas. Este aviso no se repite mientras la lista no cambie.",
    ],
    datos: lineas,
  }),
};

// ── Marcas vigiladas: revisión diaria ──────────────────────────────────────
// El admin elige qué marcas tiene cada flyer (_vigilar.json del bucket, lo
// escribe la app). Después del sync de las 9 se cruza con el catálogo y, si hay
// algo vencido o por vencer (7 días o menos), se avisa por mail UNA vez: la
// firma de lo avisado queda en _vigilar_aviso.json y no se repite mientras no
// cambie. Es una función pura (evaluarVigiladas) para poder probarla aparte.
type Vig = { m?: string; t?: string; img?: string };
type Promo = { titulo: string; imagen: string; fecha_hasta: string | null; proximamente?: boolean };
function normVig(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}
export function evaluarVigiladas(ops: Record<string, Vig[]>, cat: Promo[], hoy: Date): { opcion: string; marca: string; estado: "vencida" | "vence"; hasta: string | null }[] {
  const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const porImg = new Map<string, Promo[]>(), porTit = new Map<string, Promo[]>();
  for (const p of cat) {
    if (p.proximamente) continue;
    if (p.imagen) { const a = porImg.get(p.imagen) || []; a.push(p); porImg.set(p.imagen, a); }
    const k = normVig(p.titulo); if (k) { const a = porTit.get(k) || []; a.push(p); porTit.set(k, a); }
  }
  const out: { opcion: string; marca: string; estado: "vencida" | "vence"; hasta: string | null }[] = [];
  for (const [opcion, lista] of Object.entries(ops || {})) {
    for (const v of (Array.isArray(lista) ? lista : [])) {
      const cands = [...(v.img ? porImg.get(v.img) || [] : []), ...(porTit.get(normVig(v.t || v.m)) || [])];
      let mejor = -1, sinFecha = false;
      for (const p of cands) {
        if (!p.fecha_hasta) { sinFecha = true; continue; }
        const f = new Date(p.fecha_hasta + "T00:00:00").getTime();
        if (f >= dia && f > mejor) mejor = f;
      }
      const marca = String(v.m || v.t || "");
      if (sinFecha) continue; // vigente sin fecha informada
      if (mejor < 0) out.push({ opcion, marca, estado: "vencida", hasta: null });
      else if (mejor - dia <= 7 * 86400000) out.push({ opcion, marca, estado: "vence", hasta: new Date(mejor).toISOString().slice(0, 10) });
    }
  }
  return out;
}
async function revisarVigiladas(): Promise<void> {
  const PUB = SUPABASE_URL + "/storage/v1/object/public/flyers/";
  const leer = (f: string) => fetch(PUB + f + "?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const vig = await leer("_vigilar.json");
  const ops = (vig && vig.opciones) || {};
  if (!Object.keys(ops).length) return;
  const cat: Promo[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_galicia_cache").select("titulo,imagen,fecha_hasta,proximamente").order("id").range(d, d + 999);
    if (error) throw new Error("vigiladas: " + error.message);
    cat.push(...((data || []) as Promo[]));
    if (!data || data.length < 1000) break;
  }
  // Las de MODO (migración 035) también cuentan: una marca que sólo tiene promo
  // en MODO no está vencida. Si la tabla no se puede leer, se sigue sólo con Galicia.
  try { cat.push(...((await modoTodas("titulo,imagen,fecha_hasta,proximamente")) as Promo[])); }
  catch (e) { console.error("vigiladas: sin las de MODO:", String((e as Error)?.message || e)); }
  const res = evaluarVigiladas(ops, cat, new Date());
  const firma = JSON.stringify(res.map((r) => [r.opcion, r.marca, r.estado, r.hasta]).sort());
  const prev = await leer("_vigilar_aviso.json");
  if (prev && prev.firma === firma) return;
  // Reserva atómica del aviso (misma tabla de topes que auth-admin): si la
  // actualización de las 9 y una manual corren a la vez, sólo una manda el mail.
  if (res.length) {
    const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(firma))))
      .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
    const { data: libre, error: eRes } = await admin.rpc("rate_limit_hit", { p_clave: "vigiladas|" + h, p_max: 1, p_segundos: 30 * 24 * 3600 });
    if (eRes) console.error("vigiladas: no se pudo reservar el aviso:", eRes.message);
    else if (libre === false) return; // otra ejecución ya lo está mandando
  }
  if (res.length) {
    const opc = await leer("_opciones.json");
    const nombre = (n: string) => ((opc?.opts || []).find((o: { n: number; nombre: string }) => String(o.n) === n)?.nombre) || ("Opción " + n);
    const porOpt = new Map<string, string[]>();
    for (const r of res) {
      const a = porOpt.get(r.opcion) || [];
      a.push(r.marca + (r.estado === "vencida" ? " (sin promo vigente)" : " (vence el " + r.hasta!.slice(8, 10) + "/" + r.hasta!.slice(5, 7) + ")"));
      porOpt.set(r.opcion, a);
    }
    await avisarAdmin(MAILS.vigiladas([...porOpt.entries()].map(([n, a]) => [nombre(n), a.join(", ")] as [string, string])));
  }
  // se guarda la firma (también cuando quedó vacía: si algo vuelve a vencer, se avisa de nuevo)
  const blob = new Blob([JSON.stringify({ firma, fecha: new Date().toISOString() })], { type: "application/json" });
  const { error: eUp } = await admin.storage.from("flyers").upload("_vigilar_aviso.json", blob, { upsert: true, contentType: "application/json" });
  if (eUp) console.error("vigiladas: no se pudo guardar el aviso:", eUp.message);
}

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
      // días de aplicación ("Viernes", "Martes y Jueves"): en los súper van debajo del logo
      dias: String(p.leyendaDiasAplicacion || "").trim() || null,
      // el beneficio ("25% de ahorro."): en los súper sólo valen los días de los %
      beneficio: String(p.promocion || "").trim() || null,
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

// ── MODO: promos que valen con Galicia y Galicia no publica (26-oct-2026) ───
// modo.com.ar/promos filtrando por el banco Galicia trae combustible por marca
// (YPF, WICO), súper del interior y farmacias que el buscador de Galicia no
// tiene. Su API responde sin headers especiales y con CORS abierto, pero se
// copia acá igual: así la provincia (un pedido por promo) y los logos (sin CORS:
// no se podrían dibujar en el PDF) se resuelven una vez por día y no en cada
// asesor. Se guardan en promos_modo_cache (migración 035) con las mismas
// columnas que las de Galicia, para que la app las trate igual. Cuáles ya están
// en Galicia lo decide la app (tiene los dos catálogos en memoria).
const MODO_API = "https://www.modo.com.ar/promos/api/rewards";
const MODO_LOCALES = "https://promoshub.modo.com.ar/promos/api/map/stores/applications/onsite";
const MODO_GALICIA = "88d8705e-2dda-46f9-8411-bb4916af858e"; // id del banco Galicia en MODO (rewards/banks)
// Las secciones del "hub" de promos: son las que pide su propio sitio al filtrar.
const MODO_SLOTS = [
  "web-modo-hub-carrousel_principal", "web-modo-hub-destacadas", "web-modo-hub-supermercados",
  "web-modo-hub-exclusivas-online", "web-modo-hub-promos-financiacion", "web-modo-hub-mas-promos",
].join(",");
const MODO_HEADERS: Record<string, string> = { "Accept": "application/json", "User-Agent": GALICIA_HEADERS["User-Agent"] };
// Rubros de MODO (rewards/categories) con los nombres que usa Galicia: los
// filtros de rubro y las reglas de supermercados (días, % de descuento) miran
// el texto, así que una promo de "Mercados" tiene que decir "Supermercados".
const MODO_RUBROS: Record<string, string> = {
  "1": "Supermercados", "2": "Gastronomía", "3": "Indumentaria", "4": "Salud y Bienestar",
  "5": "Combustible", "6": "Salud y Bienestar", "7": "Hogar", "8": "Vehículos", "10": "Electrónica",
  "11": "Hogar", "12": "Mascotas", "13": "Juguetes", "14": "Entretenimiento",
};
const MODO_DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MODO_DIAS_TXT = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

// Todas las filas guardadas de MODO, de a 1000 (PostgREST corta cada consulta ahí).
async function modoTodas(cols: string): Promise<any[]> {
  const out: any[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_modo_cache").select(cols).order("id").range(d, d + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function modoJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: MODO_HEADERS });
  if (!r.ok) throw new Error(`MODO respondió ${r.status}`);
  return await r.json();
}
function sinAcentos(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
// Mismo formato que arma la app para el flyer (_promoDiasFormato): "Martes",
// "Viernes y sábados", "Todos los días".
export function modoDias(dias: unknown): string | null {
  const set = new Set((Array.isArray(dias) ? dias : []).map((d) => MODO_DIAS.indexOf(String(d).toLowerCase())).filter((i) => i >= 0));
  if (!set.size) return null;
  if (set.size === 7) return "Todos los días";
  const t = [...set].sort((a, b) => a - b).map((i) => MODO_DIAS_TXT[i]);
  const s = t.length === 1 ? t[0] : t.slice(0, -1).join(", ") + " y " + t[t.length - 1];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Las provincias de MODO vienen desparejas ("CABA", "Capital Federal",
// "Córdoba", "NEUQUÉN"): se llevan a los nombres de Galicia, que son los del
// filtro de la app. Lo que no se reconoce se descarta.
export function modoProvincia(p: unknown, nombres: string[]): string | null {
  const s = sinAcentos(p);
  if (!s) return null;
  if (/^(CABA|C\.?A\.?B\.?A\.?|CIUDAD (AUTONOMA )?DE BUENOS AIRES|CAPITAL( FEDERAL)?|CIUDAD AUTONOMA)$/.test(s)) return "CAPITAL FEDERAL";
  if (/^TIERRA DEL FUEGO/.test(s)) return nombres.includes("TIERRA DEL FUEGO") ? "TIERRA DEL FUEGO" : null;
  if (nombres.includes(s)) return s;
  if (s === "PROVINCIA DE BUENOS AIRES" || s === "GBA") return "BUENOS AIRES";
  return nombres.find((n) => s.startsWith(n + " ")) || null;
}
// Los locales de una promo (de a 500; las cadenas grandes pasan los 1400).
async function modoLocales(id: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const qs = new URLSearchParams({
      application_id: id, source: "web_modo", limit: "500", slots: "false", text_search: "",
      page: String(page), applications: "promotions", type: "onsite", hasGeolocation: "false",
    });
    const d = await modoJson(`${MODO_LOCALES}?${qs}`);
    const res = d?.results;
    if (!Array.isArray(res)) throw new Error("MODO cambió el formato de los locales");
    out.push(...res);
    const total = Number(d?.pagination?.total_pages || 1);
    // más de 10 páginas (5.000 locales): mejor "no se sabe" que media lista de provincias
    if (page === 10 && total > 10) throw new Error("demasiados locales (" + total + " páginas)");
    if (page >= total) break;
  }
  return out;
}
// El logo de la marca sale de sus locales (brand.img_square, 180×180), sólo si
// el nombre de la marca se parece al de la promo: "Combustible" tiene locales de
// Axion, Gulf, etc., y no tiene que quedar con el logo de una de ellas.
function modoClave(s: unknown): string {
  return sinAcentos(s).toLowerCase()
    .replace(/\b(supermercados?|super|hiper(mercados?)?|mayorista|farmacias?|perfumerias?|y|de|del|la|el|los|las|grupo|s ?a)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}
function modoMarcaLogo(locales: any[], titulo: string): { id: string; url: string } | null {
  const k = modoClave(titulo), cuenta = new Map<string, { n: number; url: string }>();
  for (const l of locales) {
    const b = l?.brand;
    if (!b?.id || !b?.img_square) continue;
    const kb = modoClave(b.name);
    if (!kb || !k || !(kb === k || (Math.min(kb.length, k.length) >= 4 && (kb.startsWith(k) || k.startsWith(kb))))) continue;
    const c = cuenta.get(String(b.id)) || { n: 0, url: String(b.img_square) };
    c.n++;
    cuenta.set(String(b.id), c);
  }
  let mejor: { id: string; url: string } | null = null, max = 0;
  for (const [id, c] of cuenta) if (c.n > max) { max = c.n; mejor = { id, url: c.url }; }
  return mejor;
}
// Copia el logo al bucket una sola vez (flyers/modo/<id de la marca>.png).
// Un logo que no se puede copiar no frena nada: la promo queda sin logo propio.
async function modoCopiarLogo(m: { id: string; url: string }, yaEstan: Set<string>): Promise<string | null> {
  const nombre = "modo/" + m.id.replace(/[^0-9a-zA-Z_-]/g, "") + ".png";
  if (yaEstan.has(nombre)) return nombre;
  try {
    const r = await fetch(m.url);
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") || "image/png";
    if (!/^image\//.test(tipo)) return null;
    const blob = await r.blob();
    const { error } = await admin.storage.from("flyers").upload(nombre, blob, { upsert: true, contentType: tipo });
    if (error) { console.error("modo logo:", error.message); return null; }
    yaEstan.add(nombre);
    return nombre;
  } catch (e) {
    console.error("modo logo:", String((e as Error)?.message || e));
    return null;
  }
}

async function syncModo(): Promise<{ total: number; conProvincia: number; conLogo: number }> {
  // 1) El listado con el filtro Galicia, de a 100 (MODO no acepta más por página).
  const crudo: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const qs = new URLSearchParams({
      slot_ids: MODO_SLOTS, banks: MODO_GALICIA, source: "web_modo", origin: "WEB_MODO",
      limit: "100", page: String(page),
    });
    const d = await modoJson(`${MODO_API}/v2/filter?${qs}`);
    if (!Array.isArray(d?.cards)) throw new Error("MODO cambió el formato del listado");
    crudo.push(...d.cards);
    const total = Number(d?.pagination?.total_pages || 1);
    // un listado cortado borraría las que no llegaron: se frena antes de tocar la tabla
    if (page === 20 && total > 20) throw new Error("MODO informa " + total + " páginas y se leen hasta 20: no se reemplaza por las dudas");
    if (page >= total) break;
  }
  // 2) Sólo las vigentes y las por empezar (MODO deja las terminadas en el listado).
  // "Hoy" en la Argentina: la actualización manual de la noche (después de las
  // 21) ya es mañana en UTC y descartaba las que vencen hoy.
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const vistos = new Set<string>();
  const list = crudo.filter((c) => {
    const id = String(c?.benefit?.id || "");
    if (!id || vistos.has(id)) return false;
    vistos.add(id);
    if (c?.calculated_status === "FINISHED_FOR_PRODUCT") return false;
    const hasta = isoFecha(c?.benefit?.conditions?.schedule?.stop_date);
    return !hasta || hasta >= hoy;
  });
  if (!crudo.length) throw new Error("MODO devolvió el listado vacío");
  // Si MODO cambia de lugar los datos (sin título o sin fechas en muchas), se
  // conserva la copia anterior en vez de guardar filas vacías y borrar las buenas.
  const rotas = list.filter((c) => !String(c?.card?.validity_place || "").trim() || !isoFecha(c?.benefit?.conditions?.schedule?.stop_date)).length;
  if (list.length && rotas > list.length * 0.2) throw new Error(`${rotas} de ${list.length} promociones de MODO vinieron sin nombre o sin fecha: MODO cambió el formato, no se reemplaza`);
  // El freno compara contra las guardadas que siguen vigentes HOY: las de MODO
  // vencen casi todas a fin de mes, y el día 1 llegarían "menos de la mitad"
  // de lo guardado aunque esté todo bien (y quedarían las vencidas).
  const { count: guardadas, error: eCount } = await admin.from("promos_modo_cache").select("id", { count: "exact", head: true })
    .or(`fecha_hasta.is.null,fecha_hasta.gte.${hoy}`);
  if (eCount) throw new Error("No se pudo contar la copia guardada de MODO: " + eCount.message);
  if (guardadas && list.length < guardadas * MINIMO_RELATIVO) {
    throw new Error(`MODO devolvió sólo ${list.length} promociones vigentes y la copia guardada tiene ${guardadas}: no se reemplaza por las dudas`);
  }

  // 3) Provincias (de la lista de Galicia, recién guardada por syncCatalogo).
  const { data: meta } = await admin.from("promos_galicia_meta").select("ubicaciones").eq("id", 1).maybeSingle();
  const nombres: string[] = (Array.isArray(meta?.ubicaciones) ? meta.ubicaciones : []).map((u: any) => sinAcentos(u?.nombre)).filter(Boolean);
  // Lo de la corrida anterior se conserva si ahora no se pueden pedir los locales.
  const prev = new Map<string, any>((await modoTodas("id,provincias,localidades,imagen")).map((p: any) => [p.id, p]));
  const { data: logos } = await admin.storage.from("flyers").list("modo", { limit: 1000 });
  const yaEstan = new Set<string>((logos || []).map((f: any) => "modo/" + f.name));
  // Logo de Galicia de la misma marca: para las que no tienen locales (online,
  // YPF en cuotas) o cuyos locales son de otra marca.
  // (de a 1000: PostgREST corta cada consulta ahí y Galicia tiene más de 2000)
  const logoGalicia = new Map<string, string>();
  for (let d = 0; ; d += 1000) {
    const { data: gal, error } = await admin.from("promos_galicia_cache").select("titulo,imagen").neq("imagen", "").order("id").range(d, d + 999);
    if (error) throw new Error("Leyendo los logos de Galicia: " + error.message);
    for (const g of gal || []) { const k = modoClave(g.titulo); if (k && !logoGalicia.has(k)) logoGalicia.set(k, g.imagen); }
    if (!gal || gal.length < 1000) break;
  }

  const extra = new Map<string, { provincias: string[] | null; localidades: string[] | null; imagen: string }>();
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const c = list[idx++];
      const id = String(c.benefit.id), titulo = String(c?.card?.validity_place || "").trim();
      const flujos: string[] = c?.benefit?.conditions?.payment_flow?.flows || [];
      const enLocal = flujos.some((f) => /instore|all|trip/.test(f));
      let provincias: string[] | null = null, localidades: string[] | null = null, imagen = "";
      let locales: any[] = [];
      let leyo = false;
      if (enLocal) {
        try { locales = await modoLocales(id); leyo = true; } catch (e) { console.error("modo locales", id, String((e as Error)?.message || e)); }
      }
      if (!enLocal) { provincias = []; localidades = []; } // sólo compra online: vale en todo el país
      else if (leyo && locales.length) {
        const ps = new Set<string>(), ls = new Set<string>();
        for (const l of locales) {
          const ciudad = sinAcentos(l?.city);
          // MODO carga locales de Capital con provincia "Buenos Aires" y ciudad "CABA"
          let p = modoProvincia(l?.province, nombres);
          if (p === "BUENOS AIRES" && /^(CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA DE BUENOS AIRES)$/.test(ciudad)) p = "CAPITAL FEDERAL";
          if (!p) continue;
          ps.add(p);
          if (ciudad) ls.add(p + "|" + ciudad);
        }
        // locales sin ninguna provincia reconocible: mejor "no se sabe" que "online"
        if (ps.size) { provincias = [...ps].sort(); localidades = [...ls].sort(); }
      } else if (!leyo) {
        const p = prev.get(id);
        if (p) { provincias = p.provincias; localidades = p.localidades; imagen = p.imagen || ""; }
      }
      // sin locales en el mapa (YPF en cuotas, "Transporte") y no es online: null = no se sabe
      // Logo: primero el de esa marca en Galicia (así la promo de MODO y la de
      // Galicia van en la misma tarjeta y el flyer usa el mismo dibujo), después
      // el de la marca en sus locales de MODO.
      const kg = logoGalicia.get(modoClave(titulo));
      if (kg) imagen = kg;
      else {
        const marca = modoMarcaLogo(locales, titulo);
        if (marca) imagen = (await modoCopiarLogo(marca, yaEstan)) || imagen;
      }
      for (const l of locales) { // todas las marcas vistas, para las promos sin locales propios
        const b = l?.brand, k = modoClave(b?.name);
        if (b?.id && b?.img_square && k && !marcasVistas.has(k)) marcasVistas.set(k, { id: String(b.id), url: String(b.img_square) });
      }
      extra.set(id, { provincias, localidades, imagen });
    }
  }
  const marcasVistas = new Map<string, { id: string; url: string }>();
  await Promise.all(Array.from({ length: 6 }, worker));
  // Las que quedaron sin logo (YPF en cuotas no tiene locales en el mapa): el de
  // la misma marca visto en los locales de otra promo.
  for (const c of list) {
    const x = extra.get(String(c.benefit.id))!;
    if (x.imagen) continue;
    const m = marcasVistas.get(modoClave(c?.card?.validity_place));
    if (m) x.imagen = (await modoCopiarLogo(m, yaEstan)) || "";
  }
  // Las que no tienen locales en el mapa (las próximas todavía no los cargan) toman
  // los de otra promo de la misma marca que sí los tiene (Basualdo de noviembre =
  // los locales de Basualdo de octubre). Si no hay, quedan sin dato (null).
  const geoMarca = new Map<string, { p: Set<string>; l: Set<string> }>();
  for (const c of list) {
    const x = extra.get(String(c.benefit.id))!, k = modoClave(c?.card?.validity_place);
    if (!k || !Array.isArray(x.provincias) || !x.provincias.length) continue;
    const g = geoMarca.get(k) || { p: new Set<string>(), l: new Set<string>() };
    x.provincias.forEach((v) => g.p.add(v));
    (x.localidades || []).forEach((v) => g.l.add(v));
    geoMarca.set(k, g);
  }
  for (const c of list) {
    const x = extra.get(String(c.benefit.id))!;
    if (x.provincias !== null) continue;
    const g = geoMarca.get(modoClave(c?.card?.validity_place));
    if (g) { x.provincias = [...g.p].sort(); x.localidades = [...g.l].sort(); }
  }

  const syncStartedAt = new Date().toISOString();
  const rows = list.map((c) => {
    const b = c.benefit, s = b?.conditions?.schedule || {}, x = extra.get(String(b.id))!;
    const tope = Number(c?.card?.cashback_cap || 0);
    const rubro = MODO_RUBROS[String((c?.offer?.categories || [])[0] ?? "")] || "Otros";
    return {
      id: String(b.id),
      slug: String(b?.publication?.slug || ""),
      titulo: String(c?.card?.validity_place || "").replace(/\s+/g, " ").trim(),
      subtitulo: rubro,
      imagen: x.imagen,
      beneficio: String(c?.card?.benefit || "").replace(/\s+/g, " ").trim() || null,
      tope: tope > 0 ? String(tope) : null,
      dias: modoDias(s.days_of_week),
      canales: b?.conditions?.payment_flow?.flows || [],
      solo_galicia: (c?.offer?.requirements?.banks?.list || []).length === 1,
      provincias: x.provincias,
      localidades: x.localidades,
      fecha_desde: isoFecha(s.start_date),
      fecha_hasta: isoFecha(s.stop_date),
      proximamente: c?.calculated_status === "NEXT_FOR_PRODUCT" || (isoFecha(s.start_date) || "") > hoy,
      updated_at: syncStartedAt,
      // primera_vez no se manda: la pone la base al insertar (como en Galicia)
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("promos_modo_cache").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error("Guardando las promos de MODO: " + error.message);
  }
  const { error: delErr } = await admin.from("promos_modo_cache").delete().lt("updated_at", syncStartedAt);
  if (delErr) throw new Error("Limpiando las promos de MODO: " + delErr.message);
  return {
    total: rows.length,
    conProvincia: rows.filter((r) => Array.isArray(r.provincias)).length,
    conLogo: rows.filter((r) => r.imagen).length,
  };
}
// Corre después del catálogo de Galicia y nunca lo hace fallar: el error queda
// en promos_galicia_meta (modo_error) y lo devuelve la acción para el mail.
async function syncModoSeguro(): Promise<{ data?: unknown; error?: string }> {
  try {
    const data = await syncModo();
    await admin.from("promos_galicia_meta")
      .update({ modo_last_sync_at: new Date().toISOString(), modo_total: data.total, modo_error: null }).eq("id", 1);
    return { data };
  } catch (e) {
    const msg = (e as Error)?.message || "error desconocido";
    console.error("promos modo:", msg);
    await admin.from("promos_galicia_meta").update({ modo_error: msg }).eq("id", 1);
    return { error: msg };
  }
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
      const data: Record<string, unknown> = await syncCatalogo();
      if (data.geoError) await avisarAdmin(MAILS.sinProvincias(String(data.geoError)));
      const modo = await syncModoSeguro();
      data.modo = modo.data ?? null;
      if (modo.error) { data.modoError = modo.error; await avisarAdmin(MAILS.modo(modo.error)); }
      // marcas vigiladas: aparte, para que un error acá no tape la actualización
      try { await revisarVigiladas(); } catch (e) { console.error("vigiladas:", String((e as Error)?.message || e)); }
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
      const data: Record<string, unknown> = await syncCatalogo();
      const modo = await syncModoSeguro();
      data.modo = modo.data ?? null;
      if (modo.error) data.modoError = modo.error;
      // la actualización a mano también revisa las marcas vigiladas (la firma evita repetir el mail)
      try { await revisarVigiladas(); } catch (e) { console.error("vigiladas:", String((e as Error)?.message || e)); }
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
