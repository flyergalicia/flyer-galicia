// Cambiar de cuenta de prueba sin salir: el navegador se acuerda de las sesiones
// de las cuentas marcadas como de prueba y el menú del nombre deja saltar de una
// a otra. Nunca se guarda una cuenta común, y al salir se borra todo.
const { abrir, nube } = require('./nube.cjs');
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); };
const espera = (p, fn) => p.waitForFunction(fn, null, { timeout: 15000 }).then(() => true, () => false);
const CLAVE = 'fg_cuentas_prueba';

module.exports = async (browser) => {
  // ── Una cuenta de prueba: al entrar, su sesión queda guardada ──
  nube.esPrueba = true;
  const p = await abrir(browser, { rol: 'asesor' });
  ok(await espera(p, () => { try { return Object.keys(JSON.parse(localStorage.getItem('fg_cuentas_prueba') || '{}')).length === 1; } catch (e) { return false; } }),
    'al entrar con una cuenta de prueba, su sesión queda guardada');
  const guardada = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fg_cuentas_prueba')))[0]);
  ok(guardada && guardada.refresh_token && guardada.nombre === 'Asesor Prueba' && guardada.rol === 'asesor',
    'con su nombre, su perfil y lo que hace falta para volver a entrar');

  // ── Con otra cuenta guardada aparece el cambiador ──
  await p.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('fg_cuentas_prueba'));
    o['00000000-0000-4000-8000-00000000beef'] = { nombre: 'Nicolas Ferrari', email: 'pruebahunter@bancogalicia.com.ar', rol: 'hunter', at: Date.now(), access_token: 'a', refresh_token: 'r' };
    localStorage.setItem('fg_cuentas_prueba', JSON.stringify(o));
    _cpRender();
  });
  let h = await p.evaluate(() => { const e = document.getElementById('hdr-dd-cuentas'); return e ? e.innerHTML : ''; });
  ok(/Cambiar de cuenta/.test(h) && /Nicolas Ferrari/.test(h) && /Hunter/.test(h), 'el menú ofrece la otra cuenta con su perfil');
  ok(!/Asesor Prueba/.test(h), 'y no se ofrece a sí mismo');
  ok(await p.evaluate(() => document.getElementById('hdr-dd-cuentas').style.display !== 'none'), 'el bloque se ve');

  // ── Una sesión que ya no sirve se olvida y avisa, sin romper nada ──
  await p.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('fg_cuentas_prueba'));
    delete o['00000000-0000-4000-8000-00000000beef'].refresh_token;
    localStorage.setItem('fg_cuentas_prueba', JSON.stringify(o));
    _cpIr('00000000-0000-4000-8000-00000000beef');
  });
  ok(await espera(p, () => /Entrá con su clave|ya no está guardada/.test(document.body.innerText)), 'una sesión caducada avisa que hay que entrar con la clave');
  h = await p.evaluate(() => { const e = document.getElementById('hdr-dd-cuentas'); return e ? e.innerHTML : ''; });
  ok(!/Nicolas Ferrari/.test(h), 'y esa cuenta se saca de la lista');
  ok(!p.errores.length, 'sin errores de JavaScript (' + p.errores.join(' | ') + ')');

  // ── Salir borra todas las cuentas guardadas ──
  await p.evaluate(() => _cpOlvidarTodo());
  ok(await p.evaluate(() => !localStorage.getItem('fg_cuentas_prueba')), 'al salir no queda ninguna sesión guardada');
  await p.context().close();

  // ── Una cuenta COMÚN nunca se guarda ──
  nube.esPrueba = false;
  const q = await abrir(browser, { rol: 'asesor' });
  await espera(q, () => document.getElementById('hdr-user') && document.getElementById('hdr-user').textContent);
  await q.waitForTimeout(600);
  ok(await q.evaluate(() => !localStorage.getItem('fg_cuentas_prueba')), 'una cuenta común no se guarda nunca');
  ok(await q.evaluate(() => { const e = document.getElementById('hdr-dd-cuentas'); return !e || e.style.display === 'none'; }), 'y no ve el cambiador de cuentas');
  await q.context().close();
};
