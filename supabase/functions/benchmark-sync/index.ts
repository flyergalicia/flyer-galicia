// Edge Function: benchmark-sync
// Baja de MODO las promos de Galicia, BBVA, Macro, Supervielle y Santander (la
// API pública de MODO acepta el filtro por banco) y las guarda ya normalizadas
// en promos_bench_cache (migración 039) para la solapa Benchmark.
//
// Va APARTE de promos-galicia a propósito (pedido del dueño: nada de esto puede
// afectar al armador): si esta función falla o tarda, la actualización de las 9
// de Promociones sigue igual. Corre una vez por semana (migración 040) o a mano
// desde la solapa Benchmark.
//
// Acciones:
//   status  -> una fila por banco: última actualización, total y error
//   sync    -> {banco?}: baja y guarda las promos (todos los bancos si no se indica)
//   marcas  -> completa provincias/localidades y logos de las marcas nuevas (con
//              tope de tiempo; si quedan pendientes, se vuelve a llamar)
//
// Autoriza: admin, o un rol con la facultad "benchmark" en _facultades.json
// (validado acá: la facultad del cliente es sólo interfaz). El cron entra con
// x-cron-secret (BENCH_CRON_SECRET), sólo para sync/marcas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("ADMIN_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ── Autorización ───────────────────────────────────────────────────────────
async function requireCan(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  const [{ data: prof }, fac] = await Promise.all([
    admin.from("profiles").select("role,status").eq("id", data.user.id).single(),
    fetch(SUPABASE_URL + "/storage/v1/object/public/flyers/_facultades.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (!prof || (prof.status !== "active" && prof.status !== "reset_pending")) return false;
  if (prof.role === "admin") return true;
  return !!(fac?.roles?.[prof.role || ""]?.benchmark);
}
function esCron(req: Request): boolean {
  const esperado = Deno.env.get("BENCH_CRON_SECRET") || "";
  const recibido = req.headers.get("x-cron-secret") || "";
  if (esperado.length < 32 || recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return dif === 0;
}

// ── Mail al admin si falla la actualización semanal ────────────────────────
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
  const parrafos = m.parrafos.map((p) => `<p style="${F}margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b2f36">${esc(p)}</p>`).join("");
  const datos = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:#f6f7f9;border-radius:8px"><tr><td style="padding:12px 16px">` +
    m.datos.map(([k, v]) => `<div style="${F}font-size:14px;line-height:1.7;color:#2b2f36"><span style="color:#6b7280">${esc(k)}:</span> <strong>${esc(v)}</strong></div>`).join("") +
    `</td></tr></table>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.asunto)}</title></head>` +
    `<body style="margin:0;padding:0;background:#eceef2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2"><tr><td align="center" style="padding:28px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">` +
    `<tr><td style="background:#14213D;padding:20px 28px;border-bottom:4px solid #F26122"><div style="${F}font-size:18px;font-weight:700;color:#ffffff">Armador de flyers</div></td></tr>` +
    `<tr><td style="padding:28px 28px 10px"><h1 style="${F}margin:0 0 18px;font-size:21px;line-height:1.3;color:#14213D">${esc(m.titulo)}</h1>${parrafos}${datos}</td></tr>` +
    `<tr><td style="padding:14px 28px 24px;border-top:1px solid #e5e7eb"><div style="${F}font-size:12px;line-height:1.6;color:#6b7280">Mensaje automático del Armador de flyers.</div></td></tr>` +
    `</table></td></tr></table></body></html>`;
}
async function avisarAdmin(m: Mail): Promise<void> {
  if (!MAIL_URL || !MAIL_SECRET) return;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    let to = MAIL_ADMIN;
    if (!to.length) {
      const { data } = await admin.from("profiles").select("email").eq("role", "admin").in("status", ["active", "reset_pending"]);
      to = (data || []).map((r: { email: string | null }) => r.email || "").filter((x: string) => MAIL_RE.test(x));
    }
    if (!to.length) return;
    await fetch(MAIL_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: MAIL_SECRET, to: to.join(","), subject: m.asunto, body: mailTexto(m), html: mailHtml(m) }),
      signal: ctl.signal,
    });
  } catch (e) {
    console.error("mail:", String((e as Error)?.message || e));
  } finally {
    clearTimeout(t);
  }
}
const MAIL_FALLO = (lineas: [string, string][]): Mail => ({
  asunto: "Armador de flyers · Benchmark: no se pudo actualizar la competencia",
  titulo: "Benchmark: no se pudo actualizar la competencia",
  parrafos: [
    "La actualización semanal del Benchmark falló en algún banco. La solapa sigue mostrando la última copia buena de cada uno (no se pisó nada).",
    "Podés reintentar con el botón «Actualizar ahora» de la solapa Benchmark. Si vuelve a fallar, es probable que MODO haya cambiado algo en su sitio.",
  ],
  datos: lineas,
});

// ── MODO ───────────────────────────────────────────────────────────────────
const MODO_API = "https://www.modo.com.ar/promos/api/rewards";
const MODO_LOCALES = "https://promoshub.modo.com.ar/promos/api/map/stores/applications/onsite";
const MODO_SLOTS = [
  "web-modo-hub-carrousel_principal", "web-modo-hub-destacadas", "web-modo-hub-supermercados",
  "web-modo-hub-exclusivas-online", "web-modo-hub-promos-financiacion", "web-modo-hub-mas-promos",
].join(",");
const MODO_HEADERS: Record<string, string> = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
};
// uuid de cada banco en MODO (rewards/banks)
export const BANCOS: Record<string, { id: string; nombre: string }> = {
  galicia: { id: "88d8705e-2dda-46f9-8411-bb4916af858e", nombre: "Galicia" },
  bbva: { id: "049ad22b-c0f0-4733-be35-e31256801ce8", nombre: "BBVA" },
  macro: { id: "6a089c91-a7d3-4199-a578-2132a3733f69", nombre: "Macro" },
  supervielle: { id: "54fdfe50-7b7e-4316-bf88-97923d5a8a8d", nombre: "Supervielle" },
  santander: { id: "167504f6-caaf-4ead-b65b-6e6695ae6209", nombre: "Santander" },
};
const MAX_PAGINAS = 40; // Macro tiene ~21 de a 100
const MINIMO_RELATIVO = 0.5;
// Rubros de MODO (rewards/categories) con los nombres que usa Galicia.
const MODO_RUBROS: Record<string, string> = {
  "1": "Supermercados", "2": "Gastronomía", "3": "Indumentaria", "4": "Salud y Bienestar",
  "5": "Combustible", "6": "Salud y Bienestar", "7": "Hogar", "8": "Vehículos", "10": "Electrónica",
  "11": "Hogar", "12": "Mascotas", "13": "Juguetes", "14": "Entretenimiento",
};
const MODO_DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MODO_DIAS_TXT = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

async function modoJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: MODO_HEADERS });
  if (!r.ok) throw new Error(`MODO respondió ${r.status}`);
  return await r.json();
}
export function sinAcentos(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
export function isoFecha(f: unknown): string | null {
  const s = String(f ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
export function modoClave(s: unknown): string {
  return sinAcentos(s).toLowerCase()
    .replace(/\b(supermercados?|super|hiper(mercados?)?|mayorista|farmacias?|perfumerias?|y|de|del|la|el|los|las|grupo|s ?a)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}
// Días como números 0 = lunes … 6 = domingo; vacío = todos los días.
export function diasIdx(dias: unknown): number[] {
  const set = new Set((Array.isArray(dias) ? dias : []).map((d) => MODO_DIAS.indexOf(String(d).toLowerCase())).filter((i) => i >= 0));
  if (set.size === 7) return [];
  return [...set].sort((a, b) => a - b);
}
export function diasTexto(idx: number[]): string {
  if (!idx.length) return "Todos los días";
  const t = idx.map((i) => MODO_DIAS_TXT[i]);
  const s = t.length === 1 ? t[0] : t.slice(0, -1).join(", ") + " y " + t[t.length - 1];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// El segmento sale de los textos que MODO publica con la promo: el banco que
// participa ("Macro Selecta"), el nombre del beneficio y su descripción. No hay
// un campo propio, así que lo que no se reconoce queda en null (= sin dato).
const SEG_PREMIUM = /(black|signature|platinum|platino|selecta|identit[eé]|infinite|eminent|premium|world elite)/i;
const SEG_CLASICO = /(gold|cl[aá]sic|internacional|nacional)/i;
export function segmentoDe(c: any): { segmento: string | null; txt: string } {
  const txt = [c?.card?.participating_bank, c?.benefit?.name, c?.benefit?.publication?.description]
    .map((x) => String(x || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ");
  if (SEG_PREMIUM.test(txt)) return { segmento: "premium", txt };
  if (SEG_CLASICO.test(txt)) return { segmento: "clasico", txt };
  return { segmento: null, txt };
}
// Tope en pesos y cada cuánto se renueva. cashback_cap es el que muestra la
// tarjeta; el de período trae además el "por mes / por semana".
export function topeDe(c: any): { tope: number | null; por: string | null } {
  const per = c?.offer?.limits?.period_cap || {};
  const tx = c?.offer?.limits?.transaction_cap || {};
  const cap = Number(c?.card?.cashback_cap || 0);
  const porPer = Number(per.amount_by_period || 0);
  const porTx = Number(tx.amount_by_transaction || 0);
  const reset = ["month", "week", "day"].includes(String(per.reset_by)) ? String(per.reset_by) : null;
  if (cap > 0) return { tope: cap, por: porPer > 0 ? reset : porTx > 0 ? "transaction" : null };
  if (porPer > 0) return { tope: porPer, por: reset };
  if (porTx > 0) return { tope: porTx, por: "transaction" };
  return { tope: null, por: null };
}
export function cuotasDe(c: any, texto: string): number {
  const ins = (c?.offer?.outcomes?.financing?.installments || []) as any[];
  let max = 0;
  for (const i of ins) if (String(i?.type) === "sin_interes") max = Math.max(max, Number(i?.number || 0));
  const m = String(texto || "").match(/(\d{1,2})\s*(cuotas|csi|c\.s\.i)/i);
  if (m) max = Math.max(max, Number(m[1]));
  return max;
}
export function pctDe(c: any, texto: string): number | null {
  const cb = c?.offer?.outcomes?.cashback;
  if (cb && String(cb.amount_type) === "percent" && Number(cb.amount) > 0) return Number(cb.amount);
  const m = String(texto || "").match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(",", ".")) : null;
}
// Una fila lista para guardar, o null si no se puede identificar la promo.
export function normalizar(c: any, banco: string, hoy: string, ahora: string): Record<string, unknown> | null {
  const b = c?.benefit, s = b?.conditions?.schedule || {};
  const id = String(b?.id || "");
  const titulo = String(c?.card?.validity_place || "").replace(/\s+/g, " ").trim();
  if (!id || !titulo) return null;
  const texto = String(c?.card?.benefit || "").replace(/\s+/g, " ").trim();
  const metodos = (b?.conditions?.payment_methods?.methods || []) as any[];
  const credito = !metodos.length || metodos.some((m) => m?.type === "credit_card");
  const debito = !metodos.length || metodos.some((m) => m?.type === "debit_card");
  const emisores = [...new Set(metodos.map((m) => String(m?.issuer || "").toLowerCase()).filter(Boolean))];
  const flujos: string[] = b?.conditions?.payment_flow?.flows || [];
  const enLocal = flujos.some((f) => /instore|all|trip/.test(f));
  const dn = diasIdx(s.days_of_week);
  const seg = segmentoDe(c), tp = topeDe(c);
  return {
    id: banco + ":" + id,
    banco,
    titulo,
    marca_clave: modoClave(titulo),
    rubro: MODO_RUBROS[String((c?.offer?.categories || [])[0] ?? "")] || "Otros",
    slug: String(b?.publication?.slug || ""),
    beneficio: texto || null,
    pct: pctDe(c, texto),
    tope: tp.tope,
    tope_por: tp.por,
    cuotas: cuotasDe(c, texto),
    dias: diasTexto(dn),
    dias_n: dn,
    credito, debito, emisores,
    canales: flujos,
    segmento: seg.segmento,
    segmento_txt: seg.txt || null,
    // sólo compra online: vale en todo el país; el resto lo completa promos_bench_marcas
    provincias: enLocal ? null : [],
    fecha_desde: isoFecha(s.start_date),
    fecha_hasta: isoFecha(s.stop_date),
    proximamente: c?.calculated_status === "NEXT_FOR_PRODUCT" || (isoFecha(s.start_date) || "") > hoy,
    updated_at: ahora,
    // 1 = exclusiva del banco; más = la comparten varios bancos en MODO ("bancos adheridos")
    bancos_n: (c?.offer?.requirements?.banks?.list || []).length || null,
  };
}

// Baja y guarda un banco. Cualquier cosa rara corta ANTES de tocar la tabla.
async function syncBanco(banco: string): Promise<{ total: number }> {
  const def = BANCOS[banco];
  if (!def) throw new Error("Banco desconocido: " + banco);
  const crudo: any[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const qs = new URLSearchParams({ slot_ids: MODO_SLOTS, banks: def.id, source: "web_modo", origin: "WEB_MODO", limit: "100", page: String(page) });
    const d = await modoJson(`${MODO_API}/v2/filter?${qs}`);
    if (!Array.isArray(d?.cards)) throw new Error("MODO cambió el formato del listado");
    crudo.push(...d.cards);
    const total = Number(d?.pagination?.total_pages || 1);
    if (page === MAX_PAGINAS && total > MAX_PAGINAS) throw new Error(`MODO informa ${total} páginas y se leen hasta ${MAX_PAGINAS}: no se reemplaza`);
    if (page >= total) break;
  }
  if (!crudo.length) throw new Error("MODO devolvió el listado vacío");
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // hoy en la Argentina
  const ahora = new Date().toISOString();
  const vistos = new Set<string>();
  const vigentes = crudo.filter((c) => {
    const id = String(c?.benefit?.id || "");
    if (!id || vistos.has(id)) return false;
    vistos.add(id);
    if (c?.calculated_status === "FINISHED_FOR_PRODUCT") return false;
    const hasta = isoFecha(c?.benefit?.conditions?.schedule?.stop_date);
    return !hasta || hasta >= hoy;
  });
  const rotas = vigentes.filter((c) => !String(c?.card?.validity_place || "").trim() || !isoFecha(c?.benefit?.conditions?.schedule?.stop_date)).length;
  if (vigentes.length && rotas > vigentes.length * 0.2) {
    throw new Error(`${rotas} de ${vigentes.length} promos vinieron sin nombre o sin fecha: MODO cambió el formato, no se reemplaza`);
  }
  const { count: guardadas, error: eCount } = await admin.from("promos_bench_cache").select("id", { count: "exact", head: true })
    .eq("banco", banco).eq("fuente", "modo").or(`fecha_hasta.is.null,fecha_hasta.gte.${hoy}`);
  if (eCount) throw new Error("No se pudo contar la copia guardada: " + eCount.message);
  if (guardadas && vigentes.length < guardadas * MINIMO_RELATIVO) {
    throw new Error(`MODO devolvió sólo ${vigentes.length} promos vigentes y la copia guardada tiene ${guardadas}: no se reemplaza por las dudas`);
  }
  const filas = vigentes.map((c) => normalizar(c, banco, hoy, ahora)).filter(Boolean) as Record<string, unknown>[];
  if (!filas.length) throw new Error("Ninguna promo se pudo leer");
  // Promociones lee la aclaración de cada promo de MODO y pasa a Vehículos las de "combustible" que en
  // realidad son de lubricentro (YPF Boxes): se usa esa misma corrección (mismo id de MODO).
  const corregidas = new Map<string, string>();
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_modo_cache").select("id,subtitulo").eq("subtitulo", "Vehículos").order("id").range(d, d + 999);
    if (error) break;
    for (const r of data || []) corregidas.set(String(r.id), r.subtitulo);
    if (!data || data.length < 1000) break;
  }
  for (const f of filas) { const sub = corregidas.get(String(f.id).split(":").slice(1).join(":")); if (sub) f.rubro = sub; }
  // primera_vez no se manda: la pone la base al insertar y las que ya estaban la conservan
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin.from("promos_bench_cache").upsert(filas.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error("Guardando: " + error.message);
  }
  const { error: del } = await admin.from("promos_bench_cache").delete().eq("banco", banco).eq("fuente", "modo").lt("updated_at", ahora);
  if (del) throw new Error("Limpiando: " + del.message);
  return { total: filas.length };
}

async function syncBancoSeguro(banco: string): Promise<{ banco: string; total?: number; error?: string }> {
  try {
    const r = await syncBanco(banco);
    await admin.from("promos_bench_meta").upsert({ banco, last_sync_at: new Date().toISOString(), total: r.total, error: null }, { onConflict: "banco" });
    return { banco, total: r.total };
  } catch (e) {
    const msg = (e as Error)?.message || "error desconocido";
    console.error("benchmark", banco, msg);
    // no se pisa last_sync_at ni total: siguen siendo los de la última copia buena
    await admin.from("promos_bench_meta").upsert({ banco, error: msg }, { onConflict: "banco" });
    return { banco, error: msg };
  }
}

// ── Lugares y logos por marca (una vez por marca, no por promo) ────────────
export function modoProvincia(p: unknown, nombres: string[]): string | null {
  const s = sinAcentos(p);
  if (!s) return null;
  if (/^(CABA|C\.?A\.?B\.?A\.?|CIUDAD (AUTONOMA )?DE BUENOS AIRES|CAPITAL( FEDERAL)?|CIUDAD AUTONOMA)$/.test(s)) return "CAPITAL FEDERAL";
  if (/^TIERRA DEL FUEGO/.test(s)) return nombres.includes("TIERRA DEL FUEGO") ? "TIERRA DEL FUEGO" : null;
  if (nombres.includes(s)) return s;
  if (s === "PROVINCIA DE BUENOS AIRES" || s === "GBA") return "BUENOS AIRES";
  return nombres.find((n) => s.startsWith(n + " ")) || null;
}
async function modoLocales(id: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const qs = new URLSearchParams({
      application_id: id, source: "web_modo", limit: "500", slots: "false", text_search: "",
      page: String(page), applications: "promotions", type: "onsite", hasGeolocation: "false",
    });
    const d = await modoJson(`${MODO_LOCALES}?${qs}`);
    if (!Array.isArray(d?.results)) throw new Error("MODO cambió el formato de los locales");
    out.push(...d.results);
    const total = Number(d?.pagination?.total_pages || 1);
    if (page === 10 && total > 10) throw new Error("demasiados locales (" + total + " páginas)");
    if (page >= total) break;
  }
  return out;
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
// Mismo lugar que usa Promociones para los logos de MODO (flyers/modo/<id>.png)
async function modoCopiarLogo(m: { id: string; url: string }, yaEstan: Set<string>): Promise<string | null> {
  const nombre = "modo/" + m.id.replace(/[^0-9a-zA-Z_-]/g, "") + ".png";
  if (yaEstan.has(nombre)) return nombre;
  try {
    const r = await fetch(m.url);
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") || "image/png";
    if (!/^image\//.test(tipo)) return null;
    const { error } = await admin.storage.from("flyers").upload(nombre, await r.blob(), { upsert: true, contentType: tipo });
    if (error) return null;
    yaEstan.add(nombre);
    return nombre;
  } catch {
    return null;
  }
}
const MARCA_VIGENCIA_DIAS = 30;
const MARCA_REINTENTO_DIAS = 6; // una marca sin lugares se vuelve a intentar cada semana
const PROMOS_POR_MARCA = 4; // MODO a veces no tiene locales en una promo pero sí en otra de la misma marca
// Completa las marcas que todavía no tienen lugares o cuya copia es vieja, con
// un tope de tiempo (la función corta a los ~150 s). Devuelve cuántas quedan.
// Lugares: primero los locales de MODO (hasta PROMOS_POR_MARCA promos de la marca);
// si MODO no tiene ninguno, las provincias que ya conocen Promociones de Galicia y
// de MODO para esa marca (mismo nombre normalizado). Logo: el de los locales de
// MODO o, si no, el de la marca en Galicia.
async function syncMarcas(presupuestoMs: number): Promise<{ hechas: number; pendientes: number }> {
  const t0 = Date.now();
  const filas: any[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_bench_cache").select("id,titulo,marca_clave,canales,provincias").order("id").range(d, d + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { data: marcasDb } = await admin.from("promos_bench_marcas").select("marca_clave,provincias,imagen,updated_at");
  const ahora = Date.now();
  const hechas = new Set<string>();
  for (const m of marcasDb || []) {
    const edad = (ahora - new Date(m.updated_at).getTime()) / 86400000;
    // con lugares: vale MARCA_VIGENCIA_DIAS; sin lugares: se reintenta antes
    if (edad < (Array.isArray(m.provincias) ? MARCA_VIGENCIA_DIAS : MARCA_REINTENTO_DIAS)) hechas.add(m.marca_clave);
  }
  // hasta PROMOS_POR_MARCA promos "de local" por marca (las online no tienen locales que pedir)
  const reps = new Map<string, { titulo: string; ids: string[] }>();
  for (const f of filas) {
    if (!f.marca_clave || hechas.has(f.marca_clave) || Array.isArray(f.provincias)) continue;
    const r = reps.get(f.marca_clave) || { titulo: f.titulo, ids: [] };
    const id = String(f.id).split(":").slice(1).join(":");
    if (r.ids.length < PROMOS_POR_MARCA && !r.ids.includes(id) && id.includes("-")) r.ids.push(id);
    reps.set(f.marca_clave, r);
  }
  const cola = [...reps.entries()];
  const { data: meta } = await admin.from("promos_galicia_meta").select("ubicaciones").eq("id", 1).maybeSingle();
  const nombres: string[] = (Array.isArray(meta?.ubicaciones) ? meta.ubicaciones : []).map((u: any) => sinAcentos(u?.nombre)).filter(Boolean);
  const { data: logos } = await admin.storage.from("flyers").list("modo", { limit: 1000 });
  const yaEstan = new Set<string>((logos || []).map((f: any) => "modo/" + f.name));

  // Lo que ya saben las promos de Galicia y de MODO de la misma marca (provincias y logo).
  const conocido = new Map<string, { p: Set<string>; l: Set<string>; img: string }>();
  const sumar = (titulo: string, ps: unknown, ls: unknown, img: unknown) => {
    const k = modoClave(titulo);
    if (!k) return;
    const x = conocido.get(k) || { p: new Set<string>(), l: new Set<string>(), img: "" };
    if (Array.isArray(ps)) (ps as string[]).forEach((v) => x.p.add(v));
    if (Array.isArray(ls)) (ls as string[]).forEach((v) => x.l.add(v));
    if (!x.img && typeof img === "string" && img) x.img = img;
    conocido.set(k, x);
  };
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_galicia_cache").select("titulo,provincias,imagen").order("id").range(d, d + 999);
    if (error) break; // sin esto igual se sigue con los locales de MODO
    (data || []).forEach((g: any) => sumar(g.titulo, g.provincias, null, g.imagen));
    if (!data || data.length < 1000) break;
  }
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_modo_cache").select("titulo,provincias,localidades,imagen").order("id").range(d, d + 999);
    if (error) break;
    (data || []).forEach((g: any) => sumar(g.titulo, g.provincias, g.localidades, g.imagen));
    if (!data || data.length < 1000) break;
  }

  let idx = 0, ok = 0;
  async function worker() {
    while (idx < cola.length && Date.now() - t0 < presupuestoMs) {
      const [clave, r] = cola[idx++];
      try {
        const ps = new Set<string>(), ls = new Set<string>();
        let logo: { id: string; url: string } | null = null;
        for (const id of r.ids) {
          let locales: any[] = [];
          try { locales = await modoLocales(id); } catch (e) { console.error("benchmark locales", id, String((e as Error)?.message || e)); continue; }
          for (const l of locales) {
            const ciudad = sinAcentos(l?.city);
            let p = modoProvincia(l?.province, nombres);
            if (p === "BUENOS AIRES" && /^(CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA DE BUENOS AIRES)$/.test(ciudad)) p = "CAPITAL FEDERAL";
            if (!p) continue;
            ps.add(p);
            if (ciudad) ls.add(p + "|" + ciudad);
          }
          logo = logo || modoMarcaLogo(locales, r.titulo);
          if (ps.size && logo) break;
        }
        const k = conocido.get(clave);
        // sin locales en MODO: las provincias que ya conocen las otras promos de la marca
        if (!ps.size && k) { k.p.forEach((v) => ps.add(v)); k.l.forEach((v) => ls.add(v)); }
        let imagen = logo ? (await modoCopiarLogo(logo, yaEstan)) || "" : "";
        if (!imagen && k?.img) imagen = k.img; // logo de la marca en Galicia (la app lo resuelve como en Promociones)
        await admin.from("promos_bench_marcas").upsert({
          marca_clave: clave, provincias: ps.size ? [...ps].sort() : null, localidades: ps.size ? [...ls].sort() : null,
          imagen, updated_at: new Date().toISOString(),
        }, { onConflict: "marca_clave" });
        ok++;
      } catch (e) {
        console.error("benchmark marca", clave, String((e as Error)?.message || e));
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { hechas: ok, pendientes: Math.max(0, cola.length - idx) };
}

// ── Webs propias: BBVA (lista abierta) y Galicia (detalle de cada promo) ────
// MODO no tiene todo: BBVA publica ~1.000 promos en su propia web contra ~200 en
// MODO, y el catálogo de Galicia (que ya baja Promociones) tiene ~1.700 vigentes
// contra ~150 que MODO le atribuye. Estas filas llevan fuente 'bbva' / 'galicia'
// (las de MODO, 'modo'); el cliente junta las que son la misma promo y se queda
// con la de la web propia. Supervielle y Santander tienen su propio bloque más abajo;
// Macro sigue sólo por MODO (su API pide una clave interna de su web).
const RUBRO_PALABRAS: [RegExp, string][] = [
  [/^(supermercados?|hiper|mayorista)/i, "Supermercados"], [/^gastronom/i, "Gastronomía"],
  [/^(farmacia|perfumer|salud)/i, "Salud y Bienestar"], [/^(combustible|estaci)/i, "Combustible"],
  [/^(indumentaria|moda)/i, "Indumentaria"], [/^(turismo|viajes)/i, "Entretenimiento"],
  [/^hogar/i, "Hogar"], [/^(electro|tecnolog)/i, "Electrónica"],
];
// Los rubros de Galicia son más finos que los de MODO: se llevan a la lista de MODO
// para que las dos fuentes se comparen en los mismos rubros.
const RUBRO_GALICIA: Record<string, string> = {
  "Bares": "Gastronomía", "Confitería": "Gastronomía", "Gastronomía": "Gastronomía", "Librerías": "Juguetes", "Juguetes": "Juguetes",
  "Peluquerías": "Salud y Bienestar", "Salud y Bienestar": "Salud y Bienestar", "Viajes": "Entretenimiento", "Entretenimiento": "Entretenimiento",
  "Supermercados": "Supermercados", "Combustible": "Combustible", "Indumentaria": "Indumentaria", "Hogar": "Hogar",
  "Electrónica": "Electrónica", "Mascotas": "Mascotas", "Vehículos": "Vehículos",
};
export function rubroDeGalicia(r: unknown): string { return RUBRO_GALICIA[String(r || "")] || "Otros"; }
// "Supermercados Vea QR Modo 20%" -> "Supermercados Vea"; "Lazaro 20% y 6 cuotas" -> "Lazaro"
export function marcaDeCabecera(c: unknown): string {
  return String(c || "").replace(/\s+/g, " ")
    .replace(/\s*\b(qr|nfc)\b.*$/i, "").replace(/\s+modo\b.*$/i, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*%.*$/, "").replace(/\s*(hasta\s*)?\d+\s*cuotas.*$/i, "").trim();
}
// BBVA: lunes primero ("0,1,0,0,0,0,0" = sólo martes; verificado contra las que también están en MODO)
export function diasBbva(d: unknown): number[] {
  const v = String(d ?? "").split(",").map((x) => x.trim());
  if (v.length !== 7) return [];
  const idx = v.map((x, i) => (x === "1" ? i : -1)).filter((i) => i >= 0);
  return idx.length === 7 ? [] : idx;
}
export function normalizarBbva(x: any, rubroDe: (clave: string) => string | undefined, hoy: string, ahora: string): Record<string, unknown> | null {
  const id = String(x?.id || ""), cab = String(x?.cabecera || "").replace(/\s+/g, " ").trim();
  const marca = marcaDeCabecera(cab);
  if (!id || !marca) return null;
  const mp = cab.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  const mc = cab.match(/(\d{1,2})\s*cuotas/i);
  const tope = Number(x?.montoTope || 0);
  const grupo = String(x?.grupoTarjeta || "");
  const dn = diasBbva(x?.diasPromo);
  const clave = modoClave(marca);
  const desde = isoFecha(x?.fechaDesde), hasta = isoFecha(x?.fechaHasta);
  const porPalabra = RUBRO_PALABRAS.find(([re]) => re.test(marca));
  return {
    id: "bbva:b" + id, banco: "bbva", fuente: "bbva",
    titulo: marca, marca_clave: clave,
    rubro: rubroDe(clave) || (porPalabra ? porPalabra[1] : "Otros"),
    slug: "", beneficio: cab,
    pct: mp ? Number(mp[1].replace(",", ".")) : null,
    tope: tope > 0 ? tope : null, tope_por: null,
    cuotas: mc ? Number(mc[1]) : 0,
    dias: diasTexto(dn), dias_n: dn,
    credito: /cr[eé]dito/i.test(grupo) || !/d[eé]bito/i.test(grupo), debito: /d[eé]bito/i.test(grupo),
    emisores: [], canales: [], segmento: null, segmento_txt: grupo || null,
    provincias: null, fecha_desde: desde, fecha_hasta: hasta,
    proximamente: (desde || "") > hoy, updated_at: ahora, detalle_at: ahora,
  };
}
// Galicia: el tope, las tarjetas y el segmento están en el texto legal del detalle
export function parsearLegalesGalicia(legales: unknown): { tope: number | null; por: string | null; credito: boolean; debito: boolean; emisores: string[]; segmento: string | null } {
  const t = String(legales || "").replace(/\s+/g, " ");
  const mt = t.match(/tope[^$.]{0,60}\$\s*([\d.]+)(?:,\d+)?\s*([^.]{0,50})/i);
  const tope = mt ? Number(mt[1].replace(/\./g, "")) : 0;
  const cola = (mt ? mt[2] : "").toLowerCase();
  const por = !mt ? null : /por mes|mensual/.test(cola) ? "month" : /por semana|semanal/.test(cola) ? "week" : /por d[ií]a|diario/.test(cola) ? "day" : /por (compra|operaci|transacci)/.test(cola) ? "transaction" : null;
  const mtar = t.match(/para compras realizadas con ([^.]{0,320})/i);
  const tar = mtar ? mtar[1] : t.slice(0, 700);
  const debito = /d[eé]bito/i.test(tar);
  const credito = /(visa|master|american express|amex)/i.test(tar.replace(/tarjeta\s+(galicia\s+)?d[eé]bito/gi, "").replace(/visa\s+d[eé]bito/gi, ""));
  const emisores: string[] = [];
  if (/visa/i.test(tar)) emisores.push("visa");
  if (/master/i.test(tar)) emisores.push("master");
  if (/american express|amex/i.test(tar)) emisores.push("american_express");
  const prem = /(clientes?|tarjetas?|paquetes?)[^.]{0,40}([eé]minent|black|platinum|signature|infinite)/i.test(t.slice(0, 900));
  return { tope: tope > 0 ? tope : null, por, credito: credito || !debito, debito, emisores, segmento: prem ? "premium" : null };
}
const DIAS_GALICIA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
export function normalizarGalicia(p: any, det: any, hoy: string, ahora: string): Record<string, unknown> | null {
  const titulo = String(p?.titulo || "").replace(/\s+/g, " ").trim();
  if (!p?.id || !titulo) return null;
  const ben = String(p?.beneficio || "");
  const mp = ben.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  const mc = ben.match(/(\d{1,2})\s*cuotas/i);
  const cuotas = Math.max(Number(det?.cuotaSinInteresHasta || 0), mc ? Number(mc[1]) : 0);
  const cod = String(det?.diasAplicacion || "").split(";").map((s) => s.trim());
  const dn = cod.map((s) => DIAS_GALICIA.indexOf(s)).filter((i) => i >= 0).sort((a, b) => a - b);
  const dias = dn.length === 7 || !dn.length ? [] : dn;
  const L = parsearLegalesGalicia(det?.legales);
  const desde = p.fecha_desde || isoFecha(det?.fechaDesde);
  return {
    id: "galicia:g" + p.id, banco: "galicia", fuente: "galicia",
    titulo, marca_clave: modoClave(titulo), rubro: rubroDeGalicia(p.subtitulo),
    slug: "", beneficio: ben || null,
    pct: mp ? Number(mp[1].replace(",", ".")) : null,
    tope: L.tope, tope_por: L.por, cuotas,
    dias: p.dias || diasTexto(dias), dias_n: dias,
    credito: L.credito, debito: L.debito, emisores: L.emisores, canales: [],
    segmento: L.segmento, segmento_txt: null,
    provincias: Array.isArray(p.provincias) ? p.provincias : null,
    fecha_desde: desde, fecha_hasta: p.fecha_hasta || null,
    proximamente: (desde || "") > hoy || (!!p.proximamente && !desde), updated_at: ahora, detalle_at: ahora,
  };
}
// Misma promo vista por dos fuentes: se queda la de la web propia (ver el cliente: benDedup).
export function claveDup(r: any): string {
  return [r.banco, r.marca_clave, r.pct ?? "", r.cuotas || 0, (r.dias_n || []).join(""), r.credito ? 1 : 0, r.debito ? 1 : 0].join("|");
}

async function rubroPorMarca(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_bench_cache").select("marca_clave,rubro").eq("fuente", "modo").order("id").range(d, d + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) if (r.marca_clave && r.rubro && r.rubro !== "Otros" && !m.has(r.marca_clave)) m.set(r.marca_clave, r.rubro);
    if (!data || data.length < 1000) break;
  }
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_galicia_cache").select("titulo,subtitulo").order("id").range(d, d + 999);
    if (error) break;
    for (const g of data || []) { const k = modoClave(g.titulo), r = rubroDeGalicia(g.subtitulo); if (k && r !== "Otros" && !m.has(k)) m.set(k, r); }
    if (!data || data.length < 1000) break;
  }
  return m;
}

async function syncBbva(): Promise<{ total: number }> {
  const todas: any[] = [];
  let paginas = 1;
  for (let p = 0; p < paginas && p < 120; p++) {
    const r = await fetch("https://go.bbva.com.ar/willgo/fgo/API/v3/communications?pager=" + p, { headers: MODO_HEADERS });
    if (!r.ok) throw new Error("BBVA respondió " + r.status);
    const d = await r.json();
    if (!Array.isArray(d?.data)) throw new Error("BBVA cambió el formato del listado");
    if (p === 0) {
      paginas = Number((/paginas:\s*(\d+)/.exec(String(d?.message || "")) || [0, 1])[1]);
      if (paginas > 120) throw new Error("BBVA informa " + paginas + " páginas: no se reemplaza");
    }
    todas.push(...d.data);
  }
  if (!todas.length) throw new Error("BBVA devolvió el listado vacío");
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10), ahora = new Date().toISOString();
  const rubros = await rubroPorMarca();
  const vistos = new Set<string>();
  const vigentes = todas.filter((x) => { const id = String(x?.id || ""); if (!id || vistos.has(id)) return false; vistos.add(id); const h = isoFecha(x?.fechaHasta); return !h || h >= hoy; });
  const filas = vigentes.map((x) => normalizarBbva(x, (k) => rubros.get(k), hoy, ahora)).filter(Boolean) as Record<string, unknown>[];
  if (filas.length < vigentes.length * 0.8) throw new Error(`Sólo ${filas.length} de ${vigentes.length} promos de BBVA se pudieron leer: cambió el formato, no se reemplaza`);
  const { count: guardadas } = await admin.from("promos_bench_cache").select("id", { count: "exact", head: true }).eq("fuente", "bbva").or(`fecha_hasta.is.null,fecha_hasta.gte.${hoy}`);
  if (guardadas && filas.length < guardadas * MINIMO_RELATIVO) throw new Error(`BBVA devolvió sólo ${filas.length} promos y la copia guardada tiene ${guardadas}: no se reemplaza por las dudas`);
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await admin.from("promos_bench_cache").upsert(filas.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error("Guardando: " + error.message);
  }
  const { error: del } = await admin.from("promos_bench_cache").delete().eq("fuente", "bbva").lt("updated_at", ahora);
  if (del) throw new Error("Limpiando: " + del.message);
  return { total: filas.length };
}

const GALICIA_BFF_PORTAL = "https://loyalty.bff.bancogalicia.com.ar/api/portal/personalizacion/v1/promociones/idPromocion/";
const GALICIA_HEADERS_B: Record<string, string> = {
  "Accept": "application/json", "Origin": "https://beneficios.galicia.ar", "Referer": "https://beneficios.galicia.ar/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};
const GALICIA_DETALLE_DIAS = 14; // el tope de una promo no cambia a menudo: se vuelve a leer cada 14 días
// Las promos vigentes del catálogo de Galicia (el que ya baja Promociones), con el
// tope y las tarjetas del detalle de cada una. Es una lectura larga: se hace por
// tandas con tope de tiempo y se retoma donde quedó (devuelve cuántas faltan).
async function syncGaliciaPropia(presupuestoMs: number): Promise<{ hechas: number; pendientes: number; total: number }> {
  const t0 = Date.now();
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const cat: any[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_galicia_cache").select("id,titulo,subtitulo,beneficio,dias,provincias,fecha_desde,fecha_hasta,proximamente").order("id").range(d, d + 999);
    if (error) throw new Error("Leyendo el catálogo de Galicia: " + error.message);
    cat.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  // también las próximas: la solapa muestra las que empiezan en los próximos días (la fecha de inicio
  // la trae el detalle cuando el listado no la tiene)
  const vigentes = cat.filter((p) => !p.fecha_hasta || p.fecha_hasta >= hoy);
  if (!vigentes.length) throw new Error("El catálogo de Galicia está vacío: no se lee");
  const ya = new Map<string, number>();
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin.from("promos_bench_cache").select("id,detalle_at").eq("fuente", "galicia").order("id").range(d, d + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) ya.set(r.id, r.detalle_at ? new Date(r.detalle_at).getTime() : 0);
    if (!data || data.length < 1000) break;
  }
  const vence = Date.now() - GALICIA_DETALLE_DIAS * 86400000;
  const cola = vigentes.filter((p) => (ya.get("galicia:g" + p.id) ?? 0) < vence);
  const ahora = new Date().toISOString();
  let idx = 0, ok = 0, buf: Record<string, unknown>[] = [];
  const vaciar = async () => {
    if (!buf.length) return;
    const lote = buf; buf = [];
    const { error } = await admin.from("promos_bench_cache").upsert(lote, { onConflict: "id" });
    if (error) throw new Error("Guardando: " + error.message);
  };
  async function worker() {
    while (idx < cola.length && Date.now() - t0 < presupuestoMs) {
      const p = cola[idx++];
      try {
        const r = await fetch(GALICIA_BFF_PORTAL + p.id, { headers: GALICIA_HEADERS_B });
        if (!r.ok) throw new Error("Galicia respondió " + r.status);
        const d = await r.json();
        const fila = normalizarGalicia(p, d?.data, hoy, ahora);
        if (fila) { buf.push(fila); ok++; }
        if (buf.length >= 50) await vaciar();
      } catch (e) {
        console.error("benchmark galicia", p.id, String((e as Error)?.message || e));
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  await vaciar();
  const pendientes = Math.max(0, cola.length - idx);
  // al terminar, se sacan las que ya no están vigentes en el catálogo
  if (!pendientes) {
    const hay = new Set(vigentes.map((p) => "galicia:g" + p.id));
    const sobran = [...ya.keys()].filter((k) => !hay.has(k));
    for (let i = 0; i < sobran.length; i += 200) await admin.from("promos_bench_cache").delete().in("id", sobran.slice(i, i + 200));
  }
  return { hechas: ok, pendientes, total: vigentes.length };
}
// ── Supervielle: la API abierta del buscador de su web ────────────────────
// /api/rubros (por segmento) y /api/beneficios?rubro=<nombre>&esIdentite=<bool>.
// Sólo pide un User-Agent de navegador (sin él, CloudFront contesta 403).
const SUP_API = "https://www.supervielle.com.ar/api";
const DIAS_ES = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
const RUBRO_SUPERVIELLE: [RegExp, string][] = [
  [/combust/i, "Combustible"], [/supermerc|carnicer/i, "Supermercados"], [/farmac|belleza|optica|óptica/i, "Salud y Bienestar"],
  [/automotor/i, "Vehículos"], [/tecnolog/i, "Electrónica"], [/turismo|transporte|entreten/i, "Entretenimiento"],
  [/indument/i, "Indumentaria"], [/hogar/i, "Hogar"], [/mascota/i, "Mascotas"], [/restaur|bodega/i, "Gastronomía"],
];
// "Shell con MODO" -> "Shell" (para juntarla con la misma marca de los otros bancos)
export function marcaSupervielle(m: unknown): string {
  return String(m || "").replace(/\s+/g, " ").replace(/\s+con\s+(modo|mastercard|visa|qr)\b.*$/i, "").trim();
}
export function rubroSupervielle(rubro: unknown, marca: string, rubroDe: (clave: string) => string | undefined): string {
  const r = RUBRO_SUPERVIELLE.find(([re]) => re.test(String(rubro || "")));
  if (r) return r[1];
  const porPalabra = RUBRO_PALABRAS.find(([re]) => re.test(marca));
  return rubroDe(modoClave(marca)) || (porPalabra ? porPalabra[1] : "Otros");
}
export function normalizarSupervielle(b: any, rubroDe: (clave: string) => string | undefined, hoy: string, ahora: string): Record<string, unknown> | null {
  const marca = marcaSupervielle(b?.marca);
  if (!b?.id || !marca) return null;
  const mp = String(b?.descuento || "").match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  const cuotas = Math.max(0, ...(Array.isArray(b?.cuotas) ? b.cuotas : []).map((x: unknown) => Number(String(x).replace(/\D/g, "")) || 0));
  const idx = [...new Set((Array.isArray(b?.dias) ? b.dias : []).map((d: unknown) => DIAS_ES.indexOf(sinAcentos(d))).filter((i: number) => i >= 0))] as number[];
  const dias = idx.length === 7 ? [] : idx.sort((x, y) => x - y);
  const tope = Number(b?.tope || 0);
  const cred = !!b?.esTarjetaCredito, deb = !!b?.esTarjetaDebito;
  const rubroTxt = String(b?.rubro || "");
  const emisores = /visa/i.test(rubroTxt) ? ["visa"] : /mastercard/i.test(rubroTxt) ? ["master"] : [];
  const desde = isoFecha(b?.fechaVigenciaDesde), hasta = isoFecha(b?.fechaVigenciaHasta);
  return {
    id: "supervielle:p" + b.id, banco: "supervielle", fuente: "supervielle",
    titulo: marca, marca_clave: modoClave(marca), rubro: rubroSupervielle(rubroTxt, marca, rubroDe),
    slug: "", beneficio: [b?.descuento, cuotas ? "hasta " + cuotas + " cuotas sin interés" : ""].filter(Boolean).join(" y ") || null,
    pct: mp ? Number(mp[1].replace(",", ".")) : null,
    tope: tope > 0 ? tope : null, tope_por: null, cuotas,
    dias: diasTexto(dias), dias_n: dias,
    credito: cred || (!cred && !deb), debito: deb || (!cred && !deb), emisores, canales: [],
    segmento: b?.esIdentite ? "premium" : null, segmento_txt: b?.esIdentite ? "Identité" : null,
    provincias: null, fecha_desde: desde, fecha_hasta: hasta,
    proximamente: (desde || "") > hoy, updated_at: ahora, detalle_at: ahora, bancos_n: null,
  };
}
async function jsonCon(url: string, headers: Record<string, string>, ms = 20000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) throw new Error("respondió " + r.status);
    return await r.json();
  } catch (e) {
    throw new Error((e as Error)?.name === "AbortError" ? "no respondió en " + Math.round(ms / 1000) + " s" : (e as Error)?.message || String(e));
  } finally {
    clearTimeout(t);
  }
}
async function syncSupervielle(): Promise<{ total: number }> {
  const pares: [string, boolean][] = [];
  for (const ide of [false, true]) {
    const d = await jsonCon(`${SUP_API}/rubros/?esIdentite=${ide}`, MODO_HEADERS);
    if (!Array.isArray(d?.rubros) || !d.rubros.length) throw new Error("Supervielle cambió el formato de los rubros");
    for (const r of d.rubros) if (r?.nombre) pares.push([String(r.nombre), ide]);
  }
  const crudo: any[] = [];
  let i = 0;
  async function worker() {
    while (i < pares.length) {
      const [rubro, ide] = pares[i++];
      const url = `${SUP_API}/beneficios?rubro=${encodeURIComponent(rubro)}&esIdentite=${ide}`;
      let d: any;
      try { d = await jsonCon(url, MODO_HEADERS); } catch { d = await jsonCon(url, MODO_HEADERS); } // un reintento
      if (!Array.isArray(d?.beneficios)) throw new Error("Supervielle cambió el formato del listado");
      crudo.push(...d.beneficios);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker)); // si un rubro falla, falla todo: no se guarda una lista cortada
  if (!crudo.length) throw new Error("Supervielle devolvió el listado vacío");
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10), ahora = new Date().toISOString();
  const rubros = await rubroPorMarca();
  // la clásica primero: si la de Identité es igual, queda la clásica (vale para todos)
  crudo.sort((a, b) => (a?.esIdentite ? 1 : 0) - (b?.esIdentite ? 1 : 0));
  const vistas = new Set<string>(), filas: Record<string, unknown>[] = [];
  for (const b of crudo) {
    const f = normalizarSupervielle(b, (k) => rubros.get(k), hoy, ahora);
    if (!f || (f.fecha_hasta && String(f.fecha_hasta) < hoy)) continue;
    const k = claveDup(f) + "|" + (f.segmento || "");
    const kGeneral = claveDup(f) + "|";
    if (vistas.has(k) || vistas.has(kGeneral)) continue; // Identité igual a una general, o farmacia repetida por local
    vistas.add(k);
    filas.push(f);
  }
  if (!filas.length) throw new Error("Ninguna promo de Supervielle se pudo leer");
  const { count: guardadas } = await admin.from("promos_bench_cache").select("id", { count: "exact", head: true }).eq("fuente", "supervielle").or(`fecha_hasta.is.null,fecha_hasta.gte.${hoy}`);
  if (guardadas && filas.length < guardadas * MINIMO_RELATIVO) throw new Error(`Supervielle devolvió sólo ${filas.length} promos y la copia guardada tiene ${guardadas}: no se reemplaza por las dudas`);
  for (let j = 0; j < filas.length; j += 500) {
    const { error } = await admin.from("promos_bench_cache").upsert(filas.slice(j, j + 500), { onConflict: "id" });
    if (error) throw new Error("Guardando: " + error.message);
  }
  const { error: del } = await admin.from("promos_bench_cache").delete().eq("fuente", "supervielle").lt("updated_at", ahora);
  if (del) throw new Error("Limpiando: " + del.message);
  return { total: filas.length };
}

// ── Santander: su buscador (/bff-benefits) ─────────────────────────────────
// La web tiene protección anti-robots: desde un servidor puede no responder. Se
// intenta con un pedido normal (sin disfrazarlo); si no contesta, queda anotado
// y el Benchmark sigue con lo que haya: MODO y las promos que el admin carga a mano
// (promos_bench_manual). No se disfraza el pedido ni se usan servicios para saltear la protección.
const SAN_API = "https://www.santander.com.ar/bff-benefits";
const SAN_CICLO_DIAS = 6;
const SAN_BLOQUEO = "Santander bloquea la lectura automática desde la nube";
const SAN_RUBROS: [RegExp, string][] = [
  [/combust/i, "Combustible"], [/supermerc/i, "Supermercados"], [/gastronom|restaur|bar|caf/i, "Gastronomía"],
  [/farmac|perfum|belleza|salud|óptic|optic/i, "Salud y Bienestar"], [/indument|moda|calzad/i, "Indumentaria"],
  [/hogar|deco|muebl/i, "Hogar"], [/tecnolog|electr/i, "Electrónica"], [/mascota/i, "Mascotas"], [/juguet|librer/i, "Juguetes"],
  [/viaje|turismo|entreten|espect|shopping/i, "Entretenimiento"], [/automotor/i, "Vehículos"],
];
export function rubroSantander(cats: any[]): string {
  const desc = (Array.isArray(cats) ? cats : []).map((c) => String(c?.description || ""));
  for (const [re, r] of SAN_RUBROS) if (desc.some((d) => re.test(d))) return r;
  return "Otros";
}
const SAN_DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export function normalizarSantander(it: any, hoy: string, ahora: string): Record<string, unknown> | null {
  const marca = String(it?.brands?.[0]?.name || "").replace(/\s+/g, " ").trim();
  if (!it?.id || !marca) return null;
  let dn = it?.fullWeek ? [] : SAN_DIAS.map((d, i) => (it?.[d] ? i : -1)).filter((i) => i >= 0);
  if (dn.length === 7) dn = [];
  const fr = String(it?.frecuency?.description || "").toLowerCase();
  const codes = (Array.isArray(it?.categories) ? it.categories : []).map((c: any) => String(c?.code || ""));
  const texto = String(it?.legal || "") + " " + String(it?.additionalText || "");
  let cred = /cr[eé]dito/i.test(texto), deb = /d[eé]bito/i.test(texto);
  if (!cred && !deb) { cred = true; deb = true; }
  const emisores: string[] = [];
  if (codes.includes("EXV") || /\bvisa\b/i.test(texto)) emisores.push("visa");
  if (codes.includes("EXM") || /mastercard/i.test(texto)) emisores.push("master");
  if (/american express|amex/i.test(texto)) emisores.push("american_express");
  const desde = isoFecha(it?.startDatePublication), hasta = isoFecha(it?.endDatePublication);
  const pct = Number(it?.customerDiscount) > 0 ? Number(it.customerDiscount) : null;
  const tope = Number(it?.topAmount) > 0 ? Number(it.topAmount) : null;
  const cuotas = it?.interestFreeFees ? Math.max(Number(it?.finalQuote) || 0, Number(it?.initialQuote) || 0) : 0;
  return {
    id: "santander:s" + it.id, banco: "santander", fuente: "santander",
    titulo: marca, marca_clave: modoClave(marca), rubro: rubroSantander(it?.categories),
    slug: "brand:" + String(it?.brands?.[0]?.id ?? ""),
    beneficio: [it?.texts?.title, it?.texts?.description].filter(Boolean).join(" · ") || null,
    pct, tope, tope_por: !tope ? null : /mensual/.test(fr) ? "month" : /semanal/.test(fr) ? "week" : /diari/.test(fr) ? "day" : null,
    cuotas, dias: diasTexto(dn), dias_n: dn,
    credito: cred, debito: deb, emisores, canales: it?.paymentType?.description ? [String(it.paymentType.description)] : [],
    segmento: codes.includes("SEC") ? "premium" : null,
    segmento_txt: [codes.includes("SEC") ? "Select" : "", it?.tag?.description || ""].filter(Boolean).join(" · ") || null,
    provincias: null, fecha_desde: desde, fecha_hasta: hasta,
    proximamente: (desde || "") > hoy, updated_at: ahora, detalle_at: ahora, bancos_n: null,
  };
}
const SAN_HEADERS: Record<string, string> = { ...MODO_HEADERS, "Referer": "https://www.santander.com.ar/personas/beneficios" };
async function sanMarcas(): Promise<{ id: number; name: string }[]> {
  const out: { id: number; name: string }[] = [];
  for (let page = 1; page <= 6; page++) {
    const d = await jsonCon(`${SAN_API}/brands?page=${page}&limit=500`, SAN_HEADERS);
    const items = Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : null;
    if (!items) throw new Error("Santander cambió el formato del listado");
    for (const b of items) if (b?.id != null) out.push({ id: Number(b.id), name: String(b.name || "") });
    const total = Number(d?.totalItems || 0);
    if (!items.length || (total && out.length >= total)) break;
  }
  if (!out.length) throw new Error("Santander devolvió el listado vacío");
  return out;
}
// Guarda las promos de una marca (reemplaza las anteriores de esa marca).
async function sanGuardarMarca(brandId: number, items: any[], hoy: string, ahora: string): Promise<number> {
  const filas = items.map((it) => normalizarSantander(it, hoy, ahora)).filter((f) => f && (!f.fecha_hasta || String(f.fecha_hasta) >= hoy)) as Record<string, unknown>[];
  await admin.from("promos_bench_cache").delete().eq("fuente", "santander").eq("slug", "brand:" + brandId);
  if (filas.length) {
    const { error } = await admin.from("promos_bench_cache").upsert(filas, { onConflict: "id" });
    if (error) throw new Error("Guardando: " + error.message);
  }
  return filas.length;
}
async function syncSantander(presupuestoMs: number): Promise<{ hechas: number; pendientes: number; total: number }> {
  const t0 = Date.now();
  const marcas = await sanMarcas(); // si Santander no responde, falla acá y no se toca nada
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10), ahora = new Date().toISOString();
  const { data: m } = await admin.from("promos_bench_meta").select("progreso").eq("banco", "santander_web").maybeSingle();
  let prog = (m?.progreso && typeof m.progreso === "object") ? m.progreso : null;
  if (!prog || !prog.ciclo || Date.now() - new Date(prog.ciclo).getTime() > SAN_CICLO_DIAS * 86400000) prog = { ciclo: ahora, hechas: [] };
  const hechas = new Set<number>((prog.hechas || []).map(Number));
  const cola = marcas.filter((b) => !hechas.has(b.id));
  let i = 0, ok = 0;
  async function worker() {
    while (i < cola.length && Date.now() - t0 < presupuestoMs) {
      const b = cola[i++];
      try {
        const d = await jsonCon(`${SAN_API}/brands/${b.id}`, SAN_HEADERS);
        await sanGuardarMarca(b.id, Array.isArray(d?.items) ? d.items : [], hoy, ahora);
        hechas.add(b.id);
        ok++;
      } catch (e) {
        console.error("benchmark santander", b.id, String((e as Error)?.message || e));
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const pendientes = marcas.filter((b) => !hechas.has(b.id)).length;
  await admin.from("promos_bench_meta").upsert({ banco: "santander_web", progreso: { ciclo: prog.ciclo, hechas: [...hechas] } }, { onConflict: "banco" });
  let total = 0;
  if (!pendientes) {
    // al terminar la vuelta, se sacan las marcas que ya no están en su listado
    const vivas = new Set(marcas.map((b) => "brand:" + b.id));
    const viejas: string[] = [];
    for (let d = 0; ; d += 1000) {
      const { data } = await admin.from("promos_bench_cache").select("id,slug").eq("fuente", "santander").order("id").range(d, d + 999);
      for (const r of data || []) { if (vivas.has(r.slug)) total++; else viejas.push(r.id); }
      if (!data || data.length < 1000) break;
    }
    for (let j = 0; j < viejas.length; j += 200) await admin.from("promos_bench_cache").delete().in("id", viejas.slice(j, j + 200));
  }
  return { hechas: ok, pendientes, total };
}
// ── Recordatorio mensual de las promos cargadas a mano (día 5) ─────────────
// Macro y Santander bloquean la lectura automática de su web: sus promos propias
// las carga el admin a mano (tabla promos_bench_manual). El día 5 llega un mail
// con lo que hay por banco, lo vencido y lo que vence en los próximos 7 días.
export function resumenManual(filas: any[], hoy: string): { banco: string; total: number; vencidas: string[]; porVencer: string[] }[] {
  const en7 = new Date(new Date(hoy + "T12:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const por = new Map<string, { banco: string; total: number; vencidas: string[]; porVencer: string[] }>();
  for (const k of Object.keys(BANCOS)) por.set(k, { banco: k, total: 0, vencidas: [], porVencer: [] });
  for (const f of filas || []) {
    const x = por.get(String(f.banco)) || { banco: String(f.banco), total: 0, vencidas: [], porVencer: [] };
    x.total++;
    const h = f.fecha_hasta ? String(f.fecha_hasta) : "";
    if (h && h < hoy) x.vencidas.push(String(f.titulo));
    else if (h && h <= en7) x.porVencer.push(String(f.titulo));
    por.set(x.banco, x);
  }
  return [...por.values()];
}
async function recordatorioManual(): Promise<{ enviado: boolean; resumen: unknown }> {
  const { data, error } = await admin.from("promos_bench_manual").select("banco,titulo,fecha_hasta");
  if (error) throw new Error("Leyendo las promos cargadas a mano: " + error.message);
  const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const r = resumenManual(data || [], hoy);
  const lineas: [string, string][] = r.filter((x) => x.banco === "macro" || x.banco === "santander" || x.total).map((x) => [
    BANCOS[x.banco]?.nombre || x.banco,
    x.total + " cargadas" + (x.vencidas.length ? " · vencidas: " + x.vencidas.slice(0, 6).join(", ") + (x.vencidas.length > 6 ? "…" : "") : "") +
      (x.porVencer.length ? " · vencen esta semana: " + x.porVencer.slice(0, 6).join(", ") + (x.porVencer.length > 6 ? "…" : "") : ""),
  ]);
  await avisarAdmin({
    asunto: "Armador de flyers · Benchmark: revisar las promos cargadas a mano",
    titulo: "Es día de revisar las promos cargadas a mano",
    parrafos: [
      "Macro y Santander no dejan leer su web de forma automática, así que sus promos propias se cargan a mano en el Benchmark. Conviene revisar las del mes nuevo: sacar las vencidas y sumar las que aparecieron.",
      "Se hace en la solapa Benchmark → Cargadas a mano (botones Editar, Quitar y + Agregar promo).",
    ],
    datos: lineas,
  });
  return { enviado: !!(MAIL_URL && MAIL_SECRET), resumen: r };
}

async function metaWeb(clave: string, r: { total?: number; error?: string }): Promise<void> {
  if (r.error) await admin.from("promos_bench_meta").upsert({ banco: clave, error: r.error }, { onConflict: "banco" });
  else await admin.from("promos_bench_meta").upsert({ banco: clave, last_sync_at: new Date().toISOString(), total: r.total ?? 0, error: null }, { onConflict: "banco" });
}

async function syncTodo(bancos: string[]): Promise<{ resultados: any[]; errores: [string, string][] }> {
  const resultados: any[] = [];
  for (const b of bancos) resultados.push(await syncBancoSeguro(b)); // uno por vez: no saturar a MODO
  return {
    resultados,
    errores: resultados.filter((r) => r.error).map((r) => [BANCOS[r.banco]?.nombre || r.banco, String(r.error)] as [string, string]),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const action = body?.action;
  const cron = ["sync", "marcas", "bbva", "galicia", "supervielle", "santander", "recordatorio"].includes(action) && esCron(req);
  if (!cron && !(await requireCan(req))) return json({ error: "No autorizado" }, 403);
  try {
    if (action === "status") {
      const { data, error } = await admin.from("promos_bench_meta").select("banco,last_sync_at,total,error");
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }
    if (action === "sync") {
      const uno = String(body?.banco || "");
      const lista = uno ? [uno] : Object.keys(BANCOS);
      if (lista.some((b) => !BANCOS[b])) return json({ error: "Banco inválido" }, 400);
      const r = await syncTodo(lista);
      if (cron && r.errores.length) await avisarAdmin(MAIL_FALLO(r.errores));
      return json({ data: r });
    }
    if (action === "bbva") {
      try {
        const r = await syncBbva();
        await metaWeb("bbva_web", r);
        return json({ data: r });
      } catch (e) {
        const msg = (e as Error)?.message || "Error";
        await metaWeb("bbva_web", { error: msg });
        if (cron) await avisarAdmin(MAIL_FALLO([["BBVA (web propia)", msg]]));
        return json({ error: msg }, 500);
      }
    }
    if (action === "supervielle") {
      try {
        const r = await syncSupervielle();
        await metaWeb("supervielle_web", r);
        return json({ data: r });
      } catch (e) {
        const msg = (e as Error)?.message || "Error";
        await metaWeb("supervielle_web", { error: msg });
        if (cron) await avisarAdmin(MAIL_FALLO([["Supervielle (web propia)", msg]]));
        return json({ error: msg }, 500);
      }
    }
    if (action === "santander") {
      // si Santander no responde se anota y se sigue: no es un error para el admin (está previsto)
      try {
        const ms = Number(body?.presupuestoMs) > 0 ? Math.min(Number(body.presupuestoMs), 110000) : 100000;
        const r = await syncSantander(ms);
        if (!r.pendientes) await metaWeb("santander_web", { total: r.total });
        return json({ data: r });
      } catch (e) {
        const msg = SAN_BLOQUEO + " (" + ((e as Error)?.message || "error") + ")";
        await metaWeb("santander_web", { error: msg });
        return json({ data: { bloqueado: true, error: msg, pendientes: 0 } });
      }
    }
    if (action === "recordatorio") {
      return json({ data: await recordatorioManual() });
    }
    if (action === "galicia") {
      try {
        const ms = Number(body?.presupuestoMs) > 0 ? Math.min(Number(body.presupuestoMs), 110000) : 100000;
        const r = await syncGaliciaPropia(ms);
        if (!r.pendientes) await metaWeb("galicia_web", { total: r.total });
        return json({ data: r });
      } catch (e) {
        const msg = (e as Error)?.message || "Error";
        await metaWeb("galicia_web", { error: msg });
        if (cron) await avisarAdmin(MAIL_FALLO([["Galicia (catálogo propio)", msg]]));
        return json({ error: msg }, 500);
      }
    }
    if (action === "marcas") {
      const ms = Number(body?.presupuestoMs) > 0 ? Math.min(Number(body.presupuestoMs), 110000) : 100000;
      return json({ data: await syncMarcas(ms) });
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (e) {
    const msg = (e as Error)?.message || "Error";
    if (cron) await avisarAdmin(MAIL_FALLO([["Error", msg]]));
    return json({ error: msg }, 500);
  }
});
