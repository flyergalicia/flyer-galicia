// Edge Function: auth-admin
// Centraliza las operaciones privilegiadas que antes usaban la service_role
// desde el cliente. La service_role NUNCA sale del servidor.
//
// Acciones:
//   register       (público)  -> crea cuenta confirmada en estado pending
//   request_reset  (público)  -> setea nueva clave y deja la cuenta en reset_pending
//   create_user    (admin)    -> crea usuario con rol/estado elegido por el admin
//   set_password   (admin)    -> cambia la clave de un usuario
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

async function requireAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: prof } = await admin
    .from("profiles").select("role").eq("id", data.user.id).single();
  return !!prof && prof.role === "admin";
}

function dupMsg(m: string): string {
  return /already|registered|exists/i.test(m) ? "Ya existe una cuenta con ese email." : m;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const action = String(body.action || "");

  try {
    if (action === "register") {
      const email = String(body.email || "").trim();
      const password = String(body.password || "");
      const full_name = String(body.full_name || "").trim();
      if (!email || !full_name || password.length < 6) return json({ error: "Datos inválidos" }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      });
      if (error) return json({ error: dupMsg(error.message) }, 400);
      await admin.from("profiles").upsert(
        { id: data.user.id, full_name, email_asesor: email, status: "pending", role: "asesor" },
        { onConflict: "id" },
      );
      return json({ ok: true });
    }

    if (action === "request_reset") {
      const email = String(body.email || "").trim();
      const password = String(body.password || "");
      if (!email || password.length < 8) return json({ error: "Datos inválidos" }, 400);
      const { data: prof } = await admin
        .from("profiles").select("id").eq("email", email).maybeSingle();
      if (!prof) return json({ error: "No existe una cuenta con ese email." }, 404);
      const { error: pErr } = await admin.auth.admin.updateUserById(prof.id, { password });
      if (pErr) return json({ error: pErr.message }, 400);
      await admin.from("profiles").update({ status: "reset_pending" }).eq("id", prof.id);
      return json({ ok: true });
    }

    if (action === "create_user") {
      if (!(await requireAdmin(req))) return json({ error: "No autorizado" }, 403);
      const email = String(body.email || "").trim();
      const password = String(body.password || "");
      const full_name = String(body.full_name || "").trim();
      const role = String(body.role || "asesor");
      const status = String(body.status || "active");
      if (!email || password.length < 8) return json({ error: "Datos inválidos" }, 400);
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
