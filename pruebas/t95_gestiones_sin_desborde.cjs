// Gestiones: ninguna solapa de ningún perfil tiene barra de desplazamiento horizontal
// (ni en la página ni dentro de una tabla) a 1920, 1366, 1024, 768 y 390 px de ancho.
const G = require('./nube_gestiones.cjs');
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); };
const quieto = (ms) => new Promise((r) => setTimeout(r, ms || 500));
const ANCHOS = [[1920, 950], [1366, 800], [1024, 768], [768, 900], [390, 844]];
const TABS = { oficial: ['empresas', 'agenda', 'lista', 'tablero'], hunter: ['agenda', 'lista', 'tablero'], lider: ['agenda', 'tablero', 'lista'] };

const medir = () => {
  const out = [];
  const root = document.getElementById('ges-root');
  if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('PÁGINA ' + document.documentElement.scrollWidth + '>' + window.innerWidth);
  root.querySelectorAll('*').forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const cs = getComputedStyle(el);
      // en el celular, el calendario por horas se desliza a propósito (7 días no entran en 390 px)
      const calendario = window.innerWidth <= 700 && (el.classList.contains('ges-hor') || el.querySelector(':scope > .ges-eqh,:scope > .ges-hin'));
      if (!calendario && /auto|scroll/.test(cs.overflowX)) out.push((el.className || el.tagName) + ' ' + el.scrollWidth + '>' + el.clientWidth);
    }
  });
  return out;
};

module.exports = async (browser) => {
  G.sembrar();
  // Filtros de Mis empresas: derivadas / sin derivar / con altas
  {
    const p = await G.abrirComo(browser, 'oficial', { w: 1366, h: 800 });
    await p.waitForFunction(() => GES._emps && GES._emps.length && document.getElementById('ges-emp-f'), null, { timeout: 15000 });
    const filas = (f) => p.evaluate((v) => { GES.fEmp = v; gesEmpPintar(); return document.querySelectorAll('#ges-emp-tb .ges-td-e').length; }, f);
    const todas = await filas('todas'), der = await filas('derivadas'), sin = await filas('sin'), altas = await filas('altas');
    ok(todas === 6, 'Mis empresas: "Todas" muestra las 6');
    ok(der + sin === todas && der > 0, 'Derivadas (' + der + ') + Sin derivar (' + sin + ') = todas');
    // una empresa sin ninguna acción tiene que caer en "Sin derivar"
    await p.evaluate(() => { GES._emps.push({ empresa: 'EMPRESA NUEVA SA', cuits: [], k: 'empresa nueva sa', s: { v: 0, p: 0, a: 0, plan: 0, der: 0, nov: 0 } }); });
    ok((await filas('sin')) === sin + 1 && (await filas('derivadas')) === der, 'una empresa sin acciones aparece en "Sin derivar" y no en "Derivadas"');
    ok(altas > 0 && altas <= der, 'Con altas (' + altas + ') es parte de las derivadas');
    ok(/\(6\)/.test(await p.evaluate(() => document.getElementById('ges-emp-f').options[0].textContent)), 'cada opción dice cuántas empresas tiene');
    await p.evaluate(() => { GES.fEmp = 'sin'; GES.qEmp = 'zzzz'; gesEmpPintar(); });
    ok(/ese filtro/.test(await p.evaluate(() => document.getElementById('ges-emp-tb').textContent)), 'sin coincidencias avisa');
    await p.context().close().catch(() => {});
  }
  for (const quien of Object.keys(TABS)) {
    for (const [w, h] of ANCHOS) {
      const p = await G.abrirComo(browser, quien, { w, h, touch: w < 800 });
      for (const t of TABS[quien]) {
        await p.evaluate((x) => gesIr(x), t);
        await quieto(900);
        const r = await p.evaluate(medir);
        ok(r.length === 0, quien + ' · ' + t + ' · ' + w + 'px' + (r.length ? ' → ' + r.slice(0, 4).join(' | ') : ''));
        if (w === 1366 || w === 390) await p.screenshot({ path: __dirname + '/capturas/t95_' + quien + '_' + t + '_' + w + '.png' }).catch(() => {});
      }
      await p.context().close().catch(() => {});
    }
  }
};
