// Capturas de Gestiones v2 para mostrarle al dueño (no es una prueba): PC y
// celular, claro y oscuro, de cada persona. Quedan en pruebas/capturas/ (no se versiona).
// Uso: DEMO_CAPTURAS=1 node pruebas/demo_gestiones.cjs   (sin ventanas; arma las capturas y se cierra)
// Lo usa la sesión para revisar cómo se ve; el dueño usa la demo.
const G = require('./nube_gestiones.cjs');
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'capturas');
module.exports = async (browser) => {
  if (!fs.existsSync(out)) fs.mkdirSync(out);
  const S = G.sembrar();
  const sacar = async (p, n) => { await new Promise((r) => setTimeout(r, 500)); await p.screenshot({ path: path.join(out, 'gv2_' + n + '.png'), fullPage: true }); };
  // Celular: hunter
  const hc = await G.abrirComo(browser, 'hunter', { w: 390, h: 844, touch: true });
  await hc.evaluate(() => gesIr('agenda')); await hc.waitForFunction(() => /Para contactar \(/.test(document.getElementById('ges-body').innerHTML));
  await sacar(hc, 'cel_hunter_agenda');
  await hc.evaluate((id) => gesAbrirDet(id), S.g5.id); await hc.waitForFunction(() => /Walter/.test(document.getElementById('ges-body').innerHTML));
  await sacar(hc, 'cel_hunter_detalle');
  await hc.evaluate((id) => gesAbrirDet(id), S.g3.id).catch(() => {});
  // Celular: oficial derivando una base de datos
  const oc = await G.abrirComo(browser, 'oficial', { w: 390, h: 844, touch: true });
  await oc.waitForFunction(() => GES._emps && GES._emps.length);
  await oc.evaluate(() => { const i = GES._emps.findIndex((e) => /ALIMENTOS/.test(e.empresa)); gesDerivar(Math.max(0, i)); });
  await oc.waitForFunction(() => document.getElementById('ges-der-ok'));
  await oc.evaluate(() => { const b = [...document.querySelectorAll('.ges-pills[data-name=tipo] button')].find((x) => x.dataset.v === 'datos'); gesPill(b); document.getElementById('gf-datos').value = 'Ana Pérez\t11 5555-1234\tLegajo 302\nRamón Díaz\tramon@mail.com\t27-11111111-7'; gesDatosPrev(); });
  await sacar(oc, 'cel_oficial_base_datos');
  // PC oscuro: líder
  const li = await G.abrirComo(browser, 'lider', { w: 1366, h: 900 });
  await li.evaluate(() => { document.documentElement.classList.add('dark'); });
  await sacar(li, 'pc_oscuro_lider_agenda');
  await li.evaluate((id) => gesAbrirDet(id, false, true), S.g4.id); await li.waitForFunction(() => document.getElementById('ges-ra-ok'));
  await sacar(li, 'pc_oscuro_lider_cambiar_hunter');
  // PC: detalle de la base de datos (oficial)
  const of = await G.abrirComo(browser, 'oficial', { w: 1366, h: 900 });
  await of.evaluate((id) => gesAbrirDet(id), S.g3.id); await of.waitForFunction(() => /Personas para contactar/.test(document.getElementById('ges-body').innerHTML));
  await sacar(of, 'pc_oficial_base_datos_detalle');
  console.log('errores: ' + [hc, oc, li, of].reduce((s, p) => s + p.errores.length, 0));
};
