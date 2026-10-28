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
    '.ben-view{display:block;overflow:auto;height:calc(100vh - 62px - var(--simbar-h,0px));background:var(--paper,var(--light));}',
    '@media (max-width:900px){.ben-view{height:auto;overflow:visible;}.ben-root{padding:14px 14px 40px;}.ben-ref input{width:84px;}}',
  ].join('\n');
  document.head.appendChild(st);
})();

var BEN_BANCOS = [['galicia', 'Galicia'], ['bbva', 'BBVA'], ['macro', 'Macro'], ['supervielle', 'Supervielle'], ['santander', 'Santander']];
var BEN_NOM = { galicia: 'Galicia', bbva: 'BBVA', macro: 'Macro', supervielle: 'Supervielle', santander: 'Santander' };
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
  var d = new Date(iso); if (isNaN(d)) return '';
  return d.getDate() + '/' + (d.getMonth() + 1);
}
function benHoyIso() { var d = new Date(Date.now() - 3 * 3600000); return d.toISOString().slice(0, 10); }
function benRefDe(rubro) { var v = BEN.ref[rubro]; return v > 0 ? v : (BEN.ref['Otros'] > 0 ? BEN.ref['Otros'] : BEN_REF_DEF['Otros']); }

// Lo que devuelve una promo en una compra de referencia (null = no devuelve plata: sólo cuotas).
function benDevuelve(r) {
  if (!(r.pct > 0)) return null;
  var compra = benRefDe(r.rubro), bruto = compra * r.pct / 100;
  return r.tope > 0 ? Math.min(bruto, r.tope) : bruto;
}
function benTopeTxt(r) {
  if (!(r.tope > 0)) return 'sin tope informado';
  var por = { month: ' por mes', week: ' por semana', day: ' por día', transaction: ' por compra' }[r.tope_por] || '';
  return 'tope ' + benPlata(r.tope) + por;
}
function benSegTxt(r) { return r.segmento === 'premium' ? 'Premium' : r.segmento === 'clasico' ? 'Clásico/Gold' : ''; }

// ── Carga ───────────────────────────────────────────────────────────────────
function benCargar(cb) {
  if (BEN.cargando) return;
  BEN.cargando = true; BEN.error = '';
  benRender();
  var pend = 4, fallo = null;
  function fin() {
    if (--pend > 0) return;
    BEN.cargando = false;
    if (fallo) { BEN.error = fallo; BEN.rows = BEN.rows || []; }
    BEN.cache = null;
    benRender();
    if (cb) cb();
  }
  var filas = null;
  _sbTodo(function (a, b) { return _sb.from('promos_bench_cache').select('*').order('id').range(a, b); }, function (err, d) {
    if (err) fallo = 'No se pudieron leer las promos del Benchmark. ¿Está aplicada la migración 039?'; else BEN.rows = d || [];
    fin();
  });
  _sbTodo(function (a, b) { return _sb.from('promos_bench_marcas').select('*').order('marca_clave').range(a, b); }, function (err, d) {
    var m = {}; (d || []).forEach(function (x) { m[x.marca_clave] = x; }); BEN.marcas = m; fin();
  });
  _sb.from('promos_bench_meta').select('*').then(function (r) { BEN.meta = (r && r.data) || []; fin(); }, function () { fin(); });
  _sb.from('promos_bench_hist').select('*').order('semana', { ascending: false }).limit(2000).then(function (r) { BEN.hist = (r && r.data) || []; fin(); }, function () { fin(); });
}

// ── Filtros ─────────────────────────────────────────────────────────────────
// Dónde vale una promo: la propia (online = todo el país) o la de su marca; null = no se sabe.
function benProvs(r) {
  if (Array.isArray(r.provincias)) return r.provincias;
  var m = BEN.marcas[r.marca_clave];
  return m && Array.isArray(m.provincias) ? m.provincias : null;
}
function benPasaFiltros(r, hoy) {
  if (r.proximamente) return false;
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
    // sin dato de lugares no se muestra al elegir una provincia (igual que en Promociones)
    if (ps === null) return false;
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
function benMejor(lista) {
  var mejor = null, mv = -1;
  lista.forEach(function (r) {
    var v = benDevuelve(r);
    if (v == null) return;
    if (v > mv) { mv = v; mejor = r; }
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
  var h = '<div class="ben-top"><div><h2>Benchmark</h2><p>Galicia contra la competencia, a nivel persona. Todos los bancos salen de la misma fuente (MODO), así se comparan manzanas con manzanas; lo que un banco publica sólo en su propia web todavía no está.</p></div>' +
    '<div class="ben-acts">' + (_admin ? '<button class="btn" id="ben-act" onclick="benActualizar()">Actualizar ahora</button>' : '') + '</div></div>';
  h += benFuentesHtml();
  if (BEN.cargando && BEN.rows === null) { root.innerHTML = h + '<div class="ben-vacio"><strong>Cargando…</strong>Trayendo las promos de cada banco.</div>'; return; }
  if (BEN.error) { root.innerHTML = h + '<div class="ben-vacio"><strong>' + benE(BEN.error) + '</strong><button class="btn" onclick="BEN.rows=null;benCargar()">Reintentar</button></div>'; return; }
  if (!BEN.rows || !BEN.rows.length) {
    root.innerHTML = h + '<div class="ben-vacio"><strong>Todavía no hay promos de la competencia</strong>' + (_admin ? 'Tocá «Actualizar ahora» para bajarlas por primera vez.' : 'Se actualizan una vez por semana.') + '</div>';
    return;
  }
  h += benFiltrosHtml();
  h += benNotaLugares();
  var tabs = [['rubro', 'Resumen por rubro'], ['marca', 'Cara a cara por marca'], ['semana', 'Semana']];
  h += '<div class="ben-tabs" role="tablist">' + tabs.map(function (t) {
    return '<button class="ben-tab' + (BEN.vista === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (BEN.vista === t[0]) + '" onclick="benVista(\'' + t[0] + '\')">' + t[1] + '</button>';
  }).join('') + '</div>';
  var body = BEN.vista === 'marca' ? benMarcaHtml() : BEN.vista === 'semana' ? benSemanaHtml() : benRubroHtml();
  root.innerHTML = h + body;
  var sel = document.getElementById('ben-prov'); if (sel && typeof _provSel === 'function') _provSel(sel);
}
function benFuentesHtml() {
  var meta = {}; (BEN.meta || []).forEach(function (m) { meta[m.banco] = m; });
  var hoy = Date.now();
  return '<div class="ben-fuentes">' + BEN_BANCOS.map(function (b) {
    var m = meta[b[0]], fecha = m && m.last_sync_at ? benFecha(m.last_sync_at) : 'sin datos';
    var vieja = !m || !m.last_sync_at || hoy - new Date(m.last_sync_at).getTime() > 10 * 86400000;
    return '<span class="ben-chip' + (vieja ? ' vieja' : '') + '" title="' + benE(m && m.error ? 'Último error: ' + m.error : 'Vía MODO') + '"><b>' + b[1] + '</b> · vía MODO · act. ' + fecha + (m && m.error ? ' ⚠' : '') + '</span>';
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
    if (r.proximamente || (r.fecha_hasta && r.fecha_hasta < hoy) || benProvs(r) !== null) return;
    n[r.banco] = (n[r.banco] || 0) + 1;
  });
  var t = BEN_BANCOS.filter(function (b) { return n[b[0]]; }).map(function (b) { return b[1] + ' ' + n[b[0]]; });
  return t.length ? '<p class="ben-aviso" style="margin:-6px 0 12px">Con una provincia elegida no se muestran las promos de las que MODO no informa dónde valen: ' + t.join(', ') + '. Para verlas, elegí «Todas las provincias».</p>' : '';
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
    (benSegTxt(r) ? '<span class="ben-seg">Sólo ' + benSegTxt(r) + '</span>' : '') + '</div>';
}
function benLogo(clave) {
  var m = BEN.marcas[clave];
  return m && m.imagen ? '<img class="ben-logo" loading="lazy" alt="" src="' + benE(typeof _promoLogoSrc === 'function' ? _promoLogoSrc(m.imagen) : FLYERS_PUBLIC + m.imagen) + '">' : '';
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
  return '<div class="ben-card"><div class="ben-resumen">' + resumen + '</div><p class="ben-aviso">Gana el que más devuelve en la compra de referencia (verde). Ojo: la fuente es MODO para todos; los bancos con más promos propias fuera de MODO pueden tener más de lo que se ve acá.</p></div>' +
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

// ── Actualizar ahora (sólo admin): un banco por vez y después las marcas ───
function benActualizar() {
  var btn = document.getElementById('ben-act');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
  var errores = [], i = 0;
  function listo() {
    if (btn) { btn.disabled = false; btn.textContent = 'Actualizar ahora'; }
    showToast(errores.length ? 'Algo no se pudo actualizar: ' + errores.join(' · ') : 'Benchmark actualizado.');
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
  function siguiente() {
    if (i >= BEN_BANCOS.length) { marcas(0); return; }
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
