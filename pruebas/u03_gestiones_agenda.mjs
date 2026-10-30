// Gestiones: agenda de los hunters (horario, lugar, posición comercial, semana
// del hunter, grilla del equipo con "Libre", aviso de horarios que se pisan y
// pegar la agenda desde Excel).
// Sin navegador: corre gestiones.js con Node y una nube simulada mínima.
// Uso: node pruebas/u03_gestiones_agenda.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const els = {};
const el = (id, v) => { const e = els[id] || (els[id] = { id, innerHTML: '', value: '', style: {}, hidden: false, disabled: false, textContent: '' }); if (v !== undefined) e.value = v; return e; };
// Nube simulada: rpc por nombre y consultas a tablas (registra lo insertado).
const RPC = {}, insertados = [];
let TABLA = [];
const consulta = () => {
  const q = { filtros: [] };
  ['select', 'order', 'limit', 'single', 'maybeSingle'].forEach((m) => { q[m] = () => q; });
  q.gte = (c, v) => { q.filtros.push((r) => r[c] >= v); return q; };
  q.lte = (c, v) => { q.filtros.push((r) => r[c] <= v); return q; };
  q.eq = (c, v) => { q.filtros.push((r) => r[c] === v); return q; };
  q.in = (c, v) => { q.filtros.push((r) => v.includes(r[c])); return q; };
  q.is = (c, v) => { q.filtros.push((r) => (r[c] == null) === (v === null)); return q; };
  q.not = (c, op, v) => { q.filtros.push((r) => !(op === 'is' && (r[c] == null) === (v === null))); return q; };
  q.insert = (d) => { q.ins = d; insertados.push(d); return q; };
  q.then = (ok, mal) => Promise.resolve(q.ins ? { data: Array.isArray(q.ins) ? q.ins.map((x, i) => ({ id: 'n' + i, ...x })) : { id: 'n0', ...q.ins } } : { data: TABLA.filter((r) => q.filtros.every((f) => f(r))) }).then(ok, mal);
  return q;
};
const confirmaciones = [];
const C = {
  console, Promise, Object, Math, JSON, Date, String, Number, Array, isFinite, parseFloat, parseInt, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: (id) => els[id] || null, createElement: () => ({}), head: { appendChild() {} }, querySelector: () => null },
  _padNorm: (s) => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(),
  _escHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  _escAttr: (s) => String(s).replace(/"/g, '&quot;'),
  _rolVigente: () => C._rol, _rol: 'hunter', _admin: false, _esPrueba: false, _me: { id: 'h1' },
  _sb: { rpc: (n, a) => Promise.resolve({ data: RPC[n] ? RPC[n](a) : [] }), from: () => consulta() },
  fgConfirm: (m) => { confirmaciones.push(m); return Promise.resolve(true); },
  showToast: () => {},
};
vm.createContext(C);
vm.runInContext(readFileSync(new URL('../gestiones.js', import.meta.url), 'utf8'), C, { filename: 'gestiones.js' });
C.gesModal = (html) => { el('modal').innerHTML = html; };
C.gesCerrar = () => {};
C.gesPersonas = () => Promise.resolve(C.GES.personas);
const espera = () => new Promise((r) => setTimeout(r, 30));

const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); if (!c) process.exitCode = 1; };

// ── Lectura de horarios y fechas pegados ──
const H = (x) => JSON.stringify(C.gesHorarioDe(x));
ok(H('10 a 12') === '["10:00","12:00"]' && H('10:00-12:30') === '["10:00","12:30"]' && H('9hs a 13hs') === '["09:00","13:00"]' && H('9.30 – 13') === '["09:30","13:00"]', 'horarios: "10 a 12", "10:00-12:30", "9hs a 13hs", "9.30 – 13"');
ok(H('9hs') === '["09:00",null]' && H('12 a 10') === 'null' && H('10') === 'null' && H('ACME') === 'null', 'horario sólo de inicio; al revés, un número solo o un texto no son horario');
const y = new Date().getFullYear();
ok(C.gesFechaDe('21/10') === y + '-10-21' && C.gesFechaDe('21/10/2026') === '2026-10-21' && C.gesFechaDe('mar 3/11/26') === '2026-11-03' && C.gesFechaDe('2026-10-21') === '2026-10-21', 'fechas: 21/10, 21/10/2026, "mar 3/11/26", 2026-10-21');
ok(C.gesFechaDe('31/02') === null && C.gesFechaDe('10-12') === null && C.gesFechaDe('ACME') === null, 'fecha inválida, "10-12" (es horario) o texto no son fecha');

// ── Horarios que se pisan ──
const g = (d, h) => ({ hora_desde: d, hora_hasta: h });
ok(C.gesSePisan(g('10:00:00', '12:00:00'), g('11:00', '13:00')) && !C.gesSePisan(g('10:00', '12:00'), g('12:00', '13:00')), 'se pisan 10–12 y 11–13; 10–12 y 12–13 no (una termina cuando empieza la otra)');
ok(C.gesSePisan(g('10:00', null), g('10:30', '11:00')) && !C.gesSePisan(g(null, null), g('10:00', '11:00')), 'sin "hasta" cuenta una hora; sin horario no se compara');
ok(C.gesHorError({ hora_desde: null, hora_hasta: '12:00' }) && C.gesHorError({ hora_desde: '12:00', hora_hasta: '10:00' }) && C.gesHorError({ hora_desde: '10:00', hora_hasta: '12:00' }) === null, 'horario: falta el inicio o termina antes de empezar → aviso');
ok(C.gesHorario({ hora_desde: '10:00:00', hora_hasta: '12:30:00' }) === '10:00–12:30' && C.GES_TIPO.posicion === 'Posición comercial', 'el horario se ve "10:00–12:30" y existe el tipo Posición comercial');

// ── Semana del hunter ──
C.GES.personas = { h1: { nombre: 'Sofía Pérez', rol: 'hunter', lider_id: 'l1' }, h2: { nombre: 'Tomás Gil', rol: 'hunter', lider_id: 'l1' }, h3: { nombre: 'Otra Persona', rol: 'hunter', lider_id: 'l9' }, l1: { nombre: 'Líder', rol: 'lider' }, o1: { nombre: 'Oficial', rol: 'vip' } };
const lunes = C.gesLunes('2026-10-21');
ok(lunes === '2026-10-19' && C.gesLunes('2026-10-25') === '2026-10-19' && C.gesLunes('2026-10-19') === '2026-10-19', 'la semana empieza el lunes (miércoles y domingo → lunes 19)');
TABLA = [
  { id: 'a', empresa: 'ACME SA', tipo: 'posicion', modalidad: 'presencial', fecha: '2026-10-20', hora_desde: '15:00:00', hora_hasta: '17:00:00', lugar: 'Piso 3', estado: 'planificada', hunter_id: 'h1', visto_hunter: true },
  { id: 'b', empresa: 'BETA SRL', tipo: 'accion', modalidad: 'presencial', fecha: '2026-10-20', hora_desde: '09:00:00', hora_hasta: '11:00:00', lugar: null, estado: 'planificada', hunter_id: 'h1', visto_hunter: false },
  { id: 'c', empresa: 'GAMA SA', tipo: 'feria', modalidad: 'presencial', fecha: '2026-10-22', hora_desde: null, hora_hasta: null, estado: 'cancelada', hunter_id: 'h2', visto_hunter: true },
  { id: 'd', empresa: 'DELTA SA', tipo: 'posicion', modalidad: 'presencial', fecha: '2026-10-23', hora_desde: '10:00:00', hora_hasta: '12:00:00', estado: 'realizada', hunter_id: 'h2', visto_hunter: true },
];
el('ges-body');
// La agenda sólo se pinta si se sigue mirando esa solapa (si no, taparía otra).
C.GES.tab = 'agenda'; C.GES.det = null;
C._rol = 'hunter'; C._me = { id: 'h1' }; C.GES.ag.lunes = lunes; C.GES.ag.data = null;
C.gesAgenda(); await espera();
let h = els['ges-body'].innerHTML;
ok(h.indexOf('BETA SRL') > 0 && h.indexOf('BETA SRL') < h.indexOf('ACME SA'), 'semana del hunter: ordenada por hora (9–11 antes que 15–17)');
ok(!h.includes('DELTA SA') && !h.includes('GAMA SA'), 'el hunter ve sólo lo suyo');
ok(h.includes('15–17') && h.includes('ACME SA') && h.includes('ges-hbl'), 'cada acción se dibuja en su horario dentro de la grilla');
ok((h.match(/data-d="/g) || []).length === 6 && h.includes('+ Agendar') && h.includes('19 al 24 de oct'), 'lunes a sábado (sin domingo vacío), "+ Agendar" y el rango de la semana');
ok(h.includes('08:00') && h.includes('17:00'), 'la franja horaria arranca en 8 y llega hasta las 18');
ok(!/NaN|undefined/.test(h), 'semana: sin NaN ni undefined');

// ── Grilla del equipo (líder) ──
// Sin haber elegido vista, el líder arranca viendo a TODO su equipo
C._rol = 'lider'; C._me = { id: 'l1' }; C.GES.ag.data = null; C.GES.ag.ver = null; C.GES.ag.dia = null;
C.gesAgenda(); await espera();
h = els['ges-body'].innerHTML;
ok(C.GES.ag.ver === 'equipo' && h.includes('ges-eqh'), 'el líder entra viendo el día de todo su equipo');
ok(h.includes('Sofía Pérez') && h.includes('Tomás Gil'), 'con una fila por hunter a cargo');
C.GES.ag.ver = 'sem'; C.GES.ag.data = null;
C.gesAgenda(); await espera();
h = els['ges-body'].innerHTML;
ok(h.includes('Sofía Pérez') && h.includes('Tomás Gil') && !h.includes('Otra Persona'), 'equipo: sólo los hunters del líder');
// La semana del líder muestra la agenda de UN hunter, el que elija arriba
C.GES.ag.hun = 'h2'; C.gesAgPintar();
h = els['ges-body'].innerHTML;
ok(h.includes('DELTA SA') && h.includes('10–12'), 'eligiendo a Tomás se ve lo suyo en su horario');
ok(/est-cancelada/.test(h) && /Sin horario/.test(h) && h.includes('GAMA SA'), 'lo cancelado y sin horario se ve aparte, tachado');
ok(h.includes('Pegar desde Excel') && h.includes('+ Asignar'), 'están "Pegar desde Excel" y "+ Asignar"');
// Día del equipo: una fila por hunter y una columna por hora
C.GES.ag.ver = 'equipo'; C.GES.ag.dia = '2026-10-23'; C.gesAgPintar();
h = els['ges-body'].innerHTML;
ok(h.includes('ges-eqh') && h.includes('Sofía Pérez') && h.includes('Tomás Gil'), 'el día del equipo lista a los hunters');
ok(h.includes('DELTA SA') && (h.match(/>Libre</g) || []).length >= 8, 'con lo ocupado y los huecos libres por hora');
ok(!/NaN|undefined/.test(h), 'equipo: sin NaN ni undefined');
C.GES.ag.ver = 'sem'; C.GES.ag.hun = '';
// Si mientras carga se cambia de solapa, la agenda no pisa lo que se está mirando.
C.GES.ag.data = null; els['ges-body'].innerHTML = 'OTRA COSA';
C.gesAgenda(); C.GES.tab = 'lista'; await espera();
ok(els['ges-body'].innerHTML === 'OTRA COSA', 'cambiar de solapa mientras carga: la agenda ya no se pinta encima');
C.GES.tab = 'agenda';

// ── Aviso de horarios que se pisan ──
RPC.gestiones_ocupado = () => [{ id: 'x', hora_desde: '10:00:00', hora_hasta: '12:00:00', tipo: 'posicion', empresa: 'ACME SA' }, { id: 'y', hora_desde: '15:00:00', hora_hasta: '16:00:00', tipo: 'accion', empresa: null }];
confirmaciones.length = 0;
let r = await C.gesChoque('h1', { fecha: '2026-10-21', hora_desde: '13:00', hora_hasta: '14:00' });
ok(r === true && confirmaciones.length === 0, 'sin superposición: guarda sin preguntar');
r = await C.gesChoque('h1', { fecha: '2026-10-21', hora_desde: '11:00', hora_hasta: '15:30' });
ok(r === true && confirmaciones.length === 1 && /Sofía Pérez ya tiene algo a esa hora/.test(confirmaciones[0]) && /10:00–12:00 en ACME SA/.test(confirmaciones[0]) && /15:00–16:00 \(otra acción\)/.test(confirmaciones[0]), 'se pisa: avisa con qué (y sin la empresa si no la puede ver) y deja guardar igual');
r = await C.gesChoque('h1', { fecha: '2026-10-21', hora_desde: '11:00', hora_hasta: '12:00' }, 'x');
ok(confirmaciones.length === 1, 'al editar no choca consigo misma');

// ── Asignar desde la grilla ──
C.GES._agHun = ['h1', 'h2'];
C.gesAgendar(1, '2026-10-24'); await espera();
const m = els.modal.innerHTML;
ok(m.includes('Asignar a un hunter') && /value="h2" selected/.test(m) && m.includes('value="2026-10-24"') && m.includes('id="gf-hd"') && m.includes('id="gf-lugar"'), 'asignar: abre con ese hunter y ese día, con horario y lugar');
ok(!m.includes('Otra Persona'), 'asignar: el líder sólo elige hunters de su equipo');
C.GES._agEmp = { empresa: 'ACME SA', dueno_id: 'o1' };
el('gf-hunter', 'h2'); el('gf-fecha', '2026-10-24'); el('gf-hd', '09:00'); el('gf-hh', '13:00'); el('gf-lugar', 'Planta'); el('gf-nota', ''); el('ges-ag-ok');
RPC.gestiones_ocupado = () => [];
insertados.length = 0;
C.gesAgendarOk(); await espera();
const ins = insertados[0] || {};
ok(ins.empresa === 'ACME SA' && ins.dueno_id === 'o1' && ins.hunter_id === 'h2' && ins.origen === 'derivada' && ins.estado === 'planificada' && ins.hora_desde === '09:00' && ins.hora_hasta === '13:00' && ins.lugar === 'Planta', 'asignar: guarda empresa con su oficial, hunter, horario, lugar, planificada y derivada');

// ── Pegar la agenda desde Excel ──
const filas = C.gesAgPasteParse('Fecha\tHorario\tEmpresa\tHunter\tLugar\n21/10\t10 a 12\tACME SA\tSofía\tPiso 3\nTomás Gil\tBETA SRL\t22/10\t9hs a 11hs\tFeria\nSin Fecha SA\tSofía\n23/10\tACME SA\tNadie Conocido\n24/10\t11 a 13\tOtra SA\tSofía Pérez');
ok(filas.length === 5, 'pegar: salta la fila de títulos (' + filas.length + ' filas)');
ok(filas[0].ok && filas[0].fecha.endsWith('-10-21') && filas[0].hora_desde === '10:00' && filas[0].empresaTxt === 'ACME SA' && filas[0].hunter_id === 'h1' && filas[0].lugar === 'Piso 3' && filas[0].tipo === 'posicion', 'pegar: fecha, horario, empresa, hunter por el nombre de pila y lugar');
ok(filas[1].ok && filas[1].hunter_id === 'h2' && filas[1].tipo === 'feria' && filas[1].hora_hasta === '11:00', 'pegar: columnas en otro orden y el tipo si viene');
ok(!filas[2].ok && filas[2].motivo === 'sin fecha' && !filas[3].ok && /hunter/.test(filas[3].motivo), 'pegar: sin fecha o con un hunter que no existe → con problemas');
RPC.gestiones_empresas = (a) => [{ empresa: 'ACME SA', dueno_id: 'o1' }, { empresa: 'BETA SRL', dueno_id: 'o1' }].filter((e) => e.empresa.toLowerCase().includes(String(a.p_q).toLowerCase()));
RPC.gestiones_ocupado = (a) => (a.p_hunter === 'h1' && a.p_fecha.endsWith('-10-21') ? [{ id: 'z', hora_desde: '11:00:00', hora_hasta: '12:00:00', tipo: 'accion', empresa: 'ZETA' }] : []);
el('ga-paste', 'Fecha\tHorario\tEmpresa\tHunter\tLugar\n21/10\t10 a 12\tACME SA\tSofía\tPiso 3\nTomás Gil\tBETA SRL\t22/10\t9hs a 11hs\tFeria\nSin Fecha SA\tSofía\n23/10\tACME SA\tNadie Conocido\n24/10\t11 a 13\tOtra SA\tSofía Pérez');
el('ga-prev'); el('ga-ok');
C.gesAgPasteRevisar(); await espera(); await espera();
const pv = els['ga-prev'].innerHTML, P = C.GES._agPaste;
ok(P[0].dueno_id === 'o1' && /se pisa con 11:00–12:00 en ZETA/.test(P[0].aviso) && P[1].dueno_id === 'o1' && !P[1].aviso, 'pegar: busca la empresa y su oficial, y avisa la que se pisa con lo ya agendado');
ok(!P[4].ok && /no está en la base/.test(P[4].motivo), 'pegar: una empresa que no está en la base no se agrega');
ok(pv.includes('2 listas') && pv.includes('1 se pisan') && pv.includes('3 con problemas') && els['ga-ok'].textContent === 'Agregar 2 a la agenda' && !els['ga-ok'].disabled, 'pegar: resumen y botón "Agregar 2 a la agenda"');
insertados.length = 0;
C.gesAgPasteOk(); await espera();
const lote = insertados[0] || [];
ok(lote.length === 2 && lote.every((x) => x.origen === 'derivada' && x.estado === 'planificada' && x.dueno_id === 'o1') && lote[0].hora_desde === '10:00' && lote[0].lugar === 'Piso 3', 'pegar: agrega juntas sólo las listas (planificadas, con horario y lugar)');
