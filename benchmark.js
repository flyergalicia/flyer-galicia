// ══ BENCHMARK ═══════════════════════════════════════════════════════════════
// Galicia contra BBVA, Macro, Supervielle y Santander (promos a nivel persona).
// Este archivo NO se carga al abrir la app: auth.js lo pide con _lib(['ben']) la
// primera vez que alguien abre la solapa (igual que gestiones.js), así que no
// pesa en el armador ni para quien no tiene la facultad. Depende de lo que
// auth.js ya dejó definido: _sb, _admin, _escHtml, _sbTodo, _callEdgeFn,
// FN_URL_BENCH, FLYERS_PUBLIC, _provOpciones, _provSel, _provLista, _provNombre,
// _promoTitulizar, showToast.
//
// Los datos los baja la Edge Function benchmark-sync (migración 039) una vez por
// semana y se leen ya normalizados: acá sólo se filtra, se calcula quién gana y se
// pinta. No toca las tablas de Promociones ni nada del armador.
//
// Quién gana: el que más DEVUELVE en una compra de referencia por rubro
// (min(compra × %, tope)); las cuotas sin interés se comparan aparte. El tope de
// MODO suele ser mensual, así que es "lo que devuelve en esa compra si el tope
// todavía no se gastó".

(function () {
  if (document.getElementById('ben-css')) return;
  var st = document.createElement('style');
  st.id = 'ben-css';
  st.textContent = [
    '.ben-root{max-width:1180px;margin:0 auto;padding:20px 24px 60px;}',
    '.ben-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:10px;}',
    '.ben-top h2{margin:0;font-size:1.25rem;color:var(--ink);}',
    '.ben-top p{margin:3px 0 0;font-size:.8rem;color:var(--gray);max-width:640px;}',
    '.ben-acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}',
    '.ben-fuentes{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px;}',
    '.ben-chip{font-size:.75rem;padding:3px 9px;border-radius:99px;border:1px solid var(--border);background:var(--card);color:var(--ink-2);}',
    '.ben-chip.vieja{border-color:var(--danger,#B3261E);color:var(--danger,#B3261E);}',
    '.ben-chip b{color:var(--ink);}',
    '.ben-filtros{display:flex;gap:10px 14px;flex-wrap:wrap;align-items:flex-end;padding:12px 14px;margin-bottom:14px;}',
    '.ben-f{display:flex;flex-direction:column;gap:3px;font-size:.75rem;color:var(--gray);font-weight:600;}',
    '.ben-f select,.ben-f input{font-size:.85rem;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--field);color:var(--ink);min-width:120px;}',
    '.ben-ref{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;}',
    '.ben-ref input{width:96px;min-width:0;}',
    '.ben-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:14px;flex-wrap:wrap;}',
    '.ben-tab{border:0;background:none;padding:9px 14px;font-size:.85rem;font-weight:700;color:var(--gray);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}',
    '.ben-tab.on{color:var(--ink);border-bottom-color:var(--accent,#F26122);}',
    '.ben-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r-m,12px);box-shadow:var(--sh-1);padding:14px 16px;margin-bottom:14px;}',
    '.ben-card h3{margin:0 0 4px;font-size:.95rem;color:var(--ink);}',
    '.ben-sub{margin:0 0 10px;font-size:.78rem;color:var(--gray);}',
    '.ben-resumen{font-size:.9rem;color:var(--ink);line-height:1.5;}',
    '.ben-resumen b{color:var(--ink);}',
    '.ben-scroll{overflow-x:auto;}',
    'table.ben-t{border-collapse:collapse;width:100%;font-size:.8rem;}',
    'table.ben-t th,table.ben-t td{padding:7px 9px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;}',
    'table.ben-t th{font-size:.75rem;color:var(--gray);font-weight:700;white-space:nowrap;position:sticky;top:0;background:var(--card);}',
    'table.ben-t th.gal,table.ben-t td.gal{background:var(--accent-soft);}',
    '.ben-c{display:flex;flex-direction:column;gap:1px;min-width:118px;}',
    '.ben-c .m{font-weight:700;color:var(--ink);}',
    '.ben-c .d{font-size:.75rem;color:var(--gray);}',
    '.ben-c.gana{border-left:3px solid #2E7D32;padding-left:6px;}',
    '.ben-c.gana .m{color:#2E7D32;}',
    'html.dark .ben-c.gana .m{color:#7BC47F;}',
    '.ben-c.nada{color:var(--gray);font-size:.75rem;}',
    '.ben-logo{width:26px;height:26px;object-fit:contain;border-radius:5px;background:#fff;vertical-align:middle;margin-right:7px;border:1px solid var(--border);}',
    '.ben-marca{display:flex;align-items:center;font-weight:700;color:var(--ink);min-width:160px;}',
    '.ben-bar{display:flex;align-items:center;gap:6px;font-size:.75rem;color:var(--ink-2);}',
    '.ben-bar i{display:block;height:8px;border-radius:4px;background:var(--navy-2,#3A3F47);min-width:2px;}',
    '.ben-bar.gal i{background:var(--accent,#F26122);}',
    '.ben-vacio{padding:34px 14px;text-align:center;color:var(--gray);font-size:.85rem;}',
    '.ben-vacio strong{display:block;color:var(--ink);margin-bottom:4px;}',
    '.ben-aviso{font-size:.78rem;color:var(--gray);margin:8px 0 0;}',
    '.ben-seg{font-size:.75rem;color:var(--gray);}',
    '.ben-pill{display:inline-block;font-size:.75rem;padding:1px 7px;border-radius:99px;margin:0 4px 4px 0;border:1px solid var(--border);color:var(--ink-2);cursor:pointer;background:var(--card);}',
    '.ben-pill.on{background:var(--navy,#1F2328);color:#fff;border-color:var(--navy,#1F2328);}',
    'html.dark .ben-pill.on{background:#EEF1F6;color:#15171A;}',
    '.ben-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;}',
    '.ben-ed{background:var(--card);color:var(--ink);border-radius:var(--r-m,12px);max-width:760px;width:100%;max-height:92vh;overflow:auto;padding:18px;box-shadow:var(--sh-3);}',
    '.ben-ed-g{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '.ben-ed textarea{font-size:.85rem;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--field);color:var(--ink);resize:vertical;font-family:inherit;}',
    '@media (max-width:700px){.ben-ed-g{grid-template-columns:1fr;}}',
    '.ben-lista{margin:6px 0 0;padding-left:18px;font-size:.85rem;color:var(--ink);line-height:1.65;}',
    '.ben-lista li{margin-bottom:4px;}',
    '.ben-up{color:#2E7D32;font-weight:700;}',
    'html.dark .ben-up{color:#7BC47F;}',
    '.ben-down{color:var(--danger,#B3261E);font-weight:700;}',
    '.ben-view{display:block;overflow:auto;height:calc(100vh - 62px - var(--simbar-h,0px));background:var(--paper,var(--light));}',
    '@media (max-width:900px){.ben-view{height:auto;overflow:visible;}.ben-root{padding:14px 14px 40px;}.ben-ref input{width:84px;}}',
  ].join('\n');
  document.head.appendChild(st);
})();

var BEN_BANCOS = [['galicia', 'Galicia'], ['bbva', 'BBVA'], ['macro', 'Macro'], ['supervielle', 'Supervielle'], ['santander', 'Santander'], ['icbc', 'ICBC']];
var BEN_NOM = { galicia: 'Galicia', bbva: 'BBVA', macro: 'Macro', supervielle: 'Supervielle', santander: 'Santander', icbc: 'ICBC' };
var BEN_REF_DEF = { 'Supermercados': 150000, 'Combustible': 60000, 'Salud y Bienestar': 40000, 'Otros': 50000 };
var BEN_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
var BEN_MAX_FILAS = 250; // filas que se dibujan en Cara a cara (más pesa en las PC de sucursal)

var BEN = {
  rows: null, marcas: {}, meta: [], hist: [], cargando: false, error: '',
  vista: 'rubro', vs: 'bbva',
  f: { prov: '', seg: 'todos', tarj: 'todas', rubro: '', q: '', solo2: true, resultado: '' },
  ref: (function () {
    try { var r = JSON.parse(localStorage.getItem('fg_bench_ref') || 'null'); if (r) return Object.assign({}, BEN_REF_DEF, r); } catch (e) { /* sin guardado */ }
    return Object.assign({}, BEN_REF_DEF);
  })(),
  cache: null
};

// ── Utilidades ──────────────────────────────────────────────────────────────
function benE(s) { return _escHtml(s == null ? '' : String(s)); }
function benPlata(n) { return '$' + Math.round(n).toLocaleString('es-AR'); }
function benFecha(iso) {
  if (!iso) return '';
  var solo = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (solo) return (+solo[3]) + '/' + (+solo[2]);
  var d = new Date(iso); if (isNaN(d)) return '';
  return d.getDate() + '/' + (d.getMonth() + 1);
}
function benHoyIso() { var d = new Date(Date.now() - 3 * 3600000); return d.toISOString().slice(0, 10); }
function benRefDe(rubro) { var v = BEN.ref[rubro]; return v > 0 ? v : (BEN.ref['Otros'] > 0 ? BEN.ref['Otros'] : BEN_REF_DEF['Otros']); }

// La misma promo vista por MODO y por la web propia del banco: se cuenta una vez y se queda la de la
// web propia (trae el tope y las condiciones completas). Misma clave que claveDup de la función.
// El nivel (Macro Selecta Nivel 1…4: mismo %, días y tarjetas, distinto tope) también distingue: si no, se juntaban en una sola.
function benClaveDup(r) {
  var niv = /nivel\s*(\d)/i.exec(String(r.segmento_txt || '') + ' ' + String(r.beneficio || ''));
  return [r.banco, r.marca_clave, r.pct == null ? '' : r.pct, r.cuotas || 0, (r.dias_n || []).join(''), r.credito ? 1 : 0, r.debito ? 1 : 0, niv ? niv[1] : ''].join('|');
}
function benDedup(rows) {
  var m = {};
  rows.forEach(function (r) {
    var k = benClaveDup(r), p = m[k];
    if (!p || ((p.fuente || 'modo') === 'modo' && (r.fuente || 'modo') !== 'modo')) m[k] = r;
  });
  return Object.keys(m).map(function (k) { return m[k]; });
}

// Lo que devuelve una promo en una compra de referencia (null = no devuelve plata: sólo cuotas).
function benDevuelve(r) {
  if (!(r.pct > 0) || r.pct >= 100) return null;
  var compra = benRefDe(r.rubro), bruto = compra * r.pct / 100;
  return r.tope > 0 ? Math.min(bruto, r.tope) : bruto;
}
function benTopeTxt(r) {
  if (!(r.tope > 0)) return 'sin tope informado';
  var por = { month: ' por mes', week: ' por semana', day: ' por día', transaction: ' por compra' }[r.tope_por] || '';
  return 'tope ' + benPlata(r.tope) + por;
}
function benSegTxt(r) {
  // beneficio de un paquete (cargado a mano): "Paquete Black+ All · Visa Signature por NFC" -> "Paquete Black+ All"
  var pq = /paquete[^·]*/i.exec(String(r.segmento_txt || ''));
  if (pq) return pq[0].trim().replace(/^./, function (c) { return c.toUpperCase(); });
  if (!r.segmento) return '';
  var t = String(r.segmento_txt || '') + ' ' + String(r.beneficio || ''), niv = /nivel\s*(\d)/i.exec(t);
  var gal = /\b(plus gold|plus|move)\b/i.exec(String(r.segmento_txt || '')); // Galicia: "para clientes Plus Gold"
  if (gal) return gal[1].replace(/\b./g, function (c) { return c.toUpperCase(); });
  if (/selecta/i.test(t)) return 'Selecta' + (niv ? ' Nivel ' + niv[1] : '');
  if (niv) return 'Nivel ' + niv[1];
  var m = /(visa platinum|mastercard platinum|platinum|signature|black|identit[eé]|\bselect\b|[eé]minent|infinite|gold|cl[aá]sica?)/i.exec(t);
  if (m) return m[1].replace(/^./, function (c) { return c.toUpperCase(); }).replace(/identite/i, 'Identité').replace(/eminent/i, 'Éminent');
  return r.segmento === 'premium' ? 'Premium' : 'Clásico/Gold';
}

// ── Carga ───────────────────────────────────────────────────────────────────
function benCargar(cb) {
  if (BEN.cargando) return;
  BEN.cargando = true; BEN.error = '';
  benRender();
  var pend = 5, fallo = null;
  function fin() {
    if (--pend > 0) return;
    BEN.cargando = false;
    if (fallo) { BEN.error = fallo; BEN.rows = BEN.rows || []; }
    else BEN.rows = benDedup((filas || []).concat((BEN.manual || []).map(benManualAFila)));
    BEN.cache = null;
    benRender();
    if (cb) cb();
  }
  var filas = null;
  _sbTodo(function (a, b) { return _sb.from('promos_bench_cache').select('*').order('id').range(a, b); }, function (err, d) {
    if (err) fallo = 'No se pudieron leer las promos del Benchmark. ¿Está aplicada la migración 039?'; else filas = d || [];
    fin();
  });
  _sbTodo(function (a, b) { return _sb.from('promos_bench_marcas').select('*').order('marca_clave').range(a, b); }, function (err, d) {
    var m = {}; (d || []).forEach(function (x) { m[x.marca_clave] = x; }); BEN.marcas = m; fin();
  });
  benTarjCargar(fin);
  benManualCargar(fin);
  _sb.from('promos_bench_meta').select('*').then(function (r) { BEN.meta = (r && r.data) || []; fin(); }, function () { fin(); });
}

// ── Filtros ─────────────────────────────────────────────────────────────────
// Dónde vale una promo: la propia (online = todo el país) o la de su marca; null = no se sabe.
function benProvs(r) {
  if (Array.isArray(r.provincias)) return r.provincias;
  var m = BEN.marcas[r.marca_clave];
  return m && Array.isArray(m.provincias) ? m.provincias : null;
}
// Fecha (AAAA-MM-DD) de dentro de n días, en hora argentina.
function benEnDias(n) { return new Date(Date.now() - 3 * 3600000 + n * 86400000).toISOString().slice(0, 10); }
var BEN_PROX_DIAS = 15; // las que todavía no empezaron entran si empiezan en estos días (decisión del dueño)
function benEmpieza(r) { return r.fecha_desde && r.fecha_desde > benHoyIso() ? 'Empieza el ' + benFecha(r.fecha_desde) : ''; }
function benPasaFiltros(r, hoy) {
  // compartida en MODO (vale con cualquier banco): no diferencia a nadie; se avisa aparte
  if (r.bancos_n > 1) return false;
  if (r.proximamente || (r.fecha_desde && r.fecha_desde > hoy)) { if (!r.fecha_desde || r.fecha_desde > benEnDias(BEN_PROX_DIAS)) return false; }
  if (r.fecha_hasta && r.fecha_hasta < hoy) return false;
  var f = BEN.f;
  if (f.rubro && r.rubro !== f.rubro) return false;
  // Premium puede usar lo premium y lo general; Clásico/Gold, lo clásico y lo general.
  if (f.seg === 'clasico' && r.segmento === 'premium') return false;
  if (f.seg === 'premium' && r.segmento === 'clasico') return false;
  var t = f.tarj;
  if (t === 'credito' && !r.credito) return false;
  if (t === 'debito' && !r.debito) return false;
  if ((t === 'visa' || t === 'master' || t === 'american_express') && r.emisores && r.emisores.length && r.emisores.indexOf(t) < 0) return false;
  if (f.prov) {
    var ps = benProvs(r), sel = _provLista(f.prov);
    // sin dato de lugares: las de MODO no se muestran (igual que en Promociones); las de la web propia del banco
    // (catálogo nacional: Supervielle, BBVA…) se muestran con "Zona sin confirmar"
    if (ps === null) return !!(r.fuente && r.fuente !== 'modo');
    if (ps.length && !sel.some(function (p) { return ps.indexOf(p) >= 0; })) return false;
  }
  return true;
}
function benFiltradas() {
  if (BEN.cache) return BEN.cache;
  var hoy = benHoyIso();
  BEN.cache = (BEN.rows || []).filter(function (r) { return benPasaFiltros(r, hoy); });
  return BEN.cache;
}
function benRubros() {
  var s = {};
  (BEN.rows || []).forEach(function (r) { s[r.rubro] = 1; });
  return Object.keys(s).sort(function (a, b) { return a === 'Otros' ? 1 : b === 'Otros' ? -1 : a.localeCompare(b, 'es'); });
}
function benProvinciasDisp() {
  var s = {};
  Object.keys(BEN.marcas).forEach(function (k) { (BEN.marcas[k].provincias || []).forEach(function (p) { s[p] = 1; }); });
  return Object.keys(s).sort();
}

// La mejor promo de un conjunto: la que más devuelve; sin devolución, la de más cuotas.
function benAcceso(r) { return r.segmento === 'premium' ? 2 : r.segmento === 'clasico' ? 1 : 0; }
function benMejor(lista) {
  var mejor = null, mv = -1;
  lista.forEach(function (r) {
    var v = benDevuelve(r);
    if (v == null) return;
    // empate (ej.: Macro Selecta niveles 2, 3 y 4 devuelven lo mismo): la más accesible y, si no, la de tope más bajo
    var empata = mejor && Math.abs(v - mv) < 1;
    if (v > mv + 0.5 || (empata && (benAcceso(r) < benAcceso(mejor) || (benAcceso(r) === benAcceso(mejor) && (r.tope || Infinity) < (mejor.tope || Infinity))))) { mv = Math.max(v, mv); mejor = r; }
  });
  return mejor ? { r: mejor, v: mv } : null;
}
function benMasCuotas(lista) {
  var mejor = null;
  lista.forEach(function (r) { if (r.cuotas > 0 && (!mejor || r.cuotas > mejor.cuotas)) mejor = r; });
  return mejor;
}
function benAgrupar(lista, clave) {
  var g = {};
  lista.forEach(function (r) { var k = clave(r); (g[k] = g[k] || []).push(r); });
  return g;
}

// ── Pantalla ────────────────────────────────────────────────────────────────
function benInit() {
  if (BEN.rows === null && !BEN.cargando) benCargar(); else benRender();
}
function benRoot() { return document.getElementById('ben-root'); }
function benRender() {
  var root = benRoot(); if (!root) return;
  var h = '<div class="ben-top"><div><h2>Benchmark</h2><p>Galicia contra la competencia, a nivel persona. Todos los bancos salen de MODO; además se leen la web propia de BBVA, Supervielle y Santander (cuando su web lo permite) y el catálogo propio de Galicia (la misma promo no se cuenta dos veces). De Macro y Santander se suman las promos que cargás a mano (sus webs no dejan leerlas solas). Las promos de MODO que valen con cualquier banco no se comparan: se avisan aparte.</p></div>' +
    '<div class="ben-acts">' + (BEN.rows && BEN.rows.length ? '<button class="btn" id="ben-xl" onclick="benExcel()">Descargar Excel</button>' : '') + (_admin ? '<button class="btn" id="ben-act" onclick="benActualizar()">Actualizar ahora</button>' : '') + '</div></div>';
  h += benFuentesHtml();
  if (BEN.cargando && BEN.rows === null) { root.innerHTML = h + '<div class="ben-vacio"><strong>Cargando…</strong>Trayendo las promos de cada banco.</div>'; return; }
  if (BEN.error) { root.innerHTML = h + '<div class="ben-vacio"><strong>' + benE(BEN.error) + '</strong><button class="btn" onclick="BEN.rows=null;benCargar()">Reintentar</button></div>'; return; }
  if (!BEN.rows || !BEN.rows.length) {
    root.innerHTML = h + '<div class="ben-vacio"><strong>Todavía no hay promos de la competencia</strong>' + (_admin ? 'Tocá «Actualizar ahora» para bajarlas por primera vez.' : 'Se actualizan una vez por semana.') + '</div>';
    return;
  }
  h += benFiltrosHtml();
  h += benManualAvisoHtml();
  h += benNotaLugares();
  var tabs = [['rubro', 'Resumen por rubro'], ['marca', 'Cara a cara por marca'], ['semana', 'Semana'], ['versus', 'Galicia vs ' + BEN_NOM[BEN.vs]], ['manual', 'Cargadas a mano'], ['tarjetas', 'Tarjetas y salas VIP']];
  h += '<div class="ben-tabs" role="tablist">' + tabs.map(function (t) {
    return '<button class="ben-tab' + (BEN.vista === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (BEN.vista === t[0]) + '" onclick="benVista(\'' + t[0] + '\')">' + t[1] + '</button>';
  }).join('') + '</div>';
  var body = BEN.vista === 'marca' ? benMarcaHtml() : BEN.vista === 'semana' ? benSemanaHtml() : BEN.vista === 'versus' ? benVersusHtml() : BEN.vista === 'tarjetas' ? benTarjetasHtml() : BEN.vista === 'manual' ? benManualHtml() : benRubroHtml();
  root.innerHTML = h + body;
  var sel = document.getElementById('ben-prov'); if (sel && typeof _provSel === 'function') _provSel(sel);
}
function benFuentesHtml() {
  var meta = {}; (BEN.meta || []).forEach(function (m) { meta[m.banco] = m; });
  var hoy = Date.now();
  // además de MODO, se leen las webs propias; Santander y Macro, una vez por mes por la carga asistida
  var WEB = { bbva: 'bbva_web', galicia: 'galicia_web', supervielle: 'supervielle_web', santander: 'santander_web', macro: 'macro_web' };
  return '<div class="ben-fuentes">' + BEN_BANCOS.map(function (b) {
    var m = meta[b[0]], w = WEB[b[0]] ? meta[WEB[b[0]]] : null;
    var bloqueada = !!(w && /bloquea/i.test(w.error || '')), conWeb = !!(w && w.last_sync_at);
    var mensual = !!(w && conWeb && (/^carga (asistida|mensual)$/.test(w.error || '') || bloqueada)); // Santander y Macro: una vez por mes
    var fechas = [m, conWeb ? w : null].filter(function (x) { return x && x.last_sync_at; }).map(function (x) { return x.last_sync_at; }).sort();
    var err = [m, w].filter(function (x) { return x && x.error && !/bloquea/i.test(x.error) && !/^carga (asistida|mensual)$/.test(x.error); }).map(function (x) { return x.error; })[0];
    var fecha = fechas.length ? benFecha(fechas[0]) : 'sin datos';
    var vieja = !m || !m.last_sync_at || hoy - new Date(fechas[0]).getTime() > (mensual ? 35 : 10) * 86400000;
    var fuente = conWeb ? (mensual ? 'MODO + web propia (carga asistida)' : 'MODO + web propia') : bloqueada ? 'vía MODO · su web se carga una vez por mes (pendiente)' : 'vía MODO';
    var hoyIso = benHoyIso(), nMan = (BEN.manual || []).filter(function (x) { return x.banco === b[0] && (!x.fecha_hasta || x.fecha_hasta >= hoyIso); }).length;
    return '<span class="ben-chip' + (vieja ? ' vieja' : '') + '" title="' + benE(err ? 'Último error: ' + err : fuente) + '"><b>' + b[1] + '</b> · ' + fuente + (nMan ? ' · ' + nMan + (nMan > 1 ? ' cargadas' : ' cargada') + ' a mano' : '') + ' · act. ' + fecha + (err ? ' ⚠' : '') + '</span>';
  }).join('') + '</div>';
}
function benFiltrosHtml() {
  var f = BEN.f;
  function opt(v, t, cur) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + t + '</option>'; }
  var rubros = benRubros();
  var provs = (typeof _provOpciones === 'function') ? _provOpciones(benProvinciasDisp(), f.prov, 'Todas las provincias') : '';
  return '<div class="ben-card ben-filtros">' +
    '<label class="ben-f">Provincia<select id="ben-prov" onchange="benSet(\'prov\',this.value)">' + provs + '</select></label>' +
    '<label class="ben-f">Rubro<select onchange="benSet(\'rubro\',this.value)">' + opt('', 'Todos', f.rubro) + rubros.map(function (r) { return opt(r, r, f.rubro); }).join('') + '</select></label>' +
    '<label class="ben-f">Tarjeta de la persona<select onchange="benSet(\'seg\',this.value)" title="Premium: lo exclusivo de Black, Signature, Platinum, Selecta… y lo general. Clásico/Gold: lo clásico y lo general. Lo que el banco no aclara cuenta como general.">' +
      opt('todos', 'Todas', f.seg) + opt('clasico', 'Clásico / Gold', f.seg) + opt('premium', 'Premium', f.seg) + '</select></label>' +
    '<label class="ben-f">Tipo de tarjeta<select onchange="benSet(\'tarj\',this.value)">' +
      opt('todas', 'Todas', f.tarj) + opt('credito', 'Crédito', f.tarj) + opt('debito', 'Débito', f.tarj) + opt('visa', 'Visa', f.tarj) + opt('master', 'Mastercard', f.tarj) + opt('american_express', 'Amex', f.tarj) + '</select></label>' +
    '<label class="ben-f">Comparar Galicia con<select onchange="benSet(\'vs\',this.value)">' + BEN_BANCOS.filter(function (b) { return b[0] !== 'galicia'; }).map(function (b) { return opt(b[0], b[1], BEN.vs); }).join('') + '</select></label>' +
    '<div class="ben-f">Compra de referencia ($)<div class="ben-ref">' + ['Supermercados', 'Combustible', 'Salud y Bienestar', 'Otros'].map(function (r) {
      return '<label class="ben-f" style="font-weight:500">' + (r === 'Salud y Bienestar' ? 'Farmacia / salud' : r === 'Otros' ? 'Resto' : r) + '<input type="number" min="0" step="1000" value="' + (BEN.ref[r] || 0) + '" onchange="benRef(\'' + r + '\',this.value)"></label>';
    }).join('') + '</div></div></div>';
}
// Con una provincia elegida, las promos sin dato de lugar no se muestran: se avisa cuántas son por banco
// (Macro publica casi todo sin dirección en MODO y casi desaparece).
function benNotaLugares() {
  if (!BEN.f.prov) return '';
  var hoy = benHoyIso(), n = {};
  (BEN.rows || []).forEach(function (r) {
    if (r.proximamente || (r.fecha_hasta && r.fecha_hasta < hoy) || benProvs(r) !== null || (r.fuente && r.fuente !== 'modo')) return;
    n[r.banco] = (n[r.banco] || 0) + 1;
  });
  var t = BEN_BANCOS.filter(function (b) { return n[b[0]]; }).map(function (b) { return b[1] + ' ' + n[b[0]]; });
  return t.length ? '<p class="ben-aviso" style="margin:-6px 0 12px">Con una provincia elegida no se muestran las promos de las que MODO no informa dónde valen (las de las webs propias sin ese dato sí, marcadas «Zona sin confirmar»): ' + t.join(', ') + '. Para verlas, elegí «Todas las provincias».</p>' : '';
}
function benSet(k, v) { if (k === 'vs') BEN.vs = v; else BEN.f[k] = v; BEN.cache = null; benRender(); }
function benVista(v) { BEN.vista = v; benRender(); }
function benRef(r, v) {
  v = Math.max(0, Math.round(Number(v) || 0)); BEN.ref[r] = v;
  try { localStorage.setItem('fg_bench_ref', JSON.stringify(BEN.ref)); } catch (e) { /* sin guardado */ }
  BEN.cache = null; benRender();
}

// Celda de un banco: "devuelve $X · Y%" con sus condiciones.
function benCeldaHtml(m, gana, cuotas) {
  if (!m) return cuotas ? '<div class="ben-c nada">—</div>' : '<div class="ben-c nada">Sin promo</div>';
  var r = m.r;
  return '<div class="ben-c' + (gana ? ' gana' : '') + '"><span class="m">' + benPlata(m.v) + ' <span style="font-weight:500">(' + r.pct + '%)</span></span>' +
    '<span class="d">' + benE(r.titulo) + '</span><span class="d">' + benTopeTxt(r) + ' · ' + benE(r.dias || '') + '</span>' +
    (benSegTxt(r) ? '<span class="ben-seg">Sólo ' + benSegTxt(r) + '</span>' : '') + (benEmpieza(r) ? '<span class="ben-seg">' + benEmpieza(r) + '</span>' : '') + (r.fuente === 'manual' ? '<span class="ben-seg">Cargada a mano</span>' : '') + (BEN.f.prov && benProvs(r) === null ? '<span class="ben-seg">Zona sin confirmar</span>' : '') + '</div>';
}
function benLogo(clave) {
  var m = BEN.marcas[clave];
  return m && m.imagen ? '<img class="ben-logo" loading="lazy" alt="" src="' + benE(typeof _promoLogoSrc === 'function' ? _promoLogoSrc(m.imagen) : FLYERS_PUBLIC + m.imagen) + '">' : '';
}

// La web de BBVA no informa el rubro de sus promos: las de marcas que MODO o Galicia ya conocen lo heredan; el resto queda en «Otros».
function benNotaOtros() {
  var n = (BEN.rows || []).filter(function (r) { return r.banco === 'bbva' && r.fuente === 'bbva' && r.rubro === 'Otros'; }).length;
  return n > 50 ? 'La web de BBVA no informa el rubro de sus promos: ' + n + ' quedan en «Otros» (las marcas que ya estaban en MODO o en Galicia sí lo tienen). «Cara a cara por marca» y «Semana» las comparan igual.' : '';
}

// Las promos de MODO que valen con cualquier banco: no cuentan para ver quién gana, se listan aparte.
function benCompartidasHtml() {
  var hoy = benHoyIso(), lim = benEnDias(BEN_PROX_DIAS), vistas = {}, L = [];
  (BEN.rows || []).forEach(function (r) {
    if (!(r.bancos_n > 1)) return;
    if (r.fecha_hasta && r.fecha_hasta < hoy) return;
    if ((r.proximamente || (r.fecha_desde && r.fecha_desde > hoy)) && (!r.fecha_desde || r.fecha_desde > lim)) return;
    if (BEN.f.rubro && r.rubro !== BEN.f.rubro) return;
    var k = String(r.id).split(':').slice(1).join(':'); // la misma promo aparece una vez por banco
    if (vistas[k]) return;
    vistas[k] = 1; L.push(r);
  });
  if (!L.length) return '';
  L.sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); });
  return '<div class="ben-card"><h3>Con MODO y cualquier banco</h3><p class="ben-sub">Estas promos valen pagando con MODO desde cualquier banco, así que no hacen diferencia y no cuentan para ver quién gana.</p><ul class="ben-lista">' +
    L.slice(0, 8).map(function (r) {
      return '<li><b>' + benE(r.titulo) + '</b>: ' + benE(r.beneficio || (r.pct ? r.pct + '%' : '')) + (r.tope > 0 ? ', ' + benTopeTxt(r) : '') + (r.dias ? ' · ' + benE(r.dias) : '') + (benEmpieza(r) ? ' · ' + benEmpieza(r) : '') + '</li>';
    }).join('') + '</ul>' + (L.length > 8 ? '<p class="ben-sub">Y ' + (L.length - 8) + ' más.</p>' : '') + '</div>';
}

// ── Vista 1: resumen por rubro ──────────────────────────────────────────────
function benRubroHtml() {
  var lista = benFiltradas();
  if (!lista.length) return '<div class="ben-vacio"><strong>Sin promos con estos filtros</strong>Probá con otra provincia o tarjeta.</div>';
  var porRubro = benAgrupar(lista, function (r) { return r.rubro; });
  var rubros = Object.keys(porRubro).sort(function (a, b) { return porRubro[b].length - porRubro[a].length; });
  var ganaG = 0, ganaV = 0, empate = 0, comp = 0;
  var filas = rubros.map(function (ru) {
    var por = benAgrupar(porRubro[ru], function (r) { return r.banco; });
    var mej = {}, max = 0;
    BEN_BANCOS.forEach(function (b) { mej[b[0]] = benMejor(por[b[0]] || []); if (mej[b[0]] && mej[b[0]].v > max) max = mej[b[0]].v; });
    var g = mej.galicia, v = mej[BEN.vs];
    if (g && v) { comp++; if (Math.abs(g.v - v.v) < 1) empate++; else if (g.v > v.v) ganaG++; else ganaV++; }
    var cu = {}; BEN_BANCOS.forEach(function (b) { cu[b[0]] = benMasCuotas(por[b[0]] || []); });
    return '<tr><td><strong>' + benE(ru) + '</strong><div class="ben-seg">compra de ' + benPlata(benRefDe(ru)) + '</div></td>' +
      BEN_BANCOS.map(function (b) {
        var n = (por[b[0]] || []).length, m = mej[b[0]];
        return '<td class="' + (b[0] === 'galicia' ? 'gal' : '') + '">' + benCeldaHtml(m, m && max > 0 && m.v >= max - 0.5) +
          '<div class="ben-seg">' + n + ' promo' + (n === 1 ? '' : 's') + '</div></td>';
      }).join('') + '</tr>' +
      '<tr><td class="ben-seg" style="border-bottom:2px solid var(--border)">Más cuotas sin interés</td>' + BEN_BANCOS.map(function (b) {
        var c = cu[b[0]], mx = Math.max.apply(null, BEN_BANCOS.map(function (x) { return cu[x[0]] ? cu[x[0]].cuotas : 0; }));
        return '<td class="' + (b[0] === 'galicia' ? 'gal' : '') + '" style="border-bottom:2px solid var(--border)">' + (c ?
          '<div class="ben-c' + (c.cuotas >= mx ? ' gana' : '') + '"><span class="m">' + c.cuotas + ' cuotas</span><span class="d">' + benE(c.titulo) + '</span></div>' : '<div class="ben-c nada">—</div>') + '</td>';
      }).join('') + '</tr>';
  }).join('');
  var resumen = comp ? 'Contra <b>' + BEN_NOM[BEN.vs] + '</b>, en ' + comp + ' rubros con promos de los dos: Galicia devuelve más en <b>' + ganaG + '</b>, ' + BEN_NOM[BEN.vs] + ' en <b>' + ganaV + '</b>' + (empate ? ' y empatan en ' + empate : '') + '.' : 'No hay rubros con promos de Galicia y ' + BEN_NOM[BEN.vs] + ' al mismo tiempo con estos filtros.';
  var max = Math.max.apply(null, BEN_BANCOS.map(function (b) { return lista.filter(function (r) { return r.banco === b[0]; }).length; })) || 1;
  var barras = BEN_BANCOS.map(function (b) {
    var n = lista.filter(function (r) { return r.banco === b[0]; }).length;
    return '<div class="ben-bar' + (b[0] === 'galicia' ? ' gal' : '') + '"><span style="width:92px">' + b[1] + '</span><i style="width:' + Math.max(2, Math.round(n / max * 260)) + 'px"></i> ' + n + '</div>';
  }).join('');
  return '<div class="ben-card"><div class="ben-resumen">' + resumen + '</div><p class="ben-aviso">Gana el que más devuelve en la compra de referencia (verde). Ojo: de Macro y Santander se ve lo de MODO y lo cargado a mano; pueden tener más promos propias que no se ven acá. ' + benNotaOtros() + '</p></div>' + benCompartidasHtml() +
    '<div class="ben-card"><h3>Promos vigentes por banco</h3>' + barras + '</div>' +
    '<div class="ben-card ben-scroll"><table class="ben-t"><thead><tr><th>Rubro</th>' + BEN_BANCOS.map(function (b) { return '<th class="' + (b[0] === 'galicia' ? 'gal' : '') + '">' + b[1] + '</th>'; }).join('') + '</tr></thead><tbody>' + filas + '</tbody></table></div>';
}

// ── Vista 2: cara a cara por marca ──────────────────────────────────────────
function benMarcaHtml() {
  var lista = benFiltradas();
  var porMarca = benAgrupar(lista.filter(function (r) { return r.marca_clave; }), function (r) { return r.marca_clave; });
  var q = String(BEN.f.q || '').toLowerCase();
  var filas = [];
  Object.keys(porMarca).forEach(function (k) {
    var grupo = porMarca[k], por = benAgrupar(grupo, function (r) { return r.banco; });
    var nombre = grupo[0].titulo;
    if (q && nombre.toLowerCase().indexOf(q) < 0) return;
    var mej = {}, max = 0, cuenta = 0;
    BEN_BANCOS.forEach(function (b) { var m = benMejor(por[b[0]] || []); mej[b[0]] = m; if (m) { cuenta++; if (m.v > max) max = m.v; } });
    if (BEN.f.solo2 && !(mej.galicia && mej[BEN.vs]) && !(cuenta >= 2 && (mej.galicia || mej[BEN.vs]))) return;
    var resultado = !mej.galicia ? 'sin' : !mej[BEN.vs] ? 'solo' : Math.abs(mej.galicia.v - mej[BEN.vs].v) < 1 ? 'empate' : mej.galicia.v > mej[BEN.vs].v ? 'gana' : 'pierde';
    if (BEN.f.resultado && BEN.f.resultado !== resultado) return;
    filas.push({ k: k, nombre: nombre, mej: mej, max: max, resultado: resultado, por: por });
  });
  var peso = { pierde: 0, gana: 1, empate: 2, solo: 3, sin: 4 };
  filas.sort(function (a, b) { return peso[a.resultado] - peso[b.resultado] || b.max - a.max; });
  var cont = { gana: 0, pierde: 0, empate: 0 };
  filas.forEach(function (f) { if (cont[f.resultado] != null) cont[f.resultado]++; });
  var chips = [['', 'Todas'], ['gana', 'Ganamos (' + cont.gana + ')'], ['pierde', 'Perdemos (' + cont.pierde + ')'], ['empate', 'Empatamos (' + cont.empate + ')']].map(function (c) {
    return '<span class="ben-pill' + (BEN.f.resultado === c[0] ? ' on' : '') + '" onclick="benSet(\'resultado\',\'' + c[0] + '\')">' + c[1] + '</span>';
  }).join('');
  var etiqueta = { gana: 'Galicia gana', pierde: BEN_NOM[BEN.vs] + ' gana', empate: 'Empate', solo: 'Sólo Galicia', sin: '' };
  var corte = filas.slice(0, BEN_MAX_FILAS);
  var cuerpo = corte.map(function (f) {
    return '<tr><td><div class="ben-marca">' + benLogo(f.k) + benE(f.nombre) + '</div><div class="ben-seg">' + benE(etiqueta[f.resultado] || '') + '</div></td>' +
      BEN_BANCOS.map(function (b) {
        var m = f.mej[b[0]];
        return '<td class="' + (b[0] === 'galicia' ? 'gal' : '') + '">' + benCeldaHtml(m, m && f.max > 0 && m.v >= f.max - 0.5) + '</td>';
      }).join('') + '</tr>';
  }).join('');
  return '<div class="ben-card"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><input type="search" placeholder="Buscar una marca…" value="' + benE(BEN.f.q) + '" oninput="benBuscar(this.value)" style="font-size:.85rem;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--field);color:var(--ink)">' +
    '<label style="font-size:.8rem;color:var(--ink-2)"><input type="checkbox" ' + (BEN.f.solo2 ? 'checked' : '') + ' onchange="benSet(\'solo2\',this.checked)"> Sólo marcas donde se puede comparar</label></div>' +
    '<div style="margin-top:8px">' + chips + '</div></div>' +
    (filas.length ? '<div class="ben-card ben-scroll"><table class="ben-t"><thead><tr><th>Marca</th>' + BEN_BANCOS.map(function (b) { return '<th class="' + (b[0] === 'galicia' ? 'gal' : '') + '">' + b[1] + '</th>'; }).join('') + '</tr></thead><tbody>' + cuerpo + '</tbody></table>' +
      (filas.length > corte.length ? '<p class="ben-aviso">Se muestran las primeras ' + corte.length + ' de ' + filas.length + ' marcas. Filtrá por rubro, provincia o buscá una marca para ver el resto.</p>' : '') + '</div>' :
      '<div class="ben-vacio"><strong>No hay marcas para comparar con estos filtros</strong>Probá sacando «Sólo marcas donde se puede comparar» o cambiando de rubro o provincia.</div>');
}
var _benT = 0;
function benBuscar(v) {
  BEN.f.q = v; clearTimeout(_benT);
  _benT = setTimeout(function () {
    var root = benRoot(), pos = root && root.querySelector('input[type=search]');
    var sel = pos ? pos.selectionStart : 0;
    benRender();
    var n = benRoot() && benRoot().querySelector('input[type=search]');
    if (n) { n.focus(); try { n.setSelectionRange(sel, sel); } catch (e) { /* sin selección */ } }
  }, 180);
}

// ── Vista 3: semana ─────────────────────────────────────────────────────────
function benSemanaHtml() {
  var lista = benFiltradas();
  if (!lista.length) return '<div class="ben-vacio"><strong>Sin promos con estos filtros</strong></div>';
  var porBanco = benAgrupar(lista, function (r) { return r.banco; });
  var hdr = '<tr><th>Día</th>' + BEN_BANCOS.map(function (b) { return '<th class="' + (b[0] === 'galicia' ? 'gal' : '') + '">' + b[1] + '</th>'; }).join('') + '</tr>';
  var cuerpo = BEN_DIAS.map(function (dia, i) {
    var mej = {}, max = 0;
    BEN_BANCOS.forEach(function (b) {
      var delDia = (porBanco[b[0]] || []).filter(function (r) { return !r.dias_n || !r.dias_n.length || r.dias_n.indexOf(i) >= 0; });
      mej[b[0]] = benMejor(delDia);
      if (mej[b[0]] && mej[b[0]].v > max) max = mej[b[0]].v;
    });
    return '<tr><td><strong>' + dia + '</strong></td>' + BEN_BANCOS.map(function (b) {
      var m = mej[b[0]];
      return '<td class="' + (b[0] === 'galicia' ? 'gal' : '') + '">' + benCeldaHtml(m, m && max > 0 && m.v >= max - 0.5) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="ben-card"><h3>La mejor promo de cada banco, día por día</h3><p class="ben-sub">Con los filtros de arriba. Conviene elegir un rubro (por ejemplo Supermercados) para que la compra de referencia sea la misma en toda la tabla.</p></div>' +
    '<div class="ben-card ben-scroll"><table class="ben-t"><thead>' + hdr + '</thead><tbody>' + cuerpo + '</tbody></table></div>';
}


// ── Vista 4: Galicia contra un banco, en palabras ───────────────────────────
function benLinea(m) {
  var r = m.r;
  return benPlata(m.v) + ' (' + r.pct + ' %' + (r.tope > 0 ? ', ' + benTopeTxt(r) : ', sin tope informado') + (r.dias && r.dias !== 'Todos los días' ? ', ' + benE(r.dias.toLowerCase()) : '') + (benEmpieza(r) ? ', ' + benEmpieza(r).toLowerCase() : '') + ')';
}
function benVersusHtml() {
  var lista = benFiltradas();
  if (!lista.length) return '<div class="ben-vacio"><strong>Sin promos con estos filtros</strong></div>';
  var vs = BEN.vs, NV = BEN_NOM[vs];
  var G = lista.filter(function (r) { return r.banco === 'galicia'; }), V = lista.filter(function (r) { return r.banco === vs; });
  var rub = benAgrupar(lista, function (r) { return r.rubro; }), rubros = [];
  Object.keys(rub).forEach(function (ru) {
    var g = rub[ru].filter(function (r) { return r.banco === 'galicia'; }), v = rub[ru].filter(function (r) { return r.banco === vs; });
    rubros.push({ ru: ru, mg: benMejor(g), mv: benMejor(v), cg: benMasCuotas(g), cv: benMasCuotas(v), ng: g.length, nv: v.length });
  });
  var mar = benAgrupar(lista.filter(function (r) { return r.marca_clave; }), function (r) { return r.marca_clave; }), marcas = [];
  Object.keys(mar).forEach(function (k) {
    var g = benMejor(mar[k].filter(function (r) { return r.banco === 'galicia'; })), v = benMejor(mar[k].filter(function (r) { return r.banco === vs; }));
    if (g && v) marcas.push({ nombre: mar[k][0].titulo, g: g, v: v, dif: g.v - v.v });
  });
  var gana = marcas.filter(function (x) { return x.dif >= 1; }).sort(function (a, b) { return b.dif - a.dif; });
  var pierde = marcas.filter(function (x) { return x.dif <= -1; }).sort(function (a, b) { return a.dif - b.dif; });
  var empata = marcas.length - gana.length - pierde.length;
  var rubG = rubros.filter(function (x) { return x.mg && x.mv && x.mg.v - x.mv.v >= 1; }), rubV = rubros.filter(function (x) { return x.mg && x.mv && x.mv.v - x.mg.v >= 1; });
  var h = '<div class="ben-card"><h3>Galicia vs ' + NV + '</h3><div class="ben-resumen">Con los filtros de arriba, Galicia tiene <b>' + G.length + '</b> promos y ' + NV + ' <b>' + V.length + '</b>. ' +
    (marcas.length ? 'En las <b>' + marcas.length + '</b> marcas que tienen las dos, Galicia devuelve más en <b>' + gana.length + '</b>, ' + NV + ' en <b>' + pierde.length + '</b>' + (empata ? ' y empatan en ' + empata : '') + '. ' : 'No hay marcas con promo de los dos bancos a la vez. ') +
    (rubG.length + rubV.length ? 'Por rubro, Galicia gana en <b>' + rubG.length + '</b> y ' + NV + ' en <b>' + rubV.length + '</b>.' : '') + '</div></div>';
  function item(x) {
    return '<li><b>' + benE(x.nombre) + '</b>: Galicia devuelve ' + benLinea(x.g) + ' contra ' + benLinea(x.v) + ' de ' + NV + '.</li>';
  }
  h += '<div class="ben-card"><h3>Dónde somos fuertes</h3>' + (gana.length ? '<ul class="ben-lista">' + gana.slice(0, 6).map(item).join('') + '</ul>' + (gana.length > 6 ? '<p class="ben-sub">Y ' + (gana.length - 6) + ' marcas más. Están todas en «Cara a cara por marca».</p>' : '') : '<p class="ben-sub">Con estos filtros no hay una marca donde Galicia devuelva más.</p>') + '</div>';
  h += '<div class="ben-card"><h3>Dónde nos ganan</h3>' + (pierde.length ? '<ul class="ben-lista">' + pierde.slice(0, 6).map(item).join('') + '</ul>' + (pierde.length > 6 ? '<p class="ben-sub">Y ' + (pierde.length - 6) + ' marcas más.</p>' : '') : '<p class="ben-sub">Con estos filtros no hay una marca donde ' + NV + ' devuelva más.</p>') + '</div>';
  var porRubro = rubros.filter(function (x) { return x.mg || x.mv; }).map(function (x) {
    var c = benPlata(benRefDe(x.ru));
    if (x.mg && x.mv) return '<li><b>' + benE(x.ru) + '</b> (compra de ' + c + '): ' + (Math.abs(x.mg.v - x.mv.v) < 1 ? 'empatan' : x.mg.v > x.mv.v ? '<span class="ben-up">gana Galicia</span>' : '<span class="ben-down">gana ' + NV + '</span>') + ' · Galicia ' + benPlata(x.mg.v) + ' (' + benE(x.mg.r.titulo) + ') contra ' + NV + ' ' + benPlata(x.mv.v) + ' (' + benE(x.mv.r.titulo) + ').</li>';
    return '<li><b>' + benE(x.ru) + '</b>: sólo ' + (x.mg ? 'Galicia' : NV) + ' tiene promos con reintegro en este rubro (' + benPlata((x.mg || x.mv).v) + ' en una compra de ' + c + ').</li>';
  });
  h += '<div class="ben-card"><h3>Rubro por rubro</h3>' + (porRubro.length ? '<ul class="ben-lista">' + porRubro.join('') + '</ul>' : '<p class="ben-sub">Sin rubros con reintegro.</p>') + '</div>';
  var cuotas = rubros.filter(function (x) { return x.cg || x.cv; }).map(function (x) {
    var g = x.cg ? x.cg.cuotas + ' cuotas (' + benE(x.cg.titulo) + ')' : 'ninguna', v = x.cv ? x.cv.cuotas + ' cuotas (' + benE(x.cv.titulo) + ')' : 'ninguna';
    var q = (x.cg ? x.cg.cuotas : 0) - (x.cv ? x.cv.cuotas : 0);
    return '<li><b>' + benE(x.ru) + '</b>: Galicia ' + g + ', ' + NV + ' ' + v + (q > 0 ? ' · <span class="ben-up">más cuotas Galicia</span>' : q < 0 ? ' · <span class="ben-down">más cuotas ' + NV + '</span>' : '') + '</li>';
  });
  h += '<div class="ben-card"><h3>Cuotas sin interés</h3>' + (cuotas.length ? '<ul class="ben-lista">' + cuotas.join('') + '</ul>' : '<p class="ben-sub">Sin promos de cuotas con estos filtros.</p>') + '</div>';
  h += '<p class="ben-aviso">Es un borrador armado con los datos de hoy y la compra de referencia de arriba: sirve para preparar la charla, no para repetirlo tal cual. Los topes de MODO suelen ser mensuales y no se consideran gastados. Antes de mostrarle algo a un cliente, conviene revisar la promo en la web del banco. ' + benNotaOtros() + '</p>' + benCompartidasHtml();
  return h;
}

// ── Vista 6: tarjetas premium y salas VIP (cargadas a mano, las edita el admin) ──
function benOrdBanco(b) { for (var i = 0; i < BEN_BANCOS.length; i++) if (BEN_BANCOS[i][0] === b) return i; return 99; }
function benUrlOk(u) { return /^https:\/\//i.test(String(u || '')); }
function benTarjOrdenadas() {
  return (BEN.tarj || []).slice().sort(function (a, b) { return benOrdBanco(a.banco) - benOrdBanco(b.banco) || (a.orden || 0) - (b.orden || 0); });
}
// "desde el 18/11/2026" en la vigencia o en el detalle: cambios que todavía no rigen
function benTarjCambios() {
  var hoy = benHoyIso(), out = [];
  (BEN.tarj || []).forEach(function (t) {
    var txt = [t.vigencia, t.salas_vip, t.notas].join(' '), re = /desde el (\d{1,2})\/(\d{1,2})\/(\d{4})/gi, m;
    while ((m = re.exec(txt))) {
      var iso = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      if (iso > hoy) { out.push({ t: t, fecha: m[1] + '/' + m[2] + '/' + m[3] }); break; }
    }
  });
  return out;
}
function benTarjetasHtml() {
  var L = benTarjOrdenadas();
  var h = '<div class="ben-card"><h3>Tarjetas premium y salas VIP</h3><p class="ben-sub">Cargado a mano desde las páginas oficiales de cada banco. Estas condiciones cambian seguido: mirá la vigencia y la fecha de revisión de cada fila antes de usarlas con un cliente.' +
    (_admin ? ' Vos podés corregir cada fila y agregar tarjetas.' : '') + '</p>' + (_admin && !BEN.tarjError ? '<button class="btn" onclick="benTarjEditar(\'\')">+ Agregar tarjeta</button>' : '') + '</div>';
  if (BEN.tarjError) return h + '<div class="ben-vacio"><strong>No se pudo leer la tabla de tarjetas</strong>¿Está aplicada la migración 042? <button class="btn" onclick="BEN.rows=null;benCargar()">Reintentar</button></div>';
  if (!L.length) return h + '<div class="ben-vacio"><strong>Todavía no hay tarjetas cargadas</strong>' + (_admin ? 'Agregá la primera con «+ Agregar tarjeta».' : 'El administrador las va a cargar.') + '</div>';
  var cam = benTarjCambios();
  if (cam.length) {
    h += '<div class="ben-card"><h3>Cambios anunciados</h3><ul class="ben-lista">' + cam.map(function (c) {
      return '<li><b>' + benE(BEN_NOM[c.t.banco] || c.t.banco) + ' · ' + benE(c.t.tarjeta) + '</b>: cambia el ' + c.fecha + '. ' + benE(c.t.vigencia || '') + '</li>';
    }).join('') + '</ul></div>';
  }
  var max = Math.max.apply(null, L.map(function (t) { return t.pases_anio || 0; })) || 1;
  var top = L.filter(function (t) { return t.pases_anio > 0; }).sort(function (a, b) { return b.pases_anio - a.pases_anio; }).slice(0, 3);
  var gal = L.filter(function (t) { return t.banco === 'galicia' && t.pases_anio > 0; }).sort(function (a, b) { return b.pases_anio - a.pases_anio; })[0];
  h += '<div class="ben-card"><h3>Pases a salas VIP por año (titular)</h3>' +
    (top.length ? '<div class="ben-resumen" style="margin-bottom:8px">Los que más dan: ' + top.map(function (t) { return '<b>' + benE(BEN_NOM[t.banco] || t.banco) + ' ' + benE(t.paquete || t.tarjeta) + '</b> (' + t.pases_anio + ')'; }).join(', ') + '.' +
      (gal ? ' La de Galicia con más pases es <b>' + benE(gal.tarjeta) + '</b> (' + gal.pases_anio + ').' : '') + '</div>' : '') +
    L.map(function (t) {
      var n = t.pases_anio;
      return '<div class="ben-bar' + (t.banco === 'galicia' ? ' gal' : '') + '"><span style="width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + benE((BEN_NOM[t.banco] || t.banco) + ' ' + t.tarjeta + ' ' + t.paquete) + '">' + benE(BEN_NOM[t.banco] || t.banco) + ' · ' + benE(t.tarjeta) + (t.paquete ? ' (' + benE(t.paquete) + ')' : '') + '</span>' +
        (n > 0 ? '<i style="width:' + Math.max(3, Math.round(n / max * 240)) + 'px"></i> ' + n : '<span class="ben-seg">sin dato</span>') + '</div>';
    }).join('') + '<p class="ben-aviso">Las bajas de pases ya anunciadas (por ejemplo Macro desde el 18/11/2026) figuran en «Cambios anunciados» y en el detalle de cada fila.</p></div>';
  var conf = { oficial: 'Página del banco', nota: 'Nota de prensa o blog', sin_dato: 'Sin dato firme' };
  h += '<div class="ben-card ben-scroll"><table class="ben-t"><thead><tr><th>Tarjeta</th><th>Salas VIP</th><th>Fast Pass y parking</th><th>Acompañantes y adicionales</th><th>Seguros</th><th>Millas y puntos</th><th>Costo</th><th>Fuente</th>' + (_admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
    L.map(function (t) {
      var fp = [t.fast_pass, t.parking].filter(function (x) { return x; }).join(' ');
      return '<tr class="' + (t.banco === 'galicia' ? 'gal' : '') + '"><td class="' + (t.banco === 'galicia' ? 'gal' : '') + '"><b>' + benE(BEN_NOM[t.banco] || t.banco) + '</b><div>' + benE(t.tarjeta) + '</div>' + (t.paquete ? '<div class="ben-seg">' + benE(t.paquete) + '</div>' : '') + '</td>' +
        '<td style="min-width:220px">' + benE(t.salas_vip) + (t.vigencia ? '<div class="ben-seg">' + benE(t.vigencia) + '</div>' : '') + '</td>' +
        '<td style="min-width:170px">' + benE(fp) + '</td><td style="min-width:200px">' + benE(t.acompanantes) + '</td><td style="min-width:230px">' + benE(t.seguros) + '</td>' +
        '<td style="min-width:150px">' + benE(t.puntos) + '</td><td style="min-width:200px">' + benE(t.costo) + '</td>' +
        '<td style="min-width:150px">' + (benUrlOk(t.fuente_url) ? '<a href="' + benE(t.fuente_url) + '" target="_blank" rel="noopener noreferrer">Ver página</a>' : '') +
        '<div class="ben-seg">' + benE(conf[t.confianza] || '') + (t.revisada ? ' · revisada ' + benFecha(t.revisada) : '') + '</div>' + (t.notas ? '<div class="ben-seg">' + benE(t.notas) + '</div>' : '') + '</td>' +
        (_admin ? '<td style="white-space:nowrap"><button class="btn" onclick="benTarjEditar(\'' + benE(t.id) + '\')">Editar</button> <button class="btn" onclick="benTarjBorrar(\'' + benE(t.id) + '\')">Quitar</button></td>' : '') + '</tr>';
    }).join('') + '</tbody></table></div>';
  return h;
}
function benTarjCargar(cb) {
  _sb.from('promos_bench_tarjetas').select('*').then(function (r) {
    if (r && r.error) { BEN.tarjError = true; BEN.tarj = []; } else { BEN.tarjError = false; BEN.tarj = (r && r.data) || []; }
    if (cb) cb();
  }, function () { BEN.tarjError = true; BEN.tarj = []; if (cb) cb(); });
}
// ── edición (sólo admin; la base también lo exige) ──
var BEN_CAMPOS = [
  ['tarjeta', 'Tarjeta', 'text'], ['paquete', 'Paquete o programa', 'text'], ['pases_anio', 'Pases a salas VIP por año (titular)', 'number'], ['orden', 'Orden dentro del banco', 'number'],
  ['salas_vip', 'Salas VIP (detalle)', 'area'], ['fast_pass', 'Fast Pass', 'area'], ['acompanantes', 'Acompañantes y adicionales', 'area'], ['parking', 'Parking', 'area'],
  ['seguros', 'Seguros y asistencia', 'area'], ['puntos', 'Millas y puntos', 'area'], ['costo', 'Costo y cómo bonificarlo', 'area'], ['vigencia', 'Vigencia o cambios anunciados', 'text'],
  ['fuente_url', 'Dirección de la página (https://…)', 'text'], ['notas', 'Notas', 'area']
];
function benTarjEditar(id) {
  if (!_admin) return;
  var t = id ? (BEN.tarj || []).filter(function (x) { return x.id === id; })[0] : null;
  if (id && !t) return;
  t = t || { banco: 'galicia', tarjeta: '', paquete: '', orden: 0, confianza: 'oficial' };
  var viejo = document.getElementById('ben-ed-ov'); if (viejo) viejo.remove();
  var campos = BEN_CAMPOS.map(function (c) {
    var v = t[c[0]] == null ? '' : t[c[0]];
    var ctl = c[2] === 'area' ? '<textarea id="ben-f-' + c[0] + '" rows="2" style="width:100%">' + benE(v) + '</textarea>' :
      '<input id="ben-f-' + c[0] + '" type="' + c[2] + '" value="' + benE(v) + '" style="width:100%">';
    return '<label class="ben-f" style="grid-column:' + (c[2] === 'area' || c[0] === 'fuente_url' || c[0] === 'vigencia' ? '1 / -1' : 'auto') + '">' + c[1] + ctl + '</label>';
  }).join('');
  var ov = document.createElement('div');
  ov.id = 'ben-ed-ov'; ov.className = 'ben-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = '<div class="ben-ed"><h3 style="margin:0 0 10px">' + (id ? 'Editar tarjeta' : 'Agregar tarjeta') + '</h3><div class="ben-ed-g">' +
    '<label class="ben-f">Banco<select id="ben-f-banco">' + BEN_BANCOS.map(function (b) { return '<option value="' + b[0] + '"' + (t.banco === b[0] ? ' selected' : '') + '>' + b[1] + '</option>'; }).join('') + '</select></label>' +
    '<label class="ben-f">De dónde sale<select id="ben-f-confianza"><option value="oficial"' + (t.confianza === 'oficial' ? ' selected' : '') + '>Página del banco</option><option value="nota"' + (t.confianza === 'nota' ? ' selected' : '') + '>Nota de prensa o blog</option><option value="sin_dato"' + (t.confianza === 'sin_dato' ? ' selected' : '') + '>Sin dato firme</option></select></label>' +
    campos + '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" onclick="benTarjCerrar()">Cancelar</button><button class="btn" id="ben-ed-ok" onclick="benTarjGuardar(\'' + benE(id || '') + '\')">Guardar</button></div></div>';
  ov.addEventListener('mousedown', function (e) { if (e.target === ov) benTarjCerrar(); });
  document.body.appendChild(ov);
  var p = document.getElementById('ben-f-tarjeta'); if (p) p.focus();
}
function benTarjCerrar() { var o = document.getElementById('ben-ed-ov'); if (o) o.remove(); }
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('ben-ed-ov')) benTarjCerrar(); });
function benTarjGuardar(id) {
  var g = function (k) { var el = document.getElementById('ben-f-' + k); return el ? el.value.trim() : ''; };
  var o = { banco: g('banco'), confianza: g('confianza') };
  BEN_CAMPOS.forEach(function (c) { o[c[0]] = g(c[0]); });
  if (!o.tarjeta) { showToast('Falta el nombre de la tarjeta.'); return; }
  if (o.fuente_url && !benUrlOk(o.fuente_url)) { showToast('La dirección de la página tiene que empezar con https://'); return; }
  o.pases_anio = o.pases_anio === '' ? null : Math.max(0, Math.round(Number(o.pases_anio)));
  if (o.pases_anio !== null && isNaN(o.pases_anio)) { showToast('Los pases tienen que ser un número.'); return; }
  o.orden = Math.round(Number(o.orden)) || 0;
  o.revisada = benHoyIso(); // al guardar queda como revisada hoy
  var btn = document.getElementById('ben-ed-ok'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  var q = id ? _sb.from('promos_bench_tarjetas').update(o).eq('id', id) : _sb.from('promos_bench_tarjetas').insert(o);
  q.then(function (r) {
    if (r && r.error) { if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } showToast('No se pudo guardar: ' + (r.error.message || 'error')); return; }
    benTarjCerrar(); showToast('Guardado.'); benTarjCargar(benRender);
  }, function () { if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } showToast('No se pudo guardar. Revisá la conexión.'); });
}
function benTarjBorrar(id) {
  if (!_admin) return;
  var t = (BEN.tarj || []).filter(function (x) { return x.id === id; })[0]; if (!t) return;
  fgConfirm('¿Quitar «' + t.tarjeta + '» de ' + (BEN_NOM[t.banco] || t.banco) + '?\nSe borra de la tabla. No se puede deshacer.', { ok: 'Quitar' }).then(function (ok) {
    if (!ok) return;
    _sb.from('promos_bench_tarjetas').delete().eq('id', id).then(function (r) {
      if (r && r.error) { showToast('No se pudo quitar: ' + (r.error.message || 'error')); return; }
      benTarjCargar(benRender);
    }, function () { showToast('No se pudo quitar. Revisá la conexión.'); });
  });
}

// ── Excel (para el que mira la solapa; sale con los filtros y las compras de referencia de la pantalla) ──
function benDatosPorRubro() {
  var lista = benFiltradas(), por = benAgrupar(lista, function (r) { return r.rubro; }), out = [];
  Object.keys(por).sort().forEach(function (ru) {
    var pb = benAgrupar(por[ru], function (r) { return r.banco; });
    BEN_BANCOS.forEach(function (b) {
      var l = pb[b[0]] || [], m = benMejor(l), c = benMasCuotas(l);
      out.push({ rubro: ru, compra: benRefDe(ru), banco: b[1], promos: l.length, devuelve: m ? m.v : null, pct: m ? m.r.pct : null, marca: m ? m.r.titulo : '', tope: m && m.r.tope > 0 ? m.r.tope : null, dias: m ? m.r.dias : '', cuotas: c ? c.cuotas : null, marcaCuotas: c ? c.titulo : '' });
    });
  });
  return out;
}
function benDatosPorMarca() {
  var lista = benFiltradas().filter(function (r) { return r.marca_clave; }), por = benAgrupar(lista, function (r) { return r.marca_clave; }), out = [];
  Object.keys(por).sort().forEach(function (k) {
    var pb = benAgrupar(por[k], function (r) { return r.banco; }), mej = {}, max = 0, cuenta = 0;
    BEN_BANCOS.forEach(function (b) { var m = benMejor(pb[b[0]] || []); mej[b[0]] = m; if (m) { cuenta++; if (m.v > max) max = m.v; } });
    if (cuenta < 2) return; // sólo marcas que se pueden comparar
    BEN_BANCOS.forEach(function (b) {
      var m = mej[b[0]]; if (!m) return;
      out.push({ marca: por[k][0].titulo, rubro: m.r.rubro, banco: b[1], devuelve: m.v, pct: m.r.pct, tope: m.r.tope > 0 ? m.r.tope : null, dias: m.r.dias, segmento: benSegTxt(m.r), gana: max > 0 && m.v >= max - 0.5 ? 'Sí' : '' });
    });
  });
  return out;
}
function benDatosSemana() {
  var por = benAgrupar(benFiltradas(), function (r) { return r.banco; }), out = [];
  BEN_DIAS.forEach(function (dia, i) {
    BEN_BANCOS.forEach(function (b) {
      var m = benMejor((por[b[0]] || []).filter(function (r) { return !r.dias_n || !r.dias_n.length || r.dias_n.indexOf(i) >= 0; }));
      out.push({ dia: dia, banco: b[1], devuelve: m ? m.v : null, pct: m ? m.r.pct : null, marca: m ? m.r.titulo : '', rubro: m ? m.r.rubro : '' });
    });
  });
  return out;
}
function benExcel() {
  var btn = document.getElementById('ben-xl');
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  function fin() { if (btn) { btn.disabled = false; btn.textContent = 'Descargar Excel'; } }
  _lib(['exceljs']).then(function () {
    var wb = new ExcelJS.Workbook(); wb.creator = 'Armador de flyers'; wb.created = new Date();
    function hoja(nombre, cols, filas, fmt) {
      var ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = cols.map(function (c) { return { header: c[1], key: c[0], width: c[2] || 16, style: c[3] ? { numFmt: c[3] } : {} }; });
      filas.forEach(function (f) { ws.addRow(f); });
      var h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.eachCell(function (cell) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14213D' } }; cell.alignment = { vertical: 'middle', wrapText: true }; });
      if (filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      return ws;
    }
    var P = '$#,##0', f = BEN.f, meta = {}; (BEN.meta || []).forEach(function (m) { meta[m.banco] = m; });
    var info = [
      ['Benchmark de promociones: Galicia contra la competencia'], ['Generado', new Date().toLocaleString('es-AR')], [],
      ['Filtros de la pantalla'], ['Provincia', f.prov ? _provNombre(f.prov) : 'Todas las provincias'], ['Rubro', f.rubro || 'Todos'],
      ['Tarjeta de la persona', { todos: 'Todas', clasico: 'Clásico / Gold', premium: 'Premium' }[f.seg] || f.seg], ['Tipo de tarjeta', f.tarj], [],
      ['Compra de referencia (para calcular lo que devuelve)'], ['Supermercados', BEN.ref['Supermercados']], ['Combustible', BEN.ref['Combustible']], ['Farmacia / salud', BEN.ref['Salud y Bienestar']], ['Resto', BEN.ref['Otros']], [],
      ['Fuentes y última actualización']
    ];
    BEN_BANCOS.forEach(function (b) {
      var m = meta[b[0]], w = meta[b[0] + '_web'];
      info.push([b[1], 'MODO' + (w ? ' + web propia' : '') + ' · ' + (m && m.last_sync_at ? new Date(m.last_sync_at).toLocaleDateString('es-AR') : 'sin datos')]);
    });
    info.push([], ['Cómo leerlo'], ['Lo que devuelve = el menor entre (compra de referencia × %) y el tope. Los topes de MODO suelen ser mensuales y se toman como no gastados.'],
      ['Macro, Supervielle y Santander salen sólo de MODO; BBVA y Galicia suman su web propia. Revisá la promo en la web del banco antes de mostrársela a un cliente.']);
    var ws0 = wb.addWorksheet('Resumen'); ws0.getColumn(1).width = 44; ws0.getColumn(2).width = 46;
    info.forEach(function (r) { ws0.addRow(r); });
    ws0.getRow(1).font = { bold: true, size: 14 };
    [4, 10, 16, 20].forEach(function (n) { if (ws0.getRow(n)) ws0.getRow(n).font = { bold: true }; });
    [11, 12, 13, 14].forEach(function (n) { ws0.getRow(n).getCell(2).numFmt = P; });
    hoja('Por rubro', [['rubro', 'Rubro', 20], ['compra', 'Compra de referencia', 18, P], ['banco', 'Banco', 14], ['promos', 'Promos vigentes', 12], ['devuelve', 'Mejor: devuelve', 16, P], ['pct', '%', 8], ['marca', 'Marca', 26], ['tope', 'Tope', 14, P], ['dias', 'Días', 22], ['cuotas', 'Más cuotas sin interés', 14], ['marcaCuotas', 'Marca (cuotas)', 26]], benDatosPorRubro());
    hoja('Por marca', [['marca', 'Marca', 28], ['rubro', 'Rubro', 20], ['banco', 'Banco', 14], ['devuelve', 'Devuelve', 14, P], ['pct', '%', 8], ['tope', 'Tope', 14, P], ['dias', 'Días', 22], ['segmento', 'Sólo para', 14], ['gana', 'Gana', 8]], benDatosPorMarca());
    hoja('Semana', [['dia', 'Día', 12], ['banco', 'Banco', 14], ['devuelve', 'Devuelve', 14, P], ['pct', '%', 8], ['marca', 'Marca', 28], ['rubro', 'Rubro', 20]], benDatosSemana());
    var conf = { oficial: 'Página del banco', nota: 'Nota de prensa o blog', sin_dato: 'Sin dato firme' };
    hoja('Tarjetas y salas VIP', [['banco', 'Banco', 14], ['tarjeta', 'Tarjeta', 26], ['paquete', 'Paquete', 14], ['pases', 'Pases VIP por año (titular)', 14], ['salas', 'Salas VIP', 50], ['fast', 'Fast Pass', 34], ['acomp', 'Acompañantes y adicionales', 40], ['parking', 'Parking', 30], ['seguros', 'Seguros', 50], ['puntos', 'Millas y puntos', 36], ['costo', 'Costo', 44], ['vigencia', 'Vigencia', 30], ['fuente', 'Fuente', 40], ['conf', 'De dónde sale', 18], ['rev', 'Revisada', 12], ['notas', 'Notas', 40]],
      benTarjOrdenadas().map(function (t) { return { banco: BEN_NOM[t.banco] || t.banco, tarjeta: t.tarjeta, paquete: t.paquete, pases: t.pases_anio, salas: t.salas_vip, fast: t.fast_pass, acomp: t.acompanantes, parking: t.parking, seguros: t.seguros, puntos: t.puntos, costo: t.costo, vigencia: t.vigencia, fuente: t.fuente_url, conf: conf[t.confianza] || '', rev: t.revisada || '', notas: t.notas }; }));
    var segs = { premium: 'Premium', clasico: 'Clásico / Gold' };
    hoja('Promos', [['banco', 'Banco', 14], ['fuente', 'Fuente', 12], ['marca', 'Marca', 28], ['rubro', 'Rubro', 20], ['beneficio', 'Beneficio', 36], ['pct', '%', 8], ['tope', 'Tope', 14, P], ['por', 'Tope por', 12], ['cuotas', 'Cuotas sin interés', 12], ['dias', 'Días', 22], ['tarjetas', 'Tarjetas', 22], ['segmento', 'Sólo para', 14], ['provincias', 'Dónde vale', 30], ['desde', 'Desde', 12], ['hasta', 'Hasta', 12]],
      benFiltradas().map(function (r) {
        var ps = benProvs(r);
        return { banco: BEN_NOM[r.banco] || r.banco, fuente: r.fuente === 'manual' ? 'Cargada a mano' : r.fuente === 'modo' || !r.fuente ? 'MODO' : 'Web propia', marca: r.titulo, rubro: r.rubro, beneficio: r.beneficio || '', pct: r.pct, tope: r.tope > 0 ? r.tope : null,
          por: { month: 'mes', week: 'semana', day: 'día', transaction: 'compra' }[r.tope_por] || '', cuotas: r.cuotas || null, dias: r.dias || '',
          tarjetas: [r.credito ? 'Crédito' : '', r.debito ? 'Débito' : ''].filter(Boolean).join(' y '), segmento: segs[r.segmento] || '',
          provincias: ps === null ? 'Sin dato' : ps.length ? ps.map(_promoTitulizar).join(', ') : 'Todo el país (online)', desde: r.fecha_desde || '', hasta: r.fecha_hasta || '' };
      }));
    return wb.xlsx.writeBuffer();
  }).then(function (buf) {
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Benchmark_' + benHoyIso() + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) { /* sin liberar */ } }, 4000);
    fin(); showToast('Excel descargado.');
  }).catch(function (e) {
    console.error(e); fin(); showToast('No se pudo armar el Excel. Revisá la conexión e intentá de nuevo.');
  });
}

// ── Vista 7: promos cargadas a mano (Macro y Santander propios) ─────────────
// Sus webs bloquean la lectura automática y no se esquiva esa protección: el admin
// carga las promos importantes que ve en su web y entran a la comparación como
// cualquier otra (fuente 'manual', etiqueta "cargada a mano"). El día 5 de cada mes
// llega un mail para revisarlas y la solapa muestra el aviso.
var BEN_RUBROS_BASE = ['Supermercados', 'Combustible', 'Gastronomía', 'Salud y Bienestar', 'Indumentaria', 'Hogar', 'Electrónica', 'Entretenimiento', 'Mascotas', 'Vehículos', 'Juguetes', 'Otros'];
var BEN_DIAS_CORTOS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
var BEN_DIAS_TXT = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
// misma clave de marca que usa la función (modoClave), para juntarla con la de los otros bancos
function benClave(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/\b(supermercados?|super|hiper(mercados?)?|mayorista|farmacias?|perfumerias?|y|de|del|la|el|los|las|grupo|s ?a)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}
function benDiasTxt(idx) {
  if (!idx || !idx.length || idx.length === 7) return 'Todos los días';
  var t = idx.slice().sort().map(function (i) { return BEN_DIAS_TXT[i]; });
  var s = t.length === 1 ? t[0] : t.slice(0, -1).join(', ') + ' y ' + t[t.length - 1];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function benManualAFila(m) {
  var dn = (m.dias_n || []).map(Number);
  return {
    id: 'manual:' + m.id, banco: m.banco, fuente: 'manual', titulo: m.titulo, marca_clave: benClave(m.titulo), rubro: m.rubro || 'Otros',
    beneficio: m.beneficio || '', pct: m.pct == null ? null : Number(m.pct), tope: m.tope == null ? null : Number(m.tope), tope_por: m.tope_por || null,
    cuotas: m.cuotas || 0, dias: benDiasTxt(dn), dias_n: dn.length === 7 ? [] : dn, credito: !!m.credito, debito: !!m.debito, emisores: [],
    segmento: m.segmento || null, segmento_txt: m.condicion || null, provincias: Array.isArray(m.provincias) && m.provincias.length ? m.provincias : [],
    fecha_desde: m.fecha_desde || null, fecha_hasta: m.fecha_hasta || null, proximamente: !!(m.fecha_desde && m.fecha_desde > benHoyIso()), bancos_n: null
  };
}
function benManualCargar(cb) {
  _sb.from('promos_bench_manual').select('*').then(function (r) {
    if (r && r.error) { BEN.manualError = true; BEN.manual = []; } else { BEN.manualError = false; BEN.manual = (r && r.data) || []; }
    if (cb) cb();
  }, function () { BEN.manualError = true; BEN.manual = []; if (cb) cb(); });
}
// ¿Toca revisarlas? Desde el día 5, si no se tocó ninguna en lo que va del mes.
function benManualToca() {
  var hoy = benHoyIso(); if (Number(hoy.slice(8, 10)) < 5) return false;
  var mes = hoy.slice(0, 7) + '-01';
  return !(BEN.manual || []).some(function (m) { return m.updated_at && String(m.updated_at).slice(0, 10) >= mes; });
}
function benManualAvisoHtml() {
  if (!_admin || BEN.manualError || !benManualToca() || BEN.vista === 'manual') return '';
  var ult = (BEN.manual || []).map(function (m) { return String(m.updated_at || '').slice(0, 10); }).sort().pop();
  return '<div class="ben-card" style="border-color:var(--accent,#F26122)"><div style="font-size:.9rem;color:var(--ink);line-height:1.5"><b>Es día de revisar las promos cargadas a mano.</b> Sacá las vencidas y sumá las del mes nuevo (los beneficios de paquete también). Las promos propias de Macro y Santander se actualizan pidiéndole a Claude la carga asistida' +
    (ult ? ' (última actualización: ' + benFecha(ult) + ')' : '') + '.</div><button class="btn" style="margin-top:8px" onclick="benVista(\'manual\')">Ir a Cargadas a mano</button></div>';
}
function benManualHtml() {
  var hoy = benHoyIso(), L = (BEN.manual || []).slice().sort(function (a, b) { return benOrdBanco(a.banco) - benOrdBanco(b.banco) || String(a.titulo).localeCompare(String(b.titulo), 'es'); });
  var h = '<div class="ben-card"><h3>Promos cargadas a mano</h3><p class="ben-sub">Lo que no llega solo se carga acá y entra a la comparación con la etiqueta «cargada a mano»: por ejemplo los beneficios de un paquete (poné el paquete en «Condición») o una promo de Macro o Santander que la carga asistida mensual no haya traído. El día 5 de cada mes te llega un mail para revisarlas.</p>' +
    (_admin && !BEN.manualError ? '<button class="btn" onclick="benManualEditar(\'\')">+ Agregar promo</button>' : '') + '</div>';
  if (BEN.manualError) return h + '<div class="ben-vacio"><strong>No se pudo leer la tabla de promos cargadas a mano</strong>¿Está aplicada la migración 043? <button class="btn" onclick="BEN.rows=null;benCargar()">Reintentar</button></div>';
  if (!L.length) return h + '<div class="ben-vacio"><strong>Todavía no hay promos cargadas a mano</strong>' + (_admin ? 'Agregá la primera con «+ Agregar promo».' : 'El administrador las va a cargar.') + '</div>';
  var tPor = { month: ' por mes', week: ' por semana', day: ' por día', transaction: ' por compra' };
  return h + '<div class="ben-card ben-scroll"><table class="ben-t"><thead><tr><th>Banco</th><th>Marca</th><th>Rubro</th><th>Beneficio</th><th>Días</th><th>Tarjetas</th><th>Vigencia</th><th>Fuente</th>' + (_admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
    L.map(function (m) {
      var vencida = m.fecha_hasta && m.fecha_hasta < hoy, empieza = m.fecha_desde && m.fecha_desde > hoy;
      var ben = [m.pct != null ? m.pct + '%' : '', m.cuotas ? m.cuotas + ' cuotas sin interés' : '', m.tope ? 'tope ' + benPlata(m.tope) + (tPor[m.tope_por] || '') : ''].filter(Boolean).join(' · ');
      return '<tr style="' + (vencida ? 'opacity:.55' : '') + '"><td><b>' + benE(BEN_NOM[m.banco] || m.banco) + '</b></td><td>' + benE(m.titulo) + '</td><td>' + benE(m.rubro) + '</td>' +
        '<td style="min-width:180px">' + benE(ben) + (m.beneficio ? '<div class="ben-seg">' + benE(m.beneficio) + '</div>' : '') + (m.condicion ? '<div class="ben-seg">' + benE(m.condicion) + '</div>' : '') + (m.segmento === 'premium' ? '<div class="ben-seg">Sólo Premium</div>' : m.segmento === 'clasico' ? '<div class="ben-seg">Sólo Clásico/Gold</div>' : '') + '</td>' +
        '<td>' + benE(benDiasTxt((m.dias_n || []).map(Number))) + '</td><td>' + [m.credito ? 'Crédito' : '', m.debito ? 'Débito' : ''].filter(Boolean).join(' y ') + '</td>' +
        '<td>' + (vencida ? '<b class="ben-down">Vencida</b> ' : empieza ? 'Empieza el ' + benFecha(m.fecha_desde) + ' ' : '') + (m.fecha_hasta ? '<div class="ben-seg">hasta ' + benFecha(m.fecha_hasta) + '</div>' : '') + '</td>' +
        '<td>' + (benUrlOk(m.fuente_url) ? '<a href="' + benE(m.fuente_url) + '" target="_blank" rel="noopener noreferrer">Ver página</a>' : '') + (m.updated_at ? '<div class="ben-seg">act. ' + benFecha(m.updated_at) + '</div>' : '') + (m.notas ? '<div class="ben-seg">' + benE(m.notas) + '</div>' : '') + '</td>' +
        (_admin ? '<td style="white-space:nowrap"><button class="btn" onclick="benManualEditar(\'' + benE(m.id) + '\')">Editar</button> <button class="btn" onclick="benManualBorrar(\'' + benE(m.id) + '\')">Quitar</button></td>' : '') + '</tr>';
    }).join('') + '</tbody></table></div>';
}
function benManualEditar(id) {
  if (!_admin) return;
  var m = id ? (BEN.manual || []).filter(function (x) { return x.id === id; })[0] : null;
  if (id && !m) return;
  m = m || { banco: 'santander', titulo: '', rubro: 'Supermercados', dias_n: [], credito: true, debito: true, segmento: null };
  var viejo = document.getElementById('ben-ed-ov'); if (viejo) viejo.remove();
  function opt(v, t, cur) { return '<option value="' + benE(v) + '"' + (cur === v ? ' selected' : '') + '>' + t + '</option>'; }
  function inp(k, lbl, tipo, extra) { return '<label class="ben-f"' + (extra || '') + '>' + lbl + '<input id="ben-m-' + k + '" type="' + tipo + '" value="' + benE(m[k] == null ? '' : m[k]) + '" style="width:100%"></label>'; }
  var rubros = BEN_RUBROS_BASE.slice(); if (m.rubro && rubros.indexOf(m.rubro) < 0) rubros.push(m.rubro);
  var dias = (m.dias_n || []).map(Number);
  var ov = document.createElement('div');
  ov.id = 'ben-ed-ov'; ov.className = 'ben-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = '<div class="ben-ed"><h3 style="margin:0 0 10px">' + (id ? 'Editar promo' : 'Agregar promo') + '</h3><div class="ben-ed-g">' +
    '<label class="ben-f">Banco<select id="ben-m-banco">' + BEN_BANCOS.map(function (b) { return opt(b[0], b[1], m.banco); }).join('') + '</select></label>' +
    '<label class="ben-f">Rubro<select id="ben-m-rubro">' + rubros.map(function (r) { return opt(r, r, m.rubro); }).join('') + '</select></label>' +
    inp('titulo', 'Marca o comercio', 'text') + inp('pct', '% de descuento o reintegro', 'number') +
    inp('tope', 'Tope ($)', 'number') +
    '<label class="ben-f">El tope es<select id="ben-m-tope_por">' + opt('', 'Sin dato', m.tope_por || '') + opt('month', 'Por mes', m.tope_por) + opt('week', 'Por semana', m.tope_por) + opt('day', 'Por día', m.tope_por) + opt('transaction', 'Por compra', m.tope_por) + '</select></label>' +
    inp('cuotas', 'Cuotas sin interés', 'number') +
    '<label class="ben-f">Para quién<select id="ben-m-segmento">' + opt('', 'Todos', m.segmento || '') + opt('clasico', 'Sólo Clásico / Gold', m.segmento) + opt('premium', 'Sólo Premium (Select, Selecta…)', m.segmento) + '</select></label>' +
    inp('condicion', 'Condición (ej.: Paquete Black+ All · Visa Signature por NFC)', 'text', ' style="grid-column:1 / -1"') +
    '<div class="ben-f" style="grid-column:1 / -1">Días (ninguno marcado = todos los días)<div>' + BEN_DIAS_CORTOS.map(function (d, i) {
      return '<label style="margin-right:10px;font-weight:500"><input type="checkbox" class="ben-m-dia" value="' + i + '"' + (dias.indexOf(i) >= 0 ? ' checked' : '') + '> ' + d + '</label>';
    }).join('') + '</div></div>' +
    '<div class="ben-f" style="grid-column:1 / -1">Tarjetas<div><label style="margin-right:10px;font-weight:500"><input type="checkbox" id="ben-m-credito"' + (m.credito ? ' checked' : '') + '> Crédito</label><label style="font-weight:500"><input type="checkbox" id="ben-m-debito"' + (m.debito ? ' checked' : '') + '> Débito</label></div></div>' +
    inp('fecha_desde', 'Desde', 'date') + inp('fecha_hasta', 'Hasta', 'date') +
    '<label class="ben-f" style="grid-column:1 / -1">Provincias (separadas por coma; vacío = todo el país)<input id="ben-m-provincias" type="text" value="' + benE((m.provincias || []).join(', ')) + '" style="width:100%"></label>' +
    '<label class="ben-f" style="grid-column:1 / -1">Detalle (cómo se paga, condiciones)<textarea id="ben-m-beneficio" rows="2" style="width:100%">' + benE(m.beneficio || '') + '</textarea></label>' +
    inp('fuente_url', 'Dirección de la página (https://…)', 'text', ' style="grid-column:1 / -1"') +
    '<label class="ben-f" style="grid-column:1 / -1">Notas<textarea id="ben-m-notas" rows="2" style="width:100%">' + benE(m.notas || '') + '</textarea></label>' +
    '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" onclick="benTarjCerrar()">Cancelar</button><button class="btn" id="ben-ed-ok" onclick="benManualGuardar(\'' + benE(id || '') + '\')">Guardar</button></div></div>';
  ov.addEventListener('mousedown', function (e) { if (e.target === ov) benTarjCerrar(); });
  document.body.appendChild(ov);
  var p = document.getElementById('ben-m-titulo'); if (p) p.focus();
}
function benManualGuardar(id) {
  var g = function (k) { var el = document.getElementById('ben-m-' + k); return el ? String(el.value).trim() : ''; };
  var num = function (v) { return v === '' ? null : Number(v); };
  var o = {
    banco: g('banco'), rubro: g('rubro') || 'Otros', titulo: g('titulo'), pct: num(g('pct')), tope: num(g('tope')), tope_por: g('tope_por') || null,
    cuotas: Math.max(0, Math.round(Number(g('cuotas')) || 0)), segmento: g('segmento') || null, condicion: g('condicion'), beneficio: g('beneficio'), notas: g('notas'), fuente_url: g('fuente_url'),
    fecha_desde: g('fecha_desde') || null, fecha_hasta: g('fecha_hasta') || null,
    dias_n: [].slice.call(document.querySelectorAll('.ben-m-dia:checked')).map(function (x) { return Number(x.value); }),
    credito: !!(document.getElementById('ben-m-credito') || {}).checked, debito: !!(document.getElementById('ben-m-debito') || {}).checked,
    provincias: g('provincias') ? g('provincias').split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean) : null
  };
  if (!o.titulo) { showToast('Falta la marca o el comercio.'); return; }
  if (o.pct == null && !o.cuotas) { showToast('Poné el % de descuento o las cuotas sin interés.'); return; }
  if ((o.pct != null && (isNaN(o.pct) || o.pct <= 0 || o.pct > 100)) || (o.tope != null && (isNaN(o.tope) || o.tope < 0))) { showToast('Revisá el % y el tope: tienen que ser números válidos.'); return; }
  if (o.fuente_url && !benUrlOk(o.fuente_url)) { showToast('La dirección de la página tiene que empezar con https://'); return; }
  if (o.fecha_desde && o.fecha_hasta && o.fecha_hasta < o.fecha_desde) { showToast('La fecha "hasta" es anterior a "desde".'); return; }
  if (!o.credito && !o.debito) { o.credito = true; o.debito = true; }
  var btn = document.getElementById('ben-ed-ok'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  var q = id ? _sb.from('promos_bench_manual').update(o).eq('id', id) : _sb.from('promos_bench_manual').insert(o);
  q.then(function (r) {
    if (r && r.error) { if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } showToast('No se pudo guardar: ' + (r.error.message || 'error')); return; }
    benTarjCerrar(); showToast('Guardado.'); BEN.rows = null; BEN.cargando = false; benCargar();
  }, function () { if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } showToast('No se pudo guardar. Revisá la conexión.'); });
}
function benManualBorrar(id) {
  if (!_admin) return;
  var m = (BEN.manual || []).filter(function (x) { return x.id === id; })[0]; if (!m) return;
  fgConfirm('¿Quitar «' + m.titulo + '» de ' + (BEN_NOM[m.banco] || m.banco) + '?\nSe borra de las promos cargadas a mano. No se puede deshacer.', { ok: 'Quitar' }).then(function (ok) {
    if (!ok) return;
    _sb.from('promos_bench_manual').delete().eq('id', id).then(function (r) {
      if (r && r.error) { showToast('No se pudo quitar: ' + (r.error.message || 'error')); return; }
      BEN.rows = null; BEN.cargando = false; benCargar();
    }, function () { showToast('No se pudo quitar. Revisá la conexión.'); });
  });
}

// ── Actualizar ahora (sólo admin): un banco por vez y después las marcas ───
function benActualizar() {
  var btn = document.getElementById('ben-act');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
  var errores = [], i = 0;
  function listo() {
    if (btn) { btn.disabled = false; btn.textContent = 'Actualizar ahora'; }
    showToast((errores.length ? 'Algo no se pudo actualizar: ' + errores.join(' · ') : 'Benchmark actualizado.'));
    BEN.rows = null; BEN.cargando = false; benCargar();
  }
  function marcas(vez) {
    if (btn) btn.textContent = 'Actualizando lugares y logos…';
    _callEdgeFn(FN_URL_BENCH, 'marcas', { presupuestoMs: 18000 }, function (err, d) {
      if (err) { errores.push('lugares y logos'); listo(); return; }
      var pend = d && d.data ? d.data.pendientes : 0;
      if (pend > 0 && vez < 40) { if (btn) btn.textContent = 'Lugares y logos (faltan ' + pend + ')…'; marcas(vez + 1); } else listo();
    });
  }
  function galicia(vez) {
    if (btn) btn.textContent = 'Galicia (detalle de cada promo)…';
    _callEdgeFn(FN_URL_BENCH, 'galicia', { presupuestoMs: 18000 }, function (err, d) {
      if (err) { errores.push('Galicia propio: ' + err); marcas(0); return; }
      var pend = d && d.data ? d.data.pendientes : 0;
      if (pend > 0 && vez < 40) { if (btn) btn.textContent = 'Galicia (faltan ' + pend + ')…'; galicia(vez + 1); } else marcas(0);
    });
  }
  function supervielle() {
    if (btn) btn.textContent = 'Actualizando la web de Supervielle…';
    _callEdgeFn(FN_URL_BENCH, 'supervielle', {}, function (err) {
      if (err) errores.push('Supervielle propio: ' + err);
      galicia(0); // Santander y Macro: carga asistida una vez por mes
    });
  }
  function bbva() {
    if (btn) btn.textContent = 'Actualizando la web de BBVA…';
    _callEdgeFn(FN_URL_BENCH, 'bbva', {}, function (err) {
      if (err) errores.push('BBVA propio: ' + err);
      supervielle();
    });
  }
  function siguiente() {
    if (i >= BEN_BANCOS.length) { bbva(); return; }
    var b = BEN_BANCOS[i++];
    if (btn) btn.textContent = 'Actualizando ' + b[1] + '…';
    _callEdgeFn(FN_URL_BENCH, 'sync', { banco: b[0] }, function (err, d) {
      var r = d && d.data && d.data.resultados && d.data.resultados[0];
      if (err || (r && r.error)) errores.push(b[1] + ': ' + (err ? 'sin conexión' : r.error));
      siguiente();
    });
  }
  siguiente();
}
