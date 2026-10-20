// Gestiones: los prospectos y el tablero se separan por paquete (Caja de Ahorro,
// Plus, Plus Gold, Eminent Platinum, Eminent Black), no por rango de renta.
// Sin navegador: corre gestiones.js con Node y lo mínimo de auth.js simulado.
// Uso: node pruebas/u02_gestiones_paquetes.mjs
import { readFileSync } from 'fs';
import vm from 'vm';

const els = {};
const el = (id) => els[id] || (els[id] = { id, innerHTML: '', value: '', style: {} });
const C = {
  console, Promise, Object, Math, JSON, Date, String, Number, isFinite, parseFloat, parseInt,
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: (id) => els[id] || null, createElement: () => ({}), head: { appendChild() {} }, querySelector: () => null },
  _padNorm: (s) => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(),
  _escHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  _escAttr: (s) => String(s).replace(/"/g, '&quot;'),
  _rolVigente: () => 'lider', _admin: false, _esPrueba: false, _me: { id: 'yo' },
};
vm.createContext(C);
vm.runInContext(readFileSync(new URL('../gestiones.js', import.meta.url), 'utf8'), C, { filename: 'gestiones.js' });

const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); if (!c) process.exitCode = 1; };

ok(Object.values(C.GES_PAQ).join('|') === 'Caja de Ahorro|Plus|Plus Gold|Eminent Platinum|Eminent Black', 'los 5 paquetes, en orden');
ok(C.gesPaqDe('Caja de Ahorro') === 'caja' && C.gesPaqDe('CA') === 'caja' && C.gesPaqDe('caja de ahorros') === 'caja', 'Caja de Ahorro (y CA)');
ok(C.gesPaqDe('Plus') === 'plus' && C.gesPaqDe('PAQUETE PLUS') === 'plus', 'Plus');
ok(C.gesPaqDe('Plus Gold') === 'gold' && C.gesPaqDe('gold') === 'gold', 'Plus Gold (no se confunde con Plus)');
ok(C.gesPaqDe('Eminent Platinum') === 'platinum' && C.gesPaqDe('Platino') === 'platinum', 'Eminent Platinum');
ok(C.gesPaqDe('eminent black') === 'black' && C.gesPaqDe('Black') === 'black', 'Eminent Black');
ok(C.gesPaqDe('Eminent') === null && C.gesPaqDe('Ana Plus') === null && C.gesPaqDe('2500000') === null && C.gesPaqDe('') === null, 'lo que no es sólo un paquete no cuenta (un apellido, un importe, "Eminent" solo)');

C.GES.detPros = [{ cuil: '27111111117' }];
const r = C.gesPasteParse('Nombre\tCUIL\tPaquete\nAna Pérez\t20-12345678-6\tPlus Gold\nEminent Black\tLuis Gómez\nSin Paquete\t27-11111111-7\nJuan Black');
ok(r.length === 4, 'pegar: salta la fila de títulos (' + r.length + ' filas)');
ok(r[0].ok && r[0].nombre === 'Ana Pérez' && r[0].cuil === '20123456786' && r[0].paquete === 'gold', 'pegar: nombre, CUIL y paquete en su lugar');
ok(r[1].ok && r[1].nombre === 'Luis Gómez' && r[1].paquete === 'black', 'pegar: el paquete puede venir antes que el nombre');
ok(!r[2].ok && /ya est/.test(r[2].motivo), 'pegar: un CUIL que ya estaba se avisa');
ok(r[3].ok && r[3].nombre === 'Juan Black' && r[3].paquete === null, 'pegar: un apellido que se parece a un paquete queda como nombre');

const tablero = {
  kpis: { visitas: 4, planificadas: 0, empresas: 2, asistentes: 100, prospectos: 40, altas: 10 },
  por_mes: [{ mes: '2026-10', visitas: 4, prospectos: 40, altas: 10 }],
  por_hunter: [{ id: 'h1', visitas: 3, prospectos: 30, altas: 8, paquetes: { plus: 5, gold: 2 } }, { id: 'h2', visitas: 1, prospectos: 10, altas: 2, paquetes: {} }],
  por_dueno: [{ id: 'd1', visitas: 4, prospectos: 40, altas: 10 }],
  por_empresa: [{ empresa: 'ACME', dueno: 'd1', visitas: 4, prospectos: 40, altas: 10 }],
  por_paquete: [{ paquete: 'plus', altas: 5 }, { paquete: 'gold', altas: 2 }, { paquete: 'black', altas: 1 }, { paquete: null, altas: 2 }],
  por_tipo: [{ tipo: 'feria', modalidad: 'presencial', visitas: 4, prospectos: 40, altas: 10 }],
};
C.GES.personas = { h1: { nombre: 'Sofía', rol: 'hunter' }, h2: { nombre: 'Tomás', rol: 'hunter' }, d1: { nombre: 'Oficial', rol: 'vip' } };
C.GES.tablero = tablero;
el('ges-body');
C.gesTableroPintar();
const h = els['ges-body'].innerHTML;
ok(h.includes('Altas por paquete') && !/renta/i.test(h), 'tablero: "Altas por paquete" en lugar de renta');
ok(['Caja de Ahorro', 'Plus', 'Plus Gold', 'Eminent Platinum', 'Eminent Black'].every((p) => h.includes('>' + p + '<')), 'tablero: aparecen los 5 paquetes (también los que tienen 0)');
ok(h.includes('5 &middot; 50%') && h.includes('2 altas sin paquete cargado'), 'tablero: cantidades y porcentaje sobre el total de altas');
ok(h.includes('5 Plus &middot; 2 Plus Gold'), 'tablero: debajo de cada hunter, sus altas por paquete');
ok(!/NaN|undefined/.test(h), 'tablero: sin NaN ni undefined');
