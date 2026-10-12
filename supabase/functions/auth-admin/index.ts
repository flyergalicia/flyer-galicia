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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Preferimos la nueva secret key (ADMIN_SECRET); fallback a la legacy mientras
// dure la transición. Cuando se deshabiliten las legacy, ADMIN_SECRET es la que rige.
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

// Admin Y activo: un admin desactivado (o con un reset pendiente) no opera
// hasta que otro admin lo reactive. Antes alcanzaba con el rol.
async function requireAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: prof } = await admin
    .from("profiles").select("role,status").eq("id", data.user.id).single();
  return !!prof && prof.role === "admin" && prof.status === "active";
}

// ── Mails de aviso ───────────────────────────────────────────────────────────
// Los manda una cuenta de Gmail propia de la app a través de un Google Apps
// Script publicado como aplicación web (supabase/mail/apps-script.gs): gratis y
// sin claves de mail guardadas acá. Si los secretos no están cargados, no se
// manda nada y todo sigue funcionando igual.
// Reglas fijas: sólo texto, NUNCA la clave y NUNCA links (ya saben dónde está
// la app; así no se parece a un phishing y no hay nada que robar). Un mail que
// falla jamás hace fallar la operación.
const MAIL_URL = Deno.env.get("MAIL_HOOK_URL") || "";
const MAIL_SECRET = Deno.env.get("MAIL_HOOK_SECRET") || "";
const MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PIE = "\n\n—\nArmador de flyers\nAviso automático. Nunca te vamos a pedir tu clave por mail.";

async function enviar(to: string[], subject: string, body: string): Promise<void> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(MAIL_URL, {
      method: "POST",
      // text/plain: el Apps Script lee el cuerpo crudo (evita el preflight).
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: MAIL_SECRET, to: to.join(","), subject, body: body + PIE }),
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
function avisar(to: string | string[] | null | undefined, subject: string, body: string): void {
  if (!MAIL_URL || !MAIL_SECRET) return;
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || "").trim().toLowerCase()).filter((x) => MAIL_RE.test(x));
  if (!list.length) return;
  const p = enviar([...new Set(list)], subject, body);
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p);
}
async function mailsAdmins(): Promise<string[]> {
  const { data } = await admin.from("profiles").select("email").eq("role", "admin").eq("status", "active");
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
      await admin.from("profiles").upsert(
        { id: data.user.id, full_name, email, email_asesor: email, status: "pending", role: "asesor" },
        { onConflict: "id" },
      );
      avisar(await mailsAdmins(), "Nuevo pedido de acceso: " + full_name,
        `${full_name} (${email}) se registró en el Armador de flyers y está esperando tu aprobación.\n\n` +
        `Entrá al panel de Admin → Usuarios para aprobarlo o rechazarlo.`);
      avisar(email, "Recibimos tu pedido de acceso",
        `${hola(full_name)}\n\nRecibimos tu pedido para usar el Armador de flyers. Te vamos a avisar por este ` +
        `medio cuando el administrador lo apruebe.\n\nSi no fuiste vos, ignorá este mensaje.`);
      return json({ ok: true });
    }

    if (action === "request_reset") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || password.length < 8) return json({ error: "Datos inválidos" }, 400);
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
      // Guarda el pedido; NO toca la clave real todavía (ver approve_reset).
      await admin.from("pending_password_resets").upsert(
        { user_id: prof.id, new_password: password, requested_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      await admin.from("profiles")
        .update({ status: "reset_pending", last_reset_request_at: new Date().toISOString() })
        .eq("id", prof.id);
      const quien = prof.full_name || email;
      avisar(await mailsAdmins(), "Pedido de cambio de clave: " + quien,
        `${quien} (${email}) pidió cambiar su clave.\n\n` +
        `Entrá al panel de Admin → Usuarios para aprobar o rechazar el cambio.`);
      avisar(email, "Recibimos un pedido para cambiar tu clave",
        `${hola(prof.full_name)}\n\nRecibimos un pedido para cambiar la clave de tu cuenta del Armador de flyers. ` +
        `El administrador lo va a revisar y te avisamos cuando esté listo.\n\n` +
        `Si NO fuiste vos, avisale al administrador cuanto antes: mientras no lo apruebe, tu clave actual sigue siendo la misma.`);
      return json(generic);
    }

    if (action === "approve_reset") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      const { data: pending } = await admin
        .from("pending_password_resets").select("new_password").eq("user_id", uid).maybeSingle();
      if (!pending) return json({ error: "No hay un cambio de clave pendiente para este usuario." }, 404);
      const { error } = await admin.auth.admin.updateUserById(uid, { password: pending.new_password });
      if (error) return json({ error: error.message }, 400);
      await admin.from("pending_password_resets").delete().eq("user_id", uid);
      await admin.from("profiles").update({ status: "active" }).eq("id", uid);
      const pa = await perfil(uid);
      if (pa) avisar(pa.email, "Tu clave nueva ya funciona",
        `${hola(pa.nombre)}\n\nEl administrador aprobó tu cambio de clave. Ya podés entrar al Armador de flyers ` +
        `con tu mail y la clave nueva que elegiste.`);
      return json({ ok: true });
    }

    if (action === "deny_reset") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      await admin.from("pending_password_resets").delete().eq("user_id", uid);
      await admin.from("profiles").update({ status: "active" }).eq("id", uid);
      const pd = await perfil(uid);
      if (pd) avisar(pd.email, "Tu pedido de cambio de clave fue rechazado",
        `${hola(pd.nombre)}\n\nEl administrador rechazó el pedido para cambiar tu clave. ` +
        `Seguí entrando con la clave que ya tenías.\n\nSi necesitás cambiarla, hablá con el administrador.`);
      return json({ ok: true });
    }

    // Aprueba una cuenta (pending/inactive → active) y le avisa por mail.
    // Idempotente: el panel también la llama después de pasar a alguien a
    // "activo" desde Editar usuario, sólo para que salga el aviso.
    if (action === "approve_user") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
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
      avisar(pu.email, "Tu cuenta ya está activa",
        `${hola(pu.nombre)}\n\nEl administrador aprobó tu cuenta del Armador de flyers. Ya podés entrar con tu mail y tu clave.`);
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
      avisar(u.user.email || ps?.email, "Se cambió la clave de tu cuenta",
        `${hola(ps?.nombre || "")}\n\nSe cambió la clave de tu cuenta del Armador de flyers.\n\n` +
        `Si NO fuiste vos, avisale al administrador cuanto antes.`);
      return json({ ok: true });
    }

    if (action === "create_user") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
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
      await admin.from("profiles").upsert(
        { id: data.user.id, email, email_asesor: email, full_name, role, status },
        { onConflict: "id" },
      );
      // Sólo si quedó activa: una cuenta creada inactiva recibe el aviso
      // cuando se la active (approve_user).
      if (status === "active") avisar(email, "Te crearon una cuenta en el Armador de flyers",
        `${hola(full_name)}\n\nEl administrador te creó una cuenta en el Armador de flyers. ` +
        `Tu usuario es este mail. La clave te la pasa el administrador.`);
      return json({ ok: true, id: data.user.id });
    }

    if (action === "set_password") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      const password = String(body.password || "");
      if (!uid || password.length < 8) return json({ error: "Datos inválidos" }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid, { password });
      if (error) return json({ error: error.message }, 400);
      const pp = await perfil(uid);
      if (pp) avisar(pp.email, "El administrador cambió tu clave",
        `${hola(pp.nombre)}\n\nEl administrador cambió la clave de tu cuenta del Armador de flyers. La nueva te la pasa él.\n\n` +
        `Si no esperabas este cambio, hablá con el administrador.`);
      return json({ ok: true });
    }

    if (action === "delete_user") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      // No permitir que un admin se elimine a sí mismo.
      const reqToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: me } = await admin.auth.getUser(reqToken);
      if (me?.user?.id === uid) return json({ error: "No podés eliminar tu propia cuenta." }, 400);
      // Borrar el perfil primero; los flyer_logs quedan con user_id NULL (FK SET NULL).
      await admin.from("profiles").delete().eq("id", uid);
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
