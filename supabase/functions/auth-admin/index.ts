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

function isDup(m: string): boolean {
  return /already|registered|exists/i.test(m);
}
function dupMsg(m: string): string {
  return isDup(m) ? "Ya existe una cuenta con ese email." : m;
}

// Sólo mails del banco pueden autorregistrarse (decisión del usuario, 2026-09-11).
// El admin sigue pudiendo crear cualquier cuenta desde el panel (create_user).
const DOMINIO_RE = /^[^@\s]+@bancogalicia\.com\.ar$/;
const ROLES = ["admin", "vip", "pro", "asesor"];
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
        .from("profiles").select("id,status,last_reset_request_at").eq("email", email).maybeSingle();
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
      return json({ ok: true });
    }

    if (action === "deny_reset") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      if (!uid) return json({ error: "Datos inválidos" }, 400);
      await admin.from("pending_password_resets").delete().eq("user_id", uid);
      await admin.from("profiles").update({ status: "active" }).eq("id", uid);
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
      return json({ ok: true, id: data.user.id });
    }

    if (action === "set_password") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
      const uid = String(body.uid || "");
      const password = String(body.password || "");
      if (!uid || password.length < 8) return json({ error: "Datos inválidos" }, 400);
      const { error } = await admin.auth.admin.updateUserById(uid, { password });
      if (error) return json({ error: error.message }, 400);
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
