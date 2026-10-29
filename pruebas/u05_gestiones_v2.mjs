// Gestiones v2 (migración 045), la lógica suelta: "CUIL o referencia", lista
// pegada de una Base de datos (con y sin títulos), lo que falta para derivar,
// quién puede cambiar el hunter o guardar aunque se pise, el aviso cuando se
// pisa (bloquea al oficial, pregunta al líder), con / sin paquete y el historial.
// Sin navegador: corre gestiones.js con Node y lo mínimo de auth.js simulado.
// Uso: node pruebas/u05_gestiones_v2.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const els = {};
const RPC = {}, confirmaciones = [], toasts = [];
const C = {
  console, Promise, Object, Math, JSON, Date, String, Number, Array, isFinite, parseFloat, parseInt, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: (id) => els[id] || null, createElement: () => ({}), head: { appendChild() {} }, querySelector: () => null },
  _padNorm: (s) => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(),
  _escHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  _escAttr: (s) => String(s).replace(/"/g, '&quot;'),
  _rolVigente: () => C._rol, _rol: 'vip', _admin: false, _esPrueba: false, _me: { id: 'o1' },
  _sb: { rpc: (n, a) => Promise.resolve({ data: RPC[n] ? RPC[n](a) : [] }), from: () => ({}) },
  fgConfirm: (m) => { confirmaciones.push(m); return Promise.resolve(true); },
  showToast: (m) => { toasts.push(m); },
};
vm.createContext(C);
vm.runInContext(readFileSync(new URL('../gestiones.js', import.meta.url), 'utf8'), C, { filename: 'gestiones.js' });
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); if (!c) process.exitCode = 1; };

// ── CUIL o referencia ──
const R = (x) => JSON.stringify(C.gesCuilORef(x));
ok(R('20-12345678-6') === '{"cuil":"20123456786"}' && R('Legajo 302') === '{"referencia":"Legajo 302"}' && R('30123456') === '{"referencia":"30123456"}' && R('') === '{}', 'un CUIL válido es CUIL; un legajo o un DNI son referencia; vacío no es nada');
ok(/no es válido/.test(C.gesCuilORef('20-12345678-0').error || ''), 'un número de 11 cifras que no es un CUIL válido se avisa');
ok(C.gesCuitTxt('30900001118,30712345678') === 'CUIT 30-90000111-8 · 30-71234567-8' && C.gesCuitTxt(['30900001118']) === 'CUIT 30-90000111-8' && C.gesCuitTxt(null) === '', 'el CUIT de la empresa se escribe con guiones (uno o varios)');

// ── Lista pegada de una base de datos ──
let l = C.gesPersonasParse('Ana Pérez\t11 5555-1234\tLegajo 302\nramon@mail.com\tRamón Díaz\t27-11111111-7\nCarla Funes\nsólo un número\t\n\t11 4444-0000', false, []);
ok(l.length === 5, 'sin títulos: una persona por renglón (' + l.length + ')');
ok(l[0].ok && l[0].nombre === 'Ana Pérez' && l[0].contacto === '11 5555-1234' && l[0].referencia === 'Legajo 302', 'sin títulos: nombre, teléfono y referencia en cualquier orden');
ok(l[1].ok && l[1].nombre === 'Ramón Díaz' && l[1].contacto === 'ramon@mail.com' && l[1].cuil === '27111111117', 'sin títulos: un mail es contacto y 11 cifras son CUIL');
ok(l[2].ok && l[2].nombre === 'Carla Funes' && !l[2].contacto, 'sólo el nombre alcanza');
ok(!l[4].ok && l[4].motivo === 'sin nombre', 'sin nombre: con problemas');
l = C.gesPersonasParse('Apellido y nombre\tCelular\tLegajo\nPaz, Inés\t1155551234\t1200\n\t11 2222-3333\tSector B', false, []);
ok(l.length === 2 && l[0].ok && l[0].nombre === 'Paz, Inés' && l[0].contacto === '1155551234' && l[0].referencia === '1200', 'con títulos: cada columna por su título (un legajo corto es referencia)');
ok(!l[1].ok && l[1].motivo === 'sin nombre' && l[1].referencia === 'Sector B', 'con títulos y el nombre vacío, otra columna no pasa a ser el nombre');
l = C.gesPersonasParse('Juan Gil\t20-12345678-6\nPedro Ruiz\t20-12345678-6', false, [{ cuil: '27111111117' }]);
ok(l[0].ok && !l[1].ok && /ya est/.test(l[1].motivo), 'no se repite un CUIL dentro de la misma lista');
ok(C.gesPersonasParse('Ana\t27-11111111-7', false, [{ cuil: '27111111117' }])[0].motivo === 'ya está en la lista', 'ni uno que ya estaba');

// ── Lo que falta para derivar / asignar ──
ok(/Elegí el hunter/.test(C.gesAsigError({ tipo: 'accion', hunter_id: '', lider_id: null }) || ''), 'sin hunter ni líder: falta elegir');
ok(/Poné el horario/.test(C.gesAsigError({ tipo: 'accion', hunter_id: 'h1', hora_desde: null }) || ''), 'con un hunter elegido el horario es obligatorio');
ok(C.gesAsigError({ tipo: 'accion', hunter_id: null, lider_id: 'l1', hora_desde: null }) === null, 'para que la asigne el líder, el horario puede quedar para después');
ok(C.gesAsigError({ tipo: 'datos', hunter_id: 'h1', hora_desde: null, fecha: '2026-11-01', vence: '2026-11-20' }) === null && /después/.test(C.gesAsigError({ tipo: 'datos', hunter_id: 'h1', fecha: '2026-11-20', vence: '2026-11-01' }) || ''), 'una base de datos no lleva horario; "hasta" no puede ser antes de "desde"');

// ── Quién cambia el hunter, quién fuerza un horario ──
C.GES.personas = { h1: { nombre: 'Sofía Paz', rol: 'hunter', lider_id: 'l1' }, h2: { nombre: 'Tomás Ríos', rol: 'hunter', lider_id: 'l1' }, h9: { nombre: 'Otro Hunter', rol: 'hunter', lider_id: 'l9' },
  l1: { nombre: 'Laura Méndez', rol: 'lider' }, l9: { nombre: 'Otra Líder', rol: 'lider' }, o1: { nombre: 'Mariana Costa', rol: 'vip', lider_id: 'l1' } };
const g = { id: 'g1', origen: 'derivada', creada_por: 'o1', dueno_id: 'o1', hunter_id: 'h1', estado: 'planificada', lider_id: null };
const como = (rol, id, admin) => { C._rol = rol; C._me = { id }; C._admin = !!admin; };
como('vip', 'o1'); ok(C.gesPuedeReasignar(g) && !C.gesPuedeReasignar(Object.assign({}, g, { estado: 'realizada' })), 'el oficial que la derivó la puede pasar a otro hunter, mientras no esté realizada');
como('hunter', 'h1'); ok(!C.gesPuedeReasignar(g) && !C.gesPuedeReasignar(Object.assign({}, g, { origen: 'propia', creada_por: 'h1' })), 'el hunter nunca (ni en lo que registró él)');
como('lider', 'l1'); ok(C.gesPuedeReasignar(g) && C.gesPuedeReasignar(Object.assign({}, g, { hunter_id: null, lider_id: 'l1' })), 'la líder: en lo de su equipo y en lo que le mandaron para asignar');
como('lider', 'l9'); ok(!C.gesPuedeReasignar(g), 'otra líder no');
como('admin', 'a1', true); ok(C.gesPuedeReasignar(Object.assign({}, g, { estado: 'realizada' })), 'el admin siempre');
como('lider', 'l1'); ok(C.gesPuedeForzar('h1') && !C.gesPuedeForzar('h9'), 'la líder puede guardar aunque se pise sólo en su equipo');
como('vip', 'o1'); ok(!C.gesPuedeForzar('h1'), 'el oficial no');
ok(C.gesPuedeAlLider() && C.gesLideresOpts().indexOf('Laura') < C.gesLideresOpts().indexOf('Otra'), 'el oficial puede mandarla al líder (el suyo primero)');

// ── Horario que se pisa: bloquea al oficial, pregunta a la líder ──
RPC.gestiones_ocupado = () => [{ id: 'x', hora_desde: '15:00:00', hora_hasta: '17:00:00', tipo: 'posicion', empresa: null }];
const d = { fecha: '2026-10-29', hora_desde: '16:00', hora_hasta: '18:00', tipo: 'accion' };
como('vip', 'o1'); confirmaciones.length = 0; toasts.length = 0;
let r = await C.gesChoque('h1', d);
ok(r === false && !confirmaciones.length && /Sofía Paz ya tiene algo a esa hora/.test(toasts[0] || ''), 'oficial: no deja guardar y avisa con qué se pisa');
como('lider', 'l1'); confirmaciones.length = 0;
r = await C.gesChoque('h1', d);
ok(r === true && confirmaciones.length === 1 && /Guardar igual|¿Guardar igual\?/.test(confirmaciones[0]), 'líder: pregunta y puede guardar igual');
como('vip', 'o1');
ok(await C.gesChoque('h1', Object.assign({}, d, { tipo: 'datos' })) === true && await C.gesChoque('h1', Object.assign({}, d, { hora_desde: '17:00', hora_hasta: '18:00' })) === true, 'una base de datos o un horario que no se cruza no frenan');
RPC.gestiones_dia = () => [{ hunter_id: 'h1', hora_desde: '15:00:00', hora_hasta: '17:00:00' }, { hunter_id: 'h9', hora_desde: '16:30:00', hora_hasta: null }];
const lib = await C.gesLibres('2026-10-29', '16:00', '18:00', 'h1');
ok(lib.join(',') === 'h2', 'libres a esa hora: los que no tienen nada que se cruce (' + lib.join(',') + ')');

// ── Con / sin paquete, motivos, textos ──
ok(JSON.stringify(C.gesConSin([{ paquete: 'plus', altas: 3 }, { paquete: 'caja', altas: 2 }, { paquete: null, altas: 1 }])) === '{"con":3,"sin":2,"nada":1}', 'altas con paquete / sin paquete / sin cargar');
ok(C.gesPaqTxt({ plus: 2, gold: 1, caja: 1 }) === '3 con paquete (2 Plus &middot; 1 Plus Gold) &middot; 1 sin paquete' && C.gesPaqTxt({}) === '', 'debajo de cada hunter: con paquete (cuáles) y sin paquete');
ok(/con paquete/.test(C.gesPaqResumen([{ estado: 'alta', paquete: 'plus' }, { estado: 'alta', paquete: 'caja' }, { estado: 'prospecto' }])) && /1 sin paquete/.test(C.gesPaqResumen([{ estado: 'alta', paquete: 'caja' }])), 'resumen de altas de una acción');
ok(C.GES_MOTIVO.ya_galicia === 'Ya cobra en Galicia' && Object.keys(C.GES_MOTIVO).length === 5, 'cinco motivos de descarte');
ok(/se pisa con otra acción/.test(C.gesErrTxt({ message: 'GES_PISA: ese hunter ya tiene algo de 15:00 a 17:00 ese día' })) && /15:00 a 17:00/.test(C.gesErrTxt({ message: 'GES_PISA: ese hunter ya tiene algo de 15:00 a 17:00 ese día' })) && /paquete/.test(C.gesErrTxt({ message: 'GES_PAQ: x' })), 'los frenos de la base se cuentan en castellano');
C.GES.personas.a1 = { nombre: 'Admin', rol: 'admin' };
ok(C.gesEvTxt({ que: 'hunter', quien: 'l1', detalle: { de: 'h2', a: 'h1' } }) === 'Laura Méndez se la pasó de Tomás Ríos a Sofía Paz.', 'historial: quién se la pasó de quién a quién');
ok(C.gesEvTxt({ que: 'alta', quien: 'h1', detalle: { nombre: 'Ana', paquete: 'caja' } }) === 'Sofía Paz marcó el alta de Ana (Sin paquete).' && /No contesta/.test(C.gesEvTxt({ que: 'descarte', quien: 'h1', detalle: { nombre: 'Ana', motivo: 'no_contesta' } })), 'historial: altas con paquete y descartes con motivo');
ok(/mandó al equipo para que la asigne Laura/.test(C.gesEvTxt({ que: 'por_asignar', quien: 'o1', detalle: { lider: 'l1' } })), 'historial: "la mandó al equipo para que la asigne…"');
