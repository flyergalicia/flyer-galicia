// Al asignar una acción y elegir hunter, la semana del hunter ocupa todo el ancho de la
// ventana y se ven los seis días sin barra de desplazamiento horizontal.
const G = require('./nube_gestiones.cjs');
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); };
const quieto = (ms) => new Promise((r) => setTimeout(r, ms || 500));

module.exports = async (browser) => {
  G.sembrar();
  for (const [w, h] of [[1366, 800], [1024, 768]]) {
    const p = await G.abrirComo(browser, 'oficial', { w, h });
    await p.evaluate(() => gesIr('agenda'));
    await quieto(700);
    await p.evaluate(() => gesAgendar && gesAgendar());
    await p.waitForFunction(() => document.getElementById('gf-hunter'), null, { timeout: 15000 });
    await p.evaluate(async () => { const h = (await _sb.rpc('gestiones_personas')).data.find((x) => /Sofía/.test(x.nombre)).id; document.getElementById('gf-hunter').value = h; gesHunterCambio(); });
    await p.waitForFunction(() => document.querySelector('#gf-ag .ges-hcols'), null, { timeout: 15000 }).catch(() => {});
    await quieto(600);
    const m = await p.evaluate(() => {
      const a = document.getElementById('gf-ag'), f = a && a.closest('.ges-form, form, div[class*=ges]');
      const hor = a && a.querySelector('.ges-hor');
      const modal = a && a.parentElement;
      return { panel: a ? a.clientWidth : 0, form: modal ? modal.clientWidth : 0, sc: hor ? hor.scrollWidth : 0, cw: hor ? hor.clientWidth : 0, vsc: hor ? hor.scrollHeight : 0, vch: hor ? hor.clientHeight : 0 };
    });
    ok(m.panel > 0 && m.panel >= m.form - 2, w + 'px: la semana ocupa todo el ancho de la ventana (' + m.panel + ' de ' + m.form + ')');
    ok(m.sc <= m.cw + 1, w + 'px: sin barra horizontal en la semana del hunter (' + m.sc + ' ≤ ' + m.cw + ')');
    ok(m.vsc <= m.vch + 1, w + 'px: la semana se ve entera, sin barra vertical propia (' + m.vsc + ' ≤ ' + m.vch + ')');
    await p.screenshot({ path: __dirname + '/capturas/t96_asignar_' + w + '.png' }).catch(() => {});
    await p.context().close().catch(() => {});
  }
};
