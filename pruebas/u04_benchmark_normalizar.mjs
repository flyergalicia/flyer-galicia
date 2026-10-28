// Prueba de la normalización del Benchmark (Edge Function benchmark-sync), sin
// Supabase: toma las funciones puras del código de la función y las corre con Node.
// Con internet, además baja una página real de cada banco de MODO y revisa que
// todas las promos se puedan leer. Uso: node pruebas/u04_benchmark_normalizar.mjs
import { readFileSync } from 'fs';
import { stripTypeScriptTypes } from 'module';
const src = readFileSync(new URL('../supabase/functions/benchmark-sync/index.ts', import.meta.url), 'utf8');
const ini = src.indexOf('const MODO_RUBROS'), fin = src.indexOf('// Baja y guarda un banco');
const ini2 = src.indexOf('// ── Webs propias'), fin2 = src.indexOf('async function rubroPorMarca');
const js = stripTypeScriptTypes(src.slice(ini, fin) + '\n' + src.slice(ini2, fin2)).replace(/export function/g, 'function');
const lib = new Function(js + '\nreturn { normalizar, segmentoDe, topeDe, cuotasDe, pctDe, diasIdx, diasTexto, modoClave, isoFecha, marcaDeCabecera, diasBbva, normalizarBbva, parsearLegalesGalicia, normalizarGalicia, rubroDeGalicia, claveDup };')();
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


// ── Webs propias (entrega 2) ──
ok(lib.marcaDeCabecera('Supermercados Vea QR Modo 20%') === 'Supermercados Vea' && lib.marcaDeCabecera('Lazaro 20% y 6 cuotas') === 'Lazaro' && lib.marcaDeCabecera('Grimoldi 9 cuotas') === 'Grimoldi' && lib.marcaDeCabecera('Gastronomía 20% NFC') === 'Gastronomía', 'BBVA: la marca sale de la cabecera, sin el % ni las cuotas ni "QR Modo"');
ok(JSON.stringify(lib.diasBbva('0,1,0,0,0,0,0')) === '[1]' && lib.diasBbva('1,1,1,1,1,1,1').length === 0 && lib.diasBbva(null).length === 0, 'BBVA: los días empiezan en lunes; todos o ninguno = todos los días');
const bb = lib.normalizarBbva({ id: '88114', cabecera: 'Lazaro 20% y 6 cuotas', fechaDesde: '2026-10-06', fechaHasta: '2027-10-27', diasPromo: '0,1,0,0,0,0,0', montoTope: '50000', grupoTarjeta: 'Tarjetas de crédito BBVA' }, (k) => (k === 'lazaro' ? 'Indumentaria' : undefined), '2026-10-27', 'x');
ok(bb.pct === 20 && bb.cuotas === 6 && bb.tope === 50000 && bb.dias === 'Martes' && bb.credito && !bb.debito && bb.rubro === 'Indumentaria' && bb.fuente === 'bbva' && bb.id === 'bbva:b88114', 'BBVA propio: 20 %, 6 cuotas, tope 50.000, martes, sólo crédito, rubro de la marca');
const bb2 = lib.normalizarBbva({ id: '1', cabecera: 'Supermercados Vea QR Modo 20%', fechaDesde: '2026-07-01', fechaHasta: '2026-10-31', diasPromo: null, montoTope: '25000', grupoTarjeta: 'Tarjetas de crédito y débito BBVA' }, () => undefined, '2026-10-27', 'x');
ok(bb2.credito && bb2.debito && bb2.rubro === 'Supermercados' && bb2.dias === 'Todos los días', 'BBVA: crédito y débito, rubro por la palabra de la cabecera, sin días = todos');
const dar = lib.parsearLegalesGalicia('CARTERA DE CONSUMO. Promoción del 20% de ahorro en compras realizadas, en el país. Tope de reintegro: $15.000 en total por mes. Válida para Viernes comprendidos entre el 20/08/2026 y el 31/10/2026, para compras realizadas con Tarjeta Galicia Débito, Tarjeta Visa, Tarjeta Mastercard y Tarjeta American Express escaneando el QR de MODO desde la app Galicia. No aplica para pagos con dinero en cuenta.');
ok(dar.tope === 15000 && dar.por === 'month' && dar.debito && dar.credito && dar.emisores.join() === 'visa,master,american_express', 'Galicia: el tope ($15.000 por mes) y las tarjetas salen del texto legal');
const mas = lib.parsearLegalesGalicia('CARTERA DE CONSUMO. Promoción de hasta 12 cuotas sin interés, para compras realizadas en el País. Válida para todos los días, para compras realizadas con Tarjeta Visa y Tarjeta American Express. No aplica para compras realizadas con tarjetas de Credito Visa Business y Tarjetas de Débito.');
ok(mas.tope === null && mas.credito && !mas.debito, 'Galicia: una promo de cuotas no tiene tope, y "no aplica para Tarjetas de Débito" no cuenta como débito');
const gp = lib.normalizarGalicia({ id: 177749, titulo: 'Dar', subtitulo: 'Supermercados', beneficio: '20% de ahorro.', dias: 'Viernes', provincias: ['SANTA FE'], fecha_desde: '2026-08-20', fecha_hasta: '2026-10-31', proximamente: false }, { diasAplicacion: 'Vi', cuotaSinInteresHasta: null, legales: 'Tope de reintegro: $15.000 en total por mes. para compras realizadas con Tarjeta Visa.' }, '2026-10-27', 'x');
ok(gp.pct === 20 && gp.tope === 15000 && JSON.stringify(gp.dias_n) === '[4]' && gp.id === 'galicia:g177749' && gp.fuente === 'galicia' && JSON.stringify(gp.provincias) === '["SANTA FE"]', 'Galicia propio: 20 %, tope 15.000, viernes, sus provincias del catálogo');
const gc = lib.normalizarGalicia({ id: 1, titulo: 'Mas Go', subtitulo: 'Bares', beneficio: 'Hasta 12 cuotas sin interés.', dias: 'Todos los días' }, { diasAplicacion: 'Lu;Ma;Mi;Ju;Vi;Sa;Do', cuotaSinInteresHasta: 12, legales: '' }, '2026-10-27', 'x');
ok(gc.cuotas === 12 && gc.dias_n.length === 0 && gc.pct === null && gc.rubro === 'Gastronomía', 'Galicia propio: 12 cuotas, los 7 días = todos, rubro "Bares" pasa a Gastronomía');
const em = lib.parsearLegalesGalicia('CARTERA DE CONSUMO. Promoción del 25% de ahorro y hasta 3 cuotas sin interés, en compras realizadas en el País, para Clientes Éminent. Sin tope de reintegro. Válida para Viernes, para compras realizadas con Tarjeta Visa.');
ok(em.segmento === 'premium' && em.tope === null, 'Galicia: "para Clientes Éminent" (con tilde) es premium, y "Sin tope de reintegro" no inventa un tope');
ok(lib.rubroDeGalicia('Peluquerías') === 'Salud y Bienestar' && lib.rubroDeGalicia('Educación') === 'Otros', 'Los rubros finos de Galicia se llevan a los de MODO');
ok(lib.claveDup(bb) === lib.claveDup({ ...bb, id: 'otro', fuente: 'modo' }) && lib.claveDup(bb) !== lib.claveDup({ ...bb, pct: 25 }), 'La misma promo vista por MODO y por la web propia tiene la misma clave; otro % es otra promo');

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
