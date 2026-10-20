// Prueba de la revisión diaria de marcas vigiladas (Edge Function promos-galicia),
// sin Supabase: toma evaluarVigiladas del código de la función y la corre con Node.
// Uso: node pruebas/u01_revision_vigiladas.mjs
import { readFileSync } from 'fs';
import { stripTypeScriptTypes } from 'module';
const src = readFileSync(new URL('../supabase/functions/promos-galicia/index.ts', import.meta.url), 'utf8');
const ini = src.indexOf('type Vig ='), fin = src.indexOf('async function revisarVigiladas');
const js = stripTypeScriptTypes(src.slice(ini, fin)).replace('export function', 'function');
const evaluarVigiladas = new Function(js + '\nreturn evaluarVigiladas;')();
const hoy = new Date(2026, 9, 20), f = (d) => new Date(2026, 9, 20 + d).toISOString().slice(0, 10);
const cat = [
  { titulo: 'Puppis', imagen: 'puppis.png', fecha_hasta: f(30) },
  { titulo: 'Freddo', imagen: 'freddo.png', fecha_hasta: f(3) },
  { titulo: 'Freddo', imagen: 'freddo2.png', fecha_hasta: f(-2) },
  { titulo: 'Nike', imagen: 'nike.png', fecha_hasta: f(-1) },
  { titulo: 'Sin Fecha', imagen: 'sf.png', fecha_hasta: null },
  { titulo: 'Próxima', imagen: 'prox.png', fecha_hasta: f(60), proximamente: true },
];
const ops = { '9': [{ m: 'Puppis', img: 'puppis.png' }, { m: 'Freddo', t: 'Freddo' }, { m: 'Nike', img: 'nike.png' }, { m: 'Sin fecha', t: 'Sin Fecha' }, { m: 'Próxima', img: 'prox.png' }, { m: 'Ya no está', t: 'Inexistente' }] };
const r = evaluarVigiladas(ops, cat, hoy);
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); if (!c) process.exitCode = 1; };
console.log('  resultado:', JSON.stringify(r));
ok(!r.some((x) => x.marca === 'Puppis'), 'vigente con fecha lejana: no se avisa');
ok(r.some((x) => x.marca === 'Freddo' && x.estado === 'vence' && x.hasta === f(3)), 'Freddo vence en 3 días (toma la que vence más tarde)');
ok(r.some((x) => x.marca === 'Nike' && x.estado === 'vencida'), 'Nike vencida');
ok(!r.some((x) => x.marca === 'Sin fecha'), 'sin fecha informada: se toma como vigente');
ok(r.some((x) => x.marca === 'Próxima' && x.estado === 'vencida'), '"Próximamente" no cuenta como vigente hoy');
ok(r.some((x) => x.marca === 'Ya no está' && x.estado === 'vencida'), 'una marca que ya no está en el catálogo se avisa');
