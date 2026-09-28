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

// El listado de promociones acepta filtros Provincia y Localidad. Ojo: los
// nombres de parámetro van capitalizados tal cual; en minúscula el WAF de
// Galicia contesta 403 (no 400), así que un typo parece "caída del servicio".
function promosUrl(params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ pageSize: "3000", ...params });
  return `${GALICIA_BFF}/catalogo/v1/promociones?${qs}`;
}

async function galiciaJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: GALICIA_HEADERS });
  if (!r.ok) throw new Error(`Galicia respondió ${r.status}`);
  return await r.json();
}

// ── Geografía: qué promos se pueden usar en cada provincia ─────────────────
// Galicia no expone la provincia dentro del catálogo; la única forma de saberlo
// es pedir el listado filtrado provincia por provincia. Son 24 llamadas: ~8,7s
// en serie, ~2s con 6 en paralelo (mismo patrón que detalle()). Las promos que
// no aparecen en ninguna (~307 de 1922) son de compra online, sin local físico.
async function geoPorProvincia(): Promise<{
  ubicaciones: any[];
  porPromo: Map<number, string[]>;
}> {
  const u = await galiciaJson(`${GALICIA_BFF}/catalogo/v1/locales/ubicacion/filtro`);
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
      const d = await galiciaJson(promosUrl({ Provincia: prov }));
      const list: any[] = Array.isArray(d?.data?.list) ? d.data.list : [];
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

async function syncCatalogo(): Promise<{ total: number; conProvincia: number; geoError: string | null }> {
  const d = await galiciaJson(promosUrl()).catch((e) => {
    throw new Error(`${(e as Error).message} al pedir el catálogo`);
  });
  const list: any[] = Array.isArray(d?.data?.list) ? d.data.list : [];
  if (!list.length) throw new Error("El catálogo de Galicia vino vacío");

  // La geografía se trae ANTES del upsert para que cada fila se guarde completa
  // de una y no queden estados intermedios. Si falla, el catálogo se guarda
  // igual SIN tocar la columna provincias: quedarse sin catálogo por no poder
  // calcular la provincia sería mucho peor, y la geografía anterior sigue
  // sirviendo (el catálogo cambia poco de un día para el otro).
  let geo: { ubicaciones: any[]; porPromo: Map<number, string[]> } | null = null;
  let geoError: string | null = null;
  try {
    geo = await geoPorProvincia();
  } catch (e) {
    geoError = (e as Error)?.message || "error desconocido";
    console.error("promos sync: no se pudo traer la geografía:", geoError);
  }

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
      fecha_hasta: p.fechaHasta ? String(p.fechaHasta).slice(0, 10) : null,
      tipo_promocion: p.tipoPromocion || "",
      updated_at: syncStartedAt,
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
    conProvincia: geo ? geo.porPromo.size : 0,
    geoError,
  };
}

// Promos de una provincia/localidad puntual, en vivo contra Galicia. Devuelve
// sólo los ids: el cliente ya tiene el catálogo entero en memoria y lo hidrata
// desde ahí. Existe por la localidad, que no se puede precalcular como la
// provincia (son ~4200 y cada una necesitaría su propia llamada).
async function porUbicacion(provincia: string, localidad: string): Promise<{ ids: number[] }> {
  const prov = String(provincia || "").trim();
  if (!prov) throw new Error("Falta la provincia");
  const params: Record<string, string> = { Provincia: prov };
  const loc = String(localidad || "").trim();
  if (loc) params.Localidad = loc;
  const d = await galiciaJson(promosUrl(params));
  const list: any[] = Array.isArray(d?.data?.list) ? d.data.list : [];
  return { ids: list.map((p) => p.id).filter((n) => Number.isFinite(n)) };
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
