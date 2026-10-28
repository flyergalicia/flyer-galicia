// Prueba de la normalización del Benchmark (Edge Function benchmark-sync), sin
// Supabase: toma las funciones puras del código de la función y las corre con Node.
// Con internet, además baja una página real de cada banco de MODO y revisa que
// todas las promos se puedan leer. Uso: node pruebas/u04_benchmark_normalizar.mjs
import { readFileSync } from 'fs';
import { stripTypeScriptTypes } from 'module';
const src = readFileSync(new URL('../supabase/functions/benchmark-sync/index.ts', import.meta.url), 'utf8');
const ini = src.indexOf('const MODO_RUBROS'), fin = src.indexOf('// Baja y guarda un banco');
const ini2 = src.indexOf('// ── Webs propias'), fin2 = src.indexOf('async function rubroPorMarca');
const ini3 = src.indexOf('// ── Supervielle: la API abierta'), fin3 = src.indexOf('async function jsonCon');
const ini4 = src.indexOf('// ── Santander: su buscador'), fin4 = src.indexOf('const SAN_HEADERS');
const ini5 = src.indexOf('// ── Recordatorio mensual'), fin5 = src.indexOf('async function recordatorioManual');
const js = 'const BANCOS = { galicia: {}, bbva: {}, macro: {}, supervielle: {}, santander: {} };\n' + stripTypeScriptTypes([src.slice(ini, fin), src.slice(ini2, fin2), src.slice(ini3, fin3), src.slice(ini4, fin4), src.slice(ini5, fin5)].join('\n')).replace(/export function/g, 'function');
const lib = new Function(js + '\nreturn { normalizar, segmentoDe, topeDe, cuotasDe, pctDe, diasIdx, diasTexto, modoClave, isoFecha, marcaDeCabecera, diasBbva, normalizarBbva, parsearLegalesGalicia, normalizarGalicia, rubroDeGalicia, claveDup, normalizarSupervielle, marcaSupervielle, rubroSupervielle, normalizarSantander, rubroSantander, resumenManual, topeLegalSupervielle };')();
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
const gpx = lib.normalizarGalicia({ id: 9, titulo: 'Combustible', subtitulo: 'Combustible', beneficio: '25% de ahorro.', dias: 'Martes', fecha_desde: null, fecha_hasta: '2026-11-10', proximamente: true }, { diasAplicacion: 'Ma', fechaDesde: '03/11/2026', legales: 'Tope de reintegro: $20.000 por mes.' }, '2026-10-28', 'x');
ok(gpx.fecha_desde === '2026-11-03' && gpx.proximamente === true && gpx.pct === 25 && gpx.rubro === 'Combustible', 'Galicia: una próxima sin fecha en el listado toma la del detalle (03/11) y queda como próxima');
ok(lib.rubroDeGalicia('Peluquerías') === 'Salud y Bienestar' && lib.rubroDeGalicia('Educación') === 'Otros', 'Los rubros finos de Galicia se llevan a los de MODO');
ok(lib.claveDup(bb) === lib.claveDup({ ...bb, id: 'otro', fuente: 'modo' }) && lib.claveDup(bb) !== lib.claveDup({ ...bb, pct: 25 }), 'La misma promo vista por MODO y por la web propia tiene la misma clave; otro % es otra promo');


// ── Compartidas de MODO, Supervielle y Santander (29-oct) ──
const uno = lib.normalizar({ ...bbva, offer: { ...bbva.offer, requirements: { banks: { list: ['x'] } } } }, 'bbva', '2026-10-27', 'x');
ok(uno.bancos_n === 1 && f.bancos_n === null, 'MODO: exclusiva de un banco = 1; sin la lista de bancos = sin dato');
const comp = lib.normalizar({ ...bbva, offer: { ...bbva.offer, requirements: { banks: { list: ['a', 'b', 'c', 'd', 'e'] } } } }, 'santander', '2026-10-27', 'x');
ok(comp.bancos_n === 5, 'MODO: una promo de "bancos adheridos" guarda cuántos bancos la comparten (5)');
const shell = lib.normalizarSupervielle({ dias: ['domingo'], cuotas: null, rubro: 'Combustible', marca: 'Shell con MODO', esTarjetaCredito: false, esTarjetaDebito: true, tope: 10000, esIdentite: false, descuento: '10%', id: '51009d', fechaVigenciaDesde: '2026-08-01', fechaVigenciaHasta: '2026-10-31' }, () => undefined, '2026-10-28', 'x');
ok(shell.titulo === 'Shell' && shell.pct === 10 && shell.tope === 10000 && shell.dias === 'Domingos' && !shell.credito && shell.debito && shell.rubro === 'Combustible' && shell.fuente === 'supervielle', 'Supervielle: Shell con MODO = Shell, 10 %, tope 10.000, domingos, sólo débito, Combustible');
const sup2 = lib.normalizarSupervielle({ dias: ['lunes', ' martes', ' miércoles', ' jueves', ' viernes', ' sábado', ' domingo'], cuotas: ['3'], rubro: 'Farmacia', marca: 'Farmacia Central', esTarjetaCredito: true, esTarjetaDebito: false, tope: null, esIdentite: true, descuento: '20%', id: 'x1', fechaVigenciaDesde: '2026-10-01', fechaVigenciaHasta: '2026-12-31' }, () => undefined, '2026-10-28', 'x');
ok(sup2.dias_n.length === 0 && sup2.cuotas === 3 && sup2.segmento === 'premium' && sup2.rubro === 'Salud y Bienestar', 'Supervielle: los 7 días (con espacios y tildes) = todos; 3 cuotas; Identité = premium; Farmacia → Salud y Bienestar');
const ypf = lib.normalizarSantander({ startDatePublication: '2026-10-01T00:00:00', endDatePublication: '2026-10-31T00:00:00', id: 7909, monday: false, tuesday: false, wednesday: false, thursday: true, friday: false, saturday: false, sunday: false, fullWeek: false, customerDiscount: 15, topAmount: 20000, interestFreeFees: false, initialQuote: 0, finalQuote: 0,
  legal: 'PARA CLIENTES SUSCRIPTOS AL PROGRAMA SORPRESA SANTANDER. Válido abonando con Tarjeta Santander Visa Débito y Crédito.', additionalText: 'Pagando únicamente a través de la App YPF.', frecuency: { description: 'Mensual' }, tag: { description: 'Sorpresa' },
  brands: [{ id: 546, name: 'YPF' }], categories: [{ description: 'Automotor', code: 'AUT' }, { description: 'Combustible', code: 'COM' }, { description: 'Select', code: 'SEC' }], texts: { title: '15% de ahorro', description: 'Tope de reintegro: $20.000 mensual' } }, '2026-10-28', 'x');
ok(ypf.titulo === 'YPF' && ypf.pct === 15 && ypf.tope === 20000 && ypf.tope_por === 'month' && ypf.dias === 'Jueves' && ypf.rubro === 'Combustible' && ypf.segmento === 'premium' && ypf.credito && ypf.debito && ypf.slug === 'brand:546' && ypf.emisores.includes('visa'), 'Santander: YPF 15 % jueves, tope 20.000 por mes, Combustible (no Automotor), Select = premium, Visa crédito y débito');
ok(lib.rubroSantander([{ description: 'Automotor' }, { description: 'Viajes' }]) === 'Entretenimiento' && lib.rubroSantander([{ description: 'Supermercados' }]) === 'Supermercados', 'Santander: el rubro sale de sus categorías');

const tl1 = lib.topeLegalSupervielle('El beneficio consistirá en un reintegro del 30%. El importe máximo de reintegro será de $30.000 mensual o hasta agotar stock.');
const tl2 = lib.topeLegalSupervielle('Reintegro del 20% con un tope mensual por cuenta de $15.000 (considerando la suma de los consumos).');
const tl3 = lib.topeLegalSupervielle('Beneficio válido los martes. Sin tope de reintegro.');
ok(tl1.tope === 30000 && tl1.por === 'month' && tl2.tope === 15000 && tl2.por === 'month' && tl3.tope === null, 'Supervielle: el tope sale del texto legal ("importe máximo… $30.000 mensual", "tope mensual por cuenta de $15.000"); "Sin tope" no inventa uno');
// ── Recordatorio del día 5 ──
const rm = lib.resumenManual([{ banco: 'santander', titulo: 'YPF', fecha_hasta: '2026-11-03' }, { banco: 'santander', titulo: 'Vieja', fecha_hasta: '2026-10-01' }, { banco: 'macro', titulo: 'Changomas', fecha_hasta: '2026-12-31' }], '2026-11-05');
const rs = rm.find((x) => x.banco === 'santander'), rmc = rm.find((x) => x.banco === 'macro');
ok(rs.total === 2 && rs.vencidas.join() === 'YPF,Vieja' && rmc.total === 1 && !rmc.vencidas.length && rm.length === 5, 'Recordatorio: cuenta por banco las cargadas a mano y las vencidas (los 5 bancos aparecen)');
const rm2 = lib.resumenManual([{ banco: 'macro', titulo: 'Pronto', fecha_hasta: '2026-11-09' }], '2026-11-05');
ok(rm2.find((x) => x.banco === 'macro').porVencer.join() === 'Pronto', 'Recordatorio: avisa las que vencen en los próximos 7 días');

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
