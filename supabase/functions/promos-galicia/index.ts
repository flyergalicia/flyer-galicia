// Edge Function: promos-galicia
// Puente hacia el buscador de promociones de Banco Galicia (beneficios.galicia.ar).
// Necesaria porque la API de Galicia sólo acepta llamadas con
// Origin/Referer=beneficios.galicia.ar (CORS + WAF la rechazan si se la llama
// directo desde el navegador de la app). Corriendo del lado servidor no hay
// restricción de CORS y podemos imitar esos headers.
//
// Acciones:
//   status   -> devuelve metadata de la última sincronización (fecha, total)
//   sync     -> baja el catálogo completo de Galicia y refresca la tabla caché
//   detalle  -> dado un array de ids de promoción, devuelve su fechaDesde
//               (ese campo sólo viene en el detalle, no en el listado)
//
// Todas requieren un usuario logueado que sea admin O que tenga la facultad
// "promos_buscar" habilitada en _facultades.json (mismo criterio que usa el
// cliente para mostrar/ocultar la pestaña, pero validado acá del lado
// servidor: la facultad del cliente es sólo interfaz, esto es lo que de
// verdad autoriza o rechaza).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const { data: prof } = await admin
    .from("profiles").select("role,status").eq("id", data.user.id).single();
  // Sólo cuentas activas: una desactivada/pendiente conserva el JWT hasta que
  // vence, pero no tiene que poder disparar consultas hacia Galicia.
  if (!prof || prof.status !== "active") return false;
  const role = prof.role || "";
  if (role === "admin") return true;
  try {
    const r = await fetch(SUPABASE_URL + "/storage/v1/object/public/flyers/_facultades.json");
    if (!r.ok) return false;
    const fac = await r.json();
    return !!(fac?.roles?.[role]?.promos_buscar);
  } catch {
    return false;
  }
}

// ── Cliente hacia la API de Galicia (imitando el navegador real) ───────────
const GALICIA_BFF = "https://loyalty.bff.bancogalicia.com.ar/api/portal";
const GALICIA_HEADERS: Record<string, string> = {
  "Accept": "application/json",
  "Origin": "https://beneficios.galicia.ar",
  "Referer": "https://beneficios.galicia.ar/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

async function syncCatalogo(): Promise<{ total: number }> {
  const r = await fetch(`${GALICIA_BFF}/catalogo/v1/promociones?pageSize=3000`, { headers: GALICIA_HEADERS });
  if (!r.ok) throw new Error(`Galicia respondió ${r.status} al pedir el catálogo`);
  const d = await r.json();
  const list: any[] = Array.isArray(d?.data?.list) ? d.data.list : [];
  if (!list.length) throw new Error("El catálogo de Galicia vino vacío");

  // Un único timestamp para todas las filas de esta corrida: así, al final,
  // "lo que quedó con updated_at viejo" es justo lo que ya no está en el
  // catálogo (se borró/venció y se cayó del listado) y se puede limpiar sin
  // armar un IN gigante con 1700+ ids.
  const syncStartedAt = new Date().toISOString();
  const rows = list.map((p) => ({
    id: p.id,
    titulo: p.titulo || "",
    subtitulo: p.subtitulo || "",
    imagen: p.imagen || "",
    fecha_hasta: p.fechaHasta ? String(p.fechaHasta).slice(0, 10) : null,
    tipo_promocion: p.tipoPromocion || "",
    updated_at: syncStartedAt,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("promos_galicia_cache").upsert(chunk, { onConflict: "id" });
    if (error) throw new Error("Guardando el catálogo: " + error.message);
  }

  const { error: delErr } = await admin
    .from("promos_galicia_cache").delete().lt("updated_at", syncStartedAt);
  if (delErr) throw new Error("Limpiando promos vencidas del caché: " + delErr.message);

  const { error: metaErr } = await admin
    .from("promos_galicia_meta")
    .update({ last_sync_at: syncStartedAt, total: rows.length })
    .eq("id", 1);
  if (metaErr) throw new Error("Guardando metadata: " + metaErr.message);

  return { total: rows.length };
}

async function detalle(ids: number[]): Promise<Record<string, string | null>> {
  const capped = ids.filter((n) => Number.isFinite(n)).slice(0, 80);
  const results: Record<string, string | null> = {};
  let idx = 0;
  async function worker() {
    while (idx < capped.length) {
      const id = capped[idx++];
      try {
        const r = await fetch(`${GALICIA_BFF}/catalogo/v1/promociones/idPromocion/${id}`, { headers: GALICIA_HEADERS });
        if (r.ok) {
          const d = await r.json();
          results[String(id)] = d?.data?.fechaDesde ? String(d.data.fechaDesde).slice(0, 10) : null;
        } else {
          results[String(id)] = null;
        }
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

  const can = await requireCan(req);
  if (!can) return json({ error: "No autorizado" }, 403);

  try {
    if (action === "status") {
      const { data, error } = await admin
        .from("promos_galicia_meta").select("last_sync_at,total").eq("id", 1).single();
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
    return json({ error: "Acción inválida" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message || "Error" }, 500);
  }
});
