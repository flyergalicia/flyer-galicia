// Edge Function: auth-admin
// Centraliza las operaciones privilegiadas que antes usaban la service_role
// desde el cliente. La service_role NUNCA sale del servidor.
//
// Acciones:
//   register       (público)  -> crea cuenta confirmada en estado pending.
//                                 Sólo mails @bancogalicia.com.ar; si el mail ya
//                                 existe responde igual que un alta (no filtra).
//   request_reset  (público)  -> guarda un PEDIDO de nueva clave y deja la
//                                 cuenta en reset_pending. No toca la clave
//                                 real todavía (ver approve_reset). Sólo para
//                                 cuentas activas: una inactiva/pending no se
//                                 reactiva por esta vía.
//   approve_reset  (admin)    -> aplica el pedido de nueva clave guardado
//   deny_reset     (admin)    -> descarta el pedido y reactiva la cuenta
//   create_user    (admin)    -> crea usuario con rol/estado elegido por el admin
//   set_password   (admin)    -> cambia la clave de un usuario
//   approve_user   (admin)    -> activa una cuenta pendiente/inactiva
//   notify_self_password (con sesión) -> sólo manda el aviso al propio usuario
//   Todas avisan por mail a quien corresponda (ver avisar()).
//
// request_reset NUNCA cambia la clave real en el momento: si lo hiciera,
// cualquiera sin sesión podría pisarle la contraseña a otra persona con solo
// saber su mail, dejándola bloqueada (o tomada, si el admin aprueba sin
// verificar). El cambio real sólo ocurre en approve_reset, después de que un
// admin lo revisa.
// Versión FIJA, la misma que usa la app (SUPABASE_JS_URL en _build.mjs): con "@2"
// cada deploy tomaba la última 2.x que hubiera, sin que nadie la probara.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Preferimos la nueva secret key (ADMIN_SECRET); fallback a la legacy mientras
// dure la transición. Cuando se deshabiliten las legacy, ADMIN_SECRET es la que rige.
const SERVICE_KEY = Deno.env.get("ADMIN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// La clave nueva que alguien pide en "olvidé mi contraseña" espera en la base
// hasta que un admin la resuelve. Se guarda CIFRADA (AES-GCM) con una clave que
// sale del secreto de esta función: quien lea la tabla o un backup no la ve.
// "v1:" + base64(iv 12 bytes + cifrado). Un valor sin el prefijo es un pedido
// viejo, guardado antes de este cambio, y se acepta tal cual.
async function _claveCifrado(): Promise<CryptoKey> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fg-reset-v1|" + SERVICE_KEY));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function cifrarClave(plano: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await _claveCifrado(), new TextEncoder().encode(plano)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  let bin = ""; for (const b of out) bin += String.fromCharCode(b);
  return "v1:" + btoa(bin);
}
// Devuelve null si no se puede descifrar (secreto rotado o dato dañado).
async function descifrarClave(guardado: string): Promise<string | null> {
  if (!guardado.startsWith("v1:")) return guardado;
  try {
    const bin = atob(guardado.slice(3));
    const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, await _claveCifrado(), buf.slice(12));
    return new TextDecoder().decode(pt);
  } catch (_e) {
    return null;
  }
}

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

// Admin Y activo: un admin desactivado no opera hasta que otro admin lo
// reactive. Un pedido de cambio de clave pendiente NO lo frena: ese pedido lo
// puede iniciar cualquiera sabiendo el mail, y si bloqueara, un desconocido
// podría dejar sin acceso al admin. Antes alcanzaba con el rol.
// Devuelve quién es (para la auditoría) o null si no es un admin válido.
type Actor = { id: string; email: string };
async function requireAdmin(req: Request): Promise<Actor | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: prof } = await admin
    .from("profiles").select("role,status").eq("id", data.user.id).single();
  const ok = !!prof && prof.role === "admin" && (prof.status === "active" || prof.status === "reset_pending");
  return ok ? { id: data.user.id, email: data.user.email || "" } : null;
}

// ── Límite por IP (acciones públicas) ─────────────────────────────────────────
// La IP la pone el proxy de Supabase (Cloudflare) en cf-connecting-ip y quien
// llama no la puede falsear (probado: mandar x-forwarded-for / x-real-ip
// inventados no cambia la IP contada). x-forwarded-for y x-real-ip SÍ los puede
// escribir el cliente, así que NO se usan: sin esa cabecera no hay límite
// (antes que un límite que se evade cambiando una cabecera).
// En una oficina muchas personas comparten IP, así que los topes son holgados:
// frenan a un script, no a compañeros.
function ipDe(req: Request): string {
  return (req.headers.get("cf-connecting-ip") || "").trim();
}
// true = puede seguir. Si no hay IP, o la base falla, deja pasar (un límite roto
// no puede tirar abajo el alta ni la recuperación de clave).
async function dentroDelLimite(req: Request, accion: string, max: number, segundos: number): Promise<boolean> {
  const ip = ipDe(req);
  if (!ip) return true;
  try {
    const { data, error } = await admin.rpc("rate_limit_hit", { p_clave: accion + "|" + ip, p_max: max, p_segundos: segundos });
    if (error) { console.error("rate_limit:", error.message); return true; }
    return data !== false;
  } catch (e) {
    console.error("rate_limit:", String((e as Error)?.message || e));
    return true;
  }
}
// Deshace un alta cuyo perfil no se pudo guardar. Si ni eso se puede, queda un
// acceso sin perfil: se deja constancia en la auditoría para que el admin lo vea.
async function deshacerAlta(uid: string, email: string, actor: Actor | null, origen: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    console.error(origen + ": no se pudo deshacer el alta:", error.message);
    await auditar(actor, "alta_a_medias", { id: uid, email }, { origen, error: error.message });
  }
}
const MSG_DEMASIADOS = "Hiciste demasiados intentos seguidos. Esperá un rato y probá de nuevo.";

// ── Auditoría ────────────────────────────────────────────────────────────────
// Una fila por acción sensible. NUNCA se guarda una clave. Si no se puede
// escribir, se anota en el log de la función y la operación sigue igual.
async function auditar(
  actor: Actor | null, accion: string,
  objetivo?: { id?: string | null; email?: string | null } | null,
  detalle?: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await admin.from("audit_log").insert({
      actor_id: actor?.id ?? null, actor_email: actor?.email ?? null, accion,
      objetivo_id: objetivo?.id ?? null, objetivo_email: objetivo?.email ?? null, detalle: detalle ?? null,
    });
    if (error) console.error("audit:", error.message);
  } catch (e) {
    console.error("audit:", String((e as Error)?.message || e));
  }
}

// ── Mails de aviso ───────────────────────────────────────────────────────────
// Los manda una cuenta de Gmail propia de la app a través de un Google Apps
// Script publicado como aplicación web (supabase/mail/apps-script.gs): gratis y
// sin claves de mail guardadas acá. Si los secretos no están cargados, no se
// manda nada y todo sigue funcionando igual.
// Reglas fijas: NUNCA la contraseña y NUNCA links ni imágenes (ya saben dónde
// está la app; así no se parece a un phishing y no hay nada que robar). Un mail
// que falla jamás hace fallar la operación.
const MAIL_URL = Deno.env.get("MAIL_HOOK_URL") || "";
const MAIL_SECRET = Deno.env.get("MAIL_HOOK_SECRET") || "";
const MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Un mail = asunto + contenido estructurado. Se arma en dos versiones: HTML con
// el aspecto de la app y texto plano (para clientes que no muestran HTML).
type Mail = {
  asunto: string;
  titulo: string;
  saludo?: string; // "Hola Ana:"
  parrafos: string[];
  datos?: [string, string][]; // recuadro con datos (etiqueta, valor)
  alerta?: string; // aviso destacado, ej. "¿No fuiste vos?..."
};

const ACENTO = "#F26122";
const MARINO = "#14213D";
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function armarTexto(m: Mail): string {
  const l: string[] = [m.titulo.toUpperCase(), ""];
  if (m.saludo) l.push(m.saludo, "");
  m.parrafos.forEach((p) => l.push(p, ""));
  if (m.datos?.length) { m.datos.forEach(([k, v]) => l.push(`${k}: ${v}`)); l.push(""); }
  if (m.alerta) l.push("IMPORTANTE: " + m.alerta, "");
  l.push("—", "Armador de flyers · Mensaje automático.", "Nunca te vamos a pedir tu contraseña por mail.");
  return l.join("\n");
}
// Tablas + estilos en línea: es lo único que respetan Outlook y Gmail.
function armarHtml(m: Mail): string {
  const F = "font-family:'Segoe UI',Helvetica,Arial,sans-serif;";
  const parrafos = m.parrafos.map((p) =>
    `<p style="${F}margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2f36">${esc(p)}</p>`).join("");
  const datos = m.datos?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:#f6f7f9;border-radius:8px"><tr><td style="padding:12px 16px">` +
      m.datos.map(([k, v]) =>
        `<div style="${F}font-size:14px;line-height:1.7;color:#2b2f36"><span style="color:#6b7280">${esc(k)}:</span> <strong>${esc(v)}</strong></div>`).join("") +
      `</td></tr></table>`
    : "";
  const alerta = m.alerta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr>` +
      `<td style="border-left:4px solid ${ACENTO};background:#fff4ed;padding:12px 16px;border-radius:0 8px 8px 0">` +
      `<div style="${F}font-size:14px;line-height:1.55;color:#7a3300"><strong>Importante.</strong> ${esc(m.alerta)}</div></td></tr></table>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.asunto)}</title></head>` +
    `<body style="margin:0;padding:0;background:#eceef2">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2"><tr><td align="center" style="padding:28px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">` +
    `<tr><td style="background:${MARINO};padding:20px 28px;border-bottom:4px solid ${ACENTO}">` +
    `<div style="${F}font-size:18px;font-weight:700;letter-spacing:.2px;color:#ffffff">Armador de flyers</div></td></tr>` +
    `<tr><td style="padding:28px 28px 10px">` +
    `<h1 style="${F}margin:0 0 18px;font-size:21px;line-height:1.3;color:${MARINO}">${esc(m.titulo)}</h1>` +
    (m.saludo ? `<p style="${F}margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2f36">${esc(m.saludo)}</p>` : "") +
    parrafos + datos + alerta +
    `</td></tr>` +
    `<tr><td style="padding:14px 28px 24px;border-top:1px solid #e5e7eb">` +
    `<div style="${F}font-size:12px;line-height:1.6;color:#6b7280">Mensaje automático del Armador de flyers.<br>Nunca te vamos a pedir tu contraseña por mail.</div>` +
    `</td></tr></table></td></tr></table></body></html>`;
}

async function enviar(to: string[], m: Mail): Promise<void> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(MAIL_URL, {
      method: "POST",
      // text/plain: el Apps Script lee el cuerpo crudo (evita el preflight).
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: MAIL_SECRET, to: to.join(","), subject: m.asunto, body: armarTexto(m), html: armarHtml(m),
      }),
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
// Se manda en segundo plano (la respuesta no espera al mail): así tampoco se
// puede deducir por la demora si un mail tiene cuenta o no.
function avisar(to: string | string[] | null | undefined, m: Mail): void {
  if (!MAIL_URL || !MAIL_SECRET) return;
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || "").trim().toLowerCase()).filter((x) => MAIL_RE.test(x));
  if (!list.length) return;
  const p = enviar([...new Set(list)], m);
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p);
}
// A dónde llegan los avisos al administrador. Se fija con el secreto MAIL_ADMIN
// (lista separada por comas): el mail con el que el admin ingresa a la app
// puede no ser el que quiere para estos avisos (en la base figura el de
// ingreso). Sin ese secreto, se usan los mails de los admin activos.
const MAIL_ADMIN = (Deno.env.get("MAIL_ADMIN") || "").split(",").map((x) => x.trim()).filter((x) => MAIL_RE.test(x));
async function mailsAdmins(): Promise<string[]> {
  if (MAIL_ADMIN.length) return MAIL_ADMIN;
  const { data } = await admin.from("profiles").select("email").eq("role", "admin").in("status", ["active", "reset_pending"]);
  return (data || []).map((r: { email: string | null }) => r.email || "").filter(Boolean);
}
async function perfil(uid: string): Promise<{ email: string; nombre: string; status: string } | null> {
  const { data } = await admin.from("profiles").select("email,full_name,status").eq("id", uid).maybeSingle();
  if (!data) return null;
  return { email: data.email || "", nombre: data.full_name || "", status: data.status || "" };
}
function hola(nombre: string): string {
  const n = String(nombre || "").trim().split(" ")[0];
  return n ? `Hola ${n}:` : "Hola:";
}

// Los textos de cada aviso, en un solo lugar. Ninguno lleva la contraseña.
const NO_FUI_YO = "Si no fuiste vos, avisale al administrador cuanto antes.";
const MAILS = {
  accesoAdmin: (nombre: string, email: string): Mail => ({
    asunto: "Armador de flyers · Nueva solicitud de acceso",
    titulo: "Nueva solicitud de acceso",
    parrafos: ["Una persona pidió acceso al Armador de flyers y está esperando tu aprobación."],
    datos: [["Nombre", nombre], ["Mail", email]],
  }),
  accesoUsuario: (nombre: string): Mail => ({
    asunto: "Armador de flyers · Recibimos tu solicitud",
    titulo: "Recibimos tu solicitud de acceso",
    saludo: hola(nombre),
    parrafos: [
      "Recibimos tu solicitud para usar el Armador de flyers. Un administrador la va a revisar y te avisaremos por este medio cuando tu cuenta esté activa.",
      "Si no realizaste esta solicitud, podés ignorar este mensaje.",
    ],
  }),
  cuentaActiva: (nombre: string): Mail => ({
    asunto: "Armador de flyers · Tu cuenta ya está activa",
    titulo: "Tu cuenta ya está activa",
    saludo: hola(nombre),
    parrafos: ["Un administrador aprobó tu cuenta. Ya podés ingresar al Armador de flyers con tu mail y tu contraseña."],
  }),
  cuentaCreada: (nombre: string, email: string): Mail => ({
    asunto: "Armador de flyers · Se creó tu cuenta",
    titulo: "Se creó tu cuenta",
    saludo: hola(nombre),
    parrafos: [
      "Un administrador creó tu cuenta en el Armador de flyers.",
      "La contraseña inicial te la comunica el administrador. Te recomendamos cambiarla en tu primer ingreso, desde el menú de tu nombre → Cambiar contraseña.",
    ],
    datos: [["Usuario", email]],
  }),
  resetAdmin: (nombre: string, email: string): Mail => ({
    asunto: "Armador de flyers · Pedido de cambio de contraseña",
    titulo: "Pedido de cambio de contraseña",
    parrafos: ["Una persona pidió cambiar su contraseña. Revisalo en el panel de Administración → Usuarios y aprobalo o rechazalo."],
    datos: [["Nombre", nombre], ["Mail", email]],
  }),
  resetUsuario: (nombre: string): Mail => ({
    asunto: "Armador de flyers · Recibimos tu pedido de cambio de contraseña",
    titulo: "Recibimos tu pedido de cambio de contraseña",
    saludo: hola(nombre),
    parrafos: [
      "Un administrador va a revisar tu pedido y te avisaremos por este medio cuando esté resuelto.",
      "Mientras tanto, tu contraseña actual sigue vigente.",
    ],
    alerta: "Si no fuiste vos quien lo pidió, avisale al administrador cuanto antes.",
  }),
  resetAprobado: (nombre: string): Mail => ({
    asunto: "Armador de flyers · Tu nueva contraseña ya está activa",
    titulo: "Tu nueva contraseña ya está activa",
    saludo: hola(nombre),
    parrafos: ["Un administrador aprobó tu cambio de contraseña. Ya podés ingresar al Armador de flyers con la contraseña nueva que elegiste."],
  }),
  resetRechazado: (nombre: string): Mail => ({
    asunto: "Armador de flyers · Tu pedido de cambio de contraseña no fue aprobado",
    titulo: "Tu pedido de cambio de contraseña no fue aprobado",
    saludo: hola(nombre),
    parrafos: [
      "Un administrador no aprobó el cambio. Seguí ingresando con tu contraseña actual, que no se modificó.",
      "Si necesitás cambiarla, comunicate con el administrador.",
    ],
  }),
  claveCambiadaAdmin: (nombre: string): Mail => ({
    asunto: "Armador de flyers · Un administrador cambió tu contraseña",
    titulo: "Un administrador cambió tu contraseña",
    saludo: hola(nombre),
    parrafos: ["Un administrador cambió la contraseña de tu cuenta. La nueva te la comunica él directamente."],
    alerta: "Si no esperabas este cambio, hablá con el administrador.",
  }),
  pedidoEstudio: (autor: string, diseno: string, empresa: string, opcion: string): Mail => ({
    asunto: "Armador de flyers · Nuevo pedido en Estudio",
    titulo: "Nuevo pedido en Estudio",
    parrafos: ["Alguien pidió publicar un diseño de Estudio. Revisalo en la solapa Estudio → Pedidos, donde podés verlo completo y aprobarlo o no."],
    datos: [["Autor", autor], ["Diseño", diseno], ["Empresa", empresa || "—"], ["Flyer base", opcion]],
  }),
  claveCambiadaPropia: (nombre: string): Mail => ({
    asunto: "Armador de flyers · Cambiaste tu contraseña",
    titulo: "Cambiaste tu contraseña",
    saludo: hola(nombre),
    parrafos: ["Te confirmamos que la contraseña de tu cuenta del Armador de flyers fue modificada."],
    alerta: NO_FUI_YO,
  }),
};

function isDup(m: string): boolean {
  return /already|registered|exists/i.test(m);
}
function dupMsg(m: string): string {
  return isDup(m) ? "Ya existe una cuenta con ese email." : m;
}

// Sólo mails del banco pueden autorregistrarse (decisión del usuario, 2026-09-11).
// El admin sigue pudiendo crear cualquier cuenta desde el panel (create_user).
const DOMINIO_RE = /^[^@\s]+@bancogalicia\.com\.ar$/;
const ROLES = ["admin", "vip", "pro", "asesor", "hunter", "lider"];
const ESTADOS_ALTA = ["active", "inactive"];
// Nombre visible: largo acotado y sin < > (defensa en profundidad: el cliente
// además escapa todo lo que pinta, pero no hay por qué guardar HTML en la base).
function limpiarNombre(s: unknown): string {
  return String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const action = String(body.action || "");

  try {
    if (action === "register") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const full_name = limpiarNombre(body.full_name);
      if (!email || !full_name || password.length < 8) return json({ error: "Datos inválidos" }, 400);
      if (!DOMINIO_RE.test(email)) return json({ error: "Sólo se aceptan mails @bancogalicia.com.ar." }, 400);
      // Tope por IP: 15 altas por hora (una oficina entera entra de sobra).
      if (!(await dentroDelLimite(req, "register", 15, 3600))) return json({ error: MSG_DEMASIADOS }, 429);
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      });
      if (error) {
        // Mail ya registrado: misma respuesta que un alta exitosa, sin tocar la
        // cuenta existente. Antes se avisaba "ya existe una cuenta", lo que
        // permitía averiguar qué mails tienen usuario acá.
        if (isDup(error.message)) return json({ ok: true });
        return json({ error: error.message }, 400);
      }
      // `email` también: request_reset busca el perfil por esa columna.
      const { error: eProf } = await admin.from("profiles").upsert(
        { id: data.user.id, full_name, email, email_asesor: email, status: "pending", role: "asesor" },
        { onConflict: "id" },
      );
      if (eProf) {
        // Un usuario de acceso sin perfil queda a medias: se deshace el alta.
        console.error("register: perfil:", eProf.message);
        await deshacerAlta(data.user.id, email, null, "register");
        return json({ error: "No se pudo completar el alta. Probá de nuevo en unos minutos." }, 500);
      }
      await auditar(null, "register", { id: data.user.id, email }, { ip: ipDe(req) });
      avisar(await mailsAdmins(), MAILS.accesoAdmin(full_name, email));
      avisar(email, MAILS.accesoUsuario(full_name));
      return json({ ok: true });
    }

    if (action === "request_reset") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || password.length < 8) return json({ error: "Datos inválidos" }, 400);
      // Tope por IP (independiente de la cuenta): 15 pedidos por hora. Se corta
      // antes de buscar nada, así no depende de que el mail exista.
      if (!(await dentroDelLimite(req, "request_reset", 15, 3600))) return json({ error: MSG_DEMASIADOS }, 429);
      // Misma respuesta exista o no la cuenta: no le da a un desconocido forma
      // de averiguar qué mails tienen usuario acá.
      const generic = { ok: true };
      const { data: prof } = await admin
        .from("profiles").select("id,status,last_reset_request_at,full_name").eq("email", email).maybeSingle();
      if (!prof) return json(generic);
      // Sólo cuentas activas (o con un pedido ya en curso) pueden pedir cambio
      // de clave. Una cuenta desactivada o nunca aprobada NO: si se dejara,
      // aprobar/rechazar el pedido la ponía en "active" y se colaba una
      // reactivación por la puerta de "olvidé mi contraseña".
      if (prof.status !== "active" && prof.status !== "reset_pending") return json(generic);
      // Rate-limit silencioso: un pedido nuevo por cuenta cada 15 minutos.
      const last = prof.last_reset_request_at ? new Date(prof.last_reset_request_at).getTime() : 0;
      if (Date.now() - last < 15 * 60 * 1000) return json(generic);
      // Guarda el pedido (cifrado); NO toca la clave real todavía (ver approve_reset).
      // La cuenta queda marcada "reset_pending" para que el admin la vea, pero
      // sigue funcionando con la clave de siempre: si el pedido la bloqueara,
      // cualquiera con el mail ajeno podría dejar sin acceso a esa persona.
      const { error: eP } = await admin.from("pending_password_resets").upsert(
        { user_id: prof.id, new_password: await cifrarClave(password), requested_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (eP) {
        console.error("request_reset: pedido:", eP.message);
        return json({ error: "No se pudo registrar el pedido. Probá de nuevo en unos minutos." }, 500);
      }
      const { error: eU } = await admin.from("profiles")
        .update({ status: "reset_pending", last_reset_request_at: new Date().toISOString() })
        .eq("id", prof.id);
      if (eU) {
        // Sin la marca el admin no vería el pedido: se descarta para no dejarlo huérfano.
        console.error("request_reset: perfil:", eU.message);
        await admin.from("pending_password_resets").delete().eq("user_id", prof.id);
        return json({ error: "No se pudo registrar el pedido. Probá de nuevo en unos minutos." }, 500);
      }
      await auditar(null, "request_reset", { id: prof.id, email }, { ip: ipDe(req) });
      const quien = prof.full_name || email;
      avisar(await mailsAdmins(), MAILS.resetAdmin(quien, email));
      avisar(email, MAILS.resetUsuario(prof.full_name));
      return json(generic);
    }

    if (action === "approve_reset") {
      const actor = await requireAdmin(req);
      if (!actor) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      const { data: pending } = await admin
        .from("pending_password_resets").select("new_password").eq("user_id", uid).maybeSingle();
      if (!pending) return json({ error: "No hay un cambio de clave pendiente para este usuario." }, 404);
      const claveNueva = await descifrarClave(String(pending.new_password || ""));
      if (!claveNueva) return json({ error: "No se pudo leer el pedido de clave. Rechazalo y pedile a la persona que lo haga de nuevo." }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid, { password: claveNueva });
      if (error) return json({ error: error.message }, 400);
      // La clave ya cambió. Si ahora falla cerrar el pedido, se avisa y el admin
      // puede volver a tocar "Aprobar": como el pedido sigue guardado, repite la
      // misma clave y termina de cerrar (es idempotente).
      const { error: eAct } = await admin.from("profiles").update({ status: "active" }).eq("id", uid);
      if (eAct) {
        console.error("approve_reset: perfil:", eAct.message);
        await auditar(actor, "approve_reset", { id: uid }, { parcial: true });
        return json({ error: "La clave se cambió, pero no se pudo cerrar el pedido. Tocá Aprobar de nuevo para terminar." }, 500);
      }
      const { error: eDel } = await admin.from("pending_password_resets").delete().eq("user_id", uid);
      if (eDel) console.error("approve_reset: borrar pedido:", eDel.message); // la clave ya está aplicada; el pedido viejo no hace daño
      const pa = await perfil(uid);
      await auditar(actor, "approve_reset", { id: uid, email: pa?.email });
      if (pa) avisar(pa.email, MAILS.resetAprobado(pa.nombre));
      return json({ ok: true });
    }

    if (action === "deny_reset") {
      const actor = await requireAdmin(req);
      if (!actor) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      const { error: eDel } = await admin.from("pending_password_resets").delete().eq("user_id", uid);
      const { error: eAct } = await admin.from("profiles").update({ status: "active" }).eq("id", uid);
      if (eDel || eAct) {
        console.error("deny_reset:", eDel?.message, eAct?.message);
        return json({ error: "No se pudo rechazar el pedido. Probá de nuevo." }, 500);
      }
      const pd = await perfil(uid);
      await auditar(actor, "deny_reset", { id: uid, email: pd?.email });
      if (pd) avisar(pd.email, MAILS.resetRechazado(pd.nombre));
      return json({ ok: true });
    }

    // Aprueba una cuenta (pending/inactive → active) y le avisa por mail.
    // Idempotente: el panel también la llama después de pasar a alguien a
    // "activo" desde Editar usuario, sólo para que salga el aviso.
    if (action === "approve_user") {
      const actor = await requireAdmin(req);
      if (!actor) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      const pu = await perfil(uid);
      if (!pu) return json({ error: "No existe ese usuario." }, 404);
      // Un cambio de clave pendiente se resuelve aprobando o rechazando ese
      // pedido: activar la cuenta acá lo dejaría colgado.
      if (pu.status === "reset_pending") return json({ error: "Tiene un cambio de clave pendiente: aprobalo o rechazalo." }, 400);
      if (pu.status !== "active") {
        const { error } = await admin.from("profiles").update({ status: "active" }).eq("id", uid);
        if (error) return json({ error: error.message }, 400);
      }
      await auditar(actor, "approve_user", { id: uid, email: pu.email }, { estado_anterior: pu.status });
      avisar(pu.email, MAILS.cuentaActiva(pu.nombre));
      return json({ ok: true });
    }

    // Aviso al propio usuario cuando cambia su clave desde el menú (el cambio
    // lo hace el navegador con su sesión; acá sólo sale el mail, y sólo a él).
    if (action === "notify_self_password") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "No autorizado" }, 403);
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user) return json({ error: "No autorizado" }, 403);
      const ps = await perfil(u.user.id);
      avisar(u.user.email || ps?.email, MAILS.claveCambiadaPropia(ps?.nombre || ""));
      return json({ ok: true });
    }

    // Aviso al admin cuando alguien pide publicar un diseño de Estudio. Lo pide el
    // navegador del autor después de pasar el diseño a "pedido"; acá se valida
    // que sea suyo y que de verdad esté pedido (si no, no sale nada).
    if (action === "notify_estudio_pedido") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "No autorizado" }, 403);
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user) return json({ error: "No autorizado" }, 403);
      if (!(await dentroDelLimite(req, "notify_estudio_pedido", 10, 3600))) return json({ error: MSG_DEMASIADOS }, 429);
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Datos inválidos" }, 400);
      const { data: d } = await admin.from("flyer_disenos").select("user_id,autor,nombre,empresa,opcion,estado,pedido_at").eq("id", id).maybeSingle();
      if (!d || d.user_id !== u.user.id || d.estado !== "pedido" || !d.pedido_at) return json({ ok: true });
      // UN mail por pedido (pedido_at lo pone la base al pasar a "pedido"; volver a
      // pedir después de un rechazo es otro pedido) y sólo recién hecho: repetir la
      // llamada no manda más mails.
      if (Date.now() - new Date(d.pedido_at).getTime() > 10 * 60 * 1000) return json({ ok: true });
      try {
        const { data: ok1, error: e1 } = await admin.rpc("rate_limit_hit", { p_clave: "estudio_pedido|" + id + "|" + d.pedido_at, p_max: 1, p_segundos: 30 * 24 * 3600 });
        // ante la duda, no sale: el admin igual ve el numerito de pedidos en la solapa
        if (e1 || ok1 === false) { if (e1) console.error("estudio_pedido:", e1.message); return json({ ok: true }); }
      } catch (e) { console.error("estudio_pedido:", String((e as Error)?.message || e)); return json({ ok: true }); }
      avisar(await mailsAdmins(), MAILS.pedidoEstudio(limpiarNombre(d.autor), limpiarNombre(d.nombre), limpiarNombre(d.empresa), "Opción " + Number(d.opcion || 0)));
      return json({ ok: true });
    }

    if (action === "create_user") {
      const actor = await requireAdmin(req);
      if (!actor) return json({ error: "No autorizado" }, 403);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const full_name = limpiarNombre(body.full_name);
      const role = String(body.role || "asesor");
      const status = String(body.status || "active");
      if (!email || password.length < 8) return json({ error: "Datos inválidos" }, 400);
      if (!ROLES.includes(role)) return json({ error: "Rol inválido" }, 400);
      if (!ESTADOS_ALTA.includes(status)) return json({ error: "Estado inválido" }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      });
      if (error) return json({ error: dupMsg(error.message) }, 400);
      const { error: eProf } = await admin.from("profiles").upsert(
        { id: data.user.id, email, email_asesor: email, full_name, role, status },
        { onConflict: "id" },
      );
      if (eProf) {
        // Sin perfil el rol y el estado elegidos se perderían: se deshace el alta.
        console.error("create_user: perfil:", eProf.message);
        await deshacerAlta(data.user.id, email, actor, "create_user");
        return json({ error: "No se pudo crear el usuario. Probá de nuevo." }, 500);
      }
      await auditar(actor, "create_user", { id: data.user.id, email }, { rol: role, estado: status });
      // Sólo si quedó activa: una cuenta creada inactiva recibe el aviso
      // cuando se la active (approve_user).
      if (status === "active") avisar(email, MAILS.cuentaCreada(full_name, email));
      return json({ ok: true, id: data.user.id });
    }

    if (action === "set_password") {
      const actor = await requireAdmin(req);
      if (!actor) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      const password = String(body.password || "");
      if (!uid || password.length < 8) return json({ error: "Datos inválidos" }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid, { password });
      if (error) return json({ error: error.message }, 400);
      const pp = await perfil(uid);
      await auditar(actor, "set_password", { id: uid, email: pp?.email });
      if (pp) avisar(pp.email, MAILS.claveCambiadaAdmin(pp.nombre));
      return json({ ok: true });
    }

    if (action === "delete_user") {
      const actor = await requireAdmin(req);
      if (!actor) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      // No permitir que un admin se elimine a sí mismo.
      if (actor.id === uid) return json({ error: "No podés eliminar tu propia cuenta." }, 400);
      // Foto del perfil antes de tocar nada: sirve para la auditoría y para
      // devolverlo si falla el segundo paso.
      const { data: antes } = await admin.from("profiles").select("*").eq("id", uid).maybeSingle();
      // Borrar el perfil primero; los flyer_logs quedan con user_id NULL (FK SET NULL).
      const { error: eProf } = await admin.from("profiles").delete().eq("id", uid);
      if (eProf) {
        console.error("delete_user: perfil:", eProf.message);
        return json({ error: "No se pudo eliminar el usuario. No se borró nada." }, 500);
      }
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) {
        // El perfil ya se había borrado: se restituye para no dejar un acceso vivo sin perfil.
        if (antes) {
          const { error: eBack } = await admin.from("profiles").upsert(antes, { onConflict: "id" });
          if (eBack) {
            console.error("delete_user: restituir perfil:", eBack.message);
            await auditar(actor, "baja_a_medias", { id: uid, email: antes?.email }, { error: error.message });
            return json({ error: "El usuario quedó a medias (sin perfil pero con acceso). Tocá Eliminar de nuevo para terminar." }, 500);
          }
        }
        return json({ error: error.message }, 400);
      }
      await auditar(actor, "delete_user", { id: uid, email: antes?.email }, { nombre: antes?.full_name ?? null, rol: antes?.role ?? null });
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
