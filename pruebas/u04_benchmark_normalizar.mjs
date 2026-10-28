// Prueba de la normalización del Benchmark (Edge Function benchmark-sync), sin
// Supabase: toma las funciones puras del código de la función y las corre con Node.
// Con internet, además baja una página real de cada banco de MODO y revisa que
// todas las promos se puedan leer. Uso: node pruebas/u04_benchmark_normalizar.mjs
import { readFileSync } from 'fs';
import { stripTypeScriptTypes } from 'module';
const src = readFileSync(new URL('../supabase/functions/benchmark-sync/index.ts', import.meta.url), 'utf8');
const ini = src.indexOf('const MODO_RUBROS'), fin = src.indexOf('// Baja y guarda un banco');
const js = stripTypeScriptTypes(src.slice(ini, fin)).replace(/export function/g, 'function');
const lib = new Function(js + '\nreturn { normalizar, segmentoDe, topeDe, cuotasDe, pctDe, diasIdx, diasTexto, modoClave, isoFecha };')();
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); if (!c) process.exitCode = 1; };

// BBVA real (27-oct-2026): 30% de reintegro, tope 15.000 por mes, lunes, crédito Master, 3 cuotas
const bbva = {
  card: { benefit: '30% de reintegro', validity_place: 'Farmacity, Get The Look, Simplicity', cashback_cap: '15000', participating_bank: 'BBVA' },
  benefit: { id: 'abc', name: 'Grupo Farmacity Lunes', publication: { slug: 's', description: 'Disfruta reintegros y cuotas con tu tarjeta BBVA Mastercard' },
    conditions: { schedule: { start_date: '2026-10-26', stop_date: '2026-11-30', days_of_week: ['monday'] }, payment_flow: { flows: ['instore', 'online'] },
      payment_methods: { methods: [{ type: 'credit_card', issuer: 'master' }] } } },
  offer: { outcomes: { cashback: { amount: 30, amount_type: 'percent' }, financing: { installments: [1, 2, 3].map((n) => ({ type: 'sin_interes', number: n })) } },
    limits: { period_cap: { reset_by: 'month', amount_by_period: 15000 } }, categories: ['4'] },
  calculated_status: 'RUNNING',
};
const f = lib.normalizar(bbva, 'bbva', '2026-10-27', '2026-10-27T00:00:00Z');
ok(f.pct === 30 && f.tope === 15000 && f.tope_por === 'month', 'BBVA: 30 %, tope 15.000 por mes');
ok(f.cuotas === 3 && f.dias === 'Lunes' && JSON.stringify(f.dias_n) === '[0]', 'BBVA: 3 cuotas, sólo lunes');
ok(f.credito && !f.debito && f.emisores[0] === 'master', 'BBVA: sólo crédito Master');
ok(f.rubro === 'Salud y Bienestar' && f.provincias === null, 'BBVA: rubro y "lugares por completar" (tiene local)');
ok(f.segmento === null, 'BBVA común: sin segmento');
ok(f.id === 'bbva:abc', 'id = banco:benefit.id (la misma promo puede estar en dos bancos)');

// Macro Selecta: premium; "12 CSI" en el texto; en todos los días (3 de 7 no)
const macro = { card: { benefit: '30% y hasta 12 CSI Nivel 4', validity_place: 'CARDON', cashback_cap: '0', participating_bank: 'Macro Selecta' },
  benefit: { id: 'm1', name: 'CARDON Selecta Nivel 4', conditions: { schedule: { days_of_week: ['monday', 'tuesday', 'wednesday'], stop_date: '2027-03-31', start_date: '2026-10-15' }, payment_flow: { flows: ['online'] } } },
  offer: { outcomes: { cashback: { amount: 30, amount_type: 'percent' } }, categories: ['3'] } };
const m = lib.normalizar(macro, 'macro', '2026-10-27', 'x');
ok(m.segmento === 'premium', 'Macro Selecta = premium');
ok(m.tope === null && m.pct === 30 && m.cuotas === 12, 'Macro: sin tope informado, 30 %, 12 cuotas leídas del texto');
ok(m.provincias.length === 0 && m.credito && m.debito, 'Sólo online: vale en todo el país; sin tarjetas listadas = todas');
ok(m.dias === 'Lunes, martes y miércoles', 'Días escritos como en el flyer');
ok(lib.diasTexto(lib.diasIdx(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])) === 'Todos los días', 'Los 7 días = "Todos los días"');
ok(lib.segmentoDe({ card: { participating_bank: 'Supervielle Gold' } }).segmento === 'clasico', 'Supervielle Gold = clásico');
ok(lib.segmentoDe({ benefit: { name: 'Supervielle Black' } }).segmento === 'premium', 'Supervielle Black = premium');
ok(lib.normalizar({ card: {}, benefit: {} }, 'bbva', 'h', 'a') === null, 'Una promo sin id ni nombre se descarta');

// Con internet: una página real de cada banco
const API = 'https://www.modo.com.ar/promos/api/rewards';
const SLOTS = ['web-modo-hub-carrousel_principal', 'web-modo-hub-destacadas', 'web-modo-hub-supermercados', 'web-modo-hub-exclusivas-online', 'web-modo-hub-promos-financiacion', 'web-modo-hub-mas-promos'].join(',');
const BANCOS = { galicia: '88d8705e-2dda-46f9-8411-bb4916af858e', bbva: '049ad22b-c0f0-4733-be35-e31256801ce8', macro: '6a089c91-a7d3-4199-a578-2132a3733f69', supervielle: '54fdfe50-7b7e-4316-bf88-97923d5a8a8d', santander: '167504f6-caaf-4ead-b65b-6e6695ae6209' };
for (const [b, id] of Object.entries(BANCOS)) {
  try {
    const qs = new URLSearchParams({ slot_ids: SLOTS, banks: id, source: 'web_modo', origin: 'WEB_MODO', limit: '100', page: '1' });
    const r = await fetch(`${API}/v2/filter?${qs}`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    const filas = d.cards.map((c) => lib.normalizar(c, b, '2026-10-27', 'x'));
    const buenas = filas.filter(Boolean);
    const conPct = buenas.filter((x) => x.pct != null).length, conSeg = buenas.filter((x) => x.segmento).length;
    const conTope = buenas.filter((x) => x.tope != null).length, conCuotas = buenas.filter((x) => x.cuotas > 0).length;
    console.log(`  ${b}: ${buenas.length}/${d.cards.length} leídas · con %: ${conPct} · con tope: ${conTope} · con cuotas: ${conCuotas} · con segmento: ${conSeg} · rubro "Otros": ${buenas.filter((x) => x.rubro === 'Otros').length}`);
    ok(buenas.length >= d.cards.length * 0.95, `${b}: se leen al menos el 95 % de las promos`);
    ok(conPct >= buenas.length * 0.5, `${b}: la mayoría trae un % de reintegro`);
  } catch (e) { console.log('  (sin internet o MODO no responde: ' + e.message + ')'); break; }
}
