// Cambiar de cuenta de prueba sin salir: entrás con UNA y desde el menú del
// nombre saltás a las otras. El permiso lo da el servidor (auth-admin), que
// sólo deja si quien pide es admin o cuenta de prueba y el destino es una
// cuenta de prueba. En el navegador no se guarda ninguna clave ni sesión ajena.
const { abrir, nube } = require('./nube.cjs');
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); };
const espera = (p, fn) => p.waitForFunction(fn, null, { timeout: 15000 }).then(() => true, () => false);
const OTRO = '00000000-0000-4000-8000-00000000beef';
const OTRO2 = '00000000-0000-4000-8000-00000000cafe';

module.exports = async (browser) => {
  nube.cuentasPrueba = [
    { id: OTRO, full_name: 'Nicolas Ferrari', email: 'pruebahunter@bancogalicia.com.ar', role: 'hunter' },
    { id: OTRO2, full_name: 'Martin Romero', email: 'pruebalider@bancogalicia.com.ar', role: 'lider' },
  ];

  // ── Desde una cuenta de prueba ──
  nube.esPrueba = true;
  nube.llamadasAdmin = [];
  const p = await abrir(browser, { rol: 'asesor' });
  ok(await espera(p, () => { const e = document.getElementById('hdr-dd-cuentas'); return e && /Cambiar de cuenta/.test(e.innerHTML); }),
    'una cuenta de prueba ve "Cambiar de cuenta" en el menú del nombre');
  let h = await p.evaluate(() => document.getElementById('hdr-dd-cuentas').innerHTML);
  ok(/Nicolas Ferrari/.test(h) && /Hunter/.test(h) && /Martin Romero/.test(h) && /L&iacute;der|Líder/.test(h),
    'con las otras cuentas y el perfil de cada una');
  ok(!/Asesor Prueba/.test(h), 'y sin ofrecerse a sí misma');
  ok(nube.llamadasAdmin.some((x) => x.action === 'cuentas_prueba'), 'la lista la pide al servidor, no la tiene guardada');
  ok(await p.evaluate(() => !localStorage.getItem('fg_cuentas_prueba')), 'no queda ninguna sesión guardada en el navegador');

  // ── Cambiar: pide el permiso al servidor y lo canjea ──
  await p.evaluate(() => {
    window.__otp = [];
    _sb.auth.verifyOtp = function (a) { window.__otp.push(a); return new Promise(function () {}); }; // queda pendiente: no recarga
  });
  nube.llamadasAdmin = [];
  await p.evaluate((id) => _cpIr(id), OTRO);
  ok(await espera(p, () => window.__otp.length === 1), 'al tocar una cuenta se canjea el permiso');
  const llamada = nube.llamadasAdmin.filter((x) => x.action === 'entrar_como');
  ok(llamada.length === 1 && llamada[0].uid === OTRO, 'se le pidió al servidor el permiso para esa cuenta');
  const otp = await p.evaluate(() => window.__otp[0]);
  ok(otp && otp.token_hash === 'th-' + OTRO && otp.type === 'magiclink', 'y se canjea el permiso de un solo uso que mandó el servidor');
  await p.evaluate((id) => _cpIr(id), OTRO2);
  ok(await p.evaluate(() => window.__otp.length) === 1 && nube.llamadasAdmin.filter((x) => x.action === 'entrar_como').length === 1,
    'tocar otra mientras está cambiando no pide un segundo permiso');
  ok(!p.errores.length, 'sin errores de JavaScript (' + p.errores.join(' | ') + ')');
  await p.context().close();

  // ── Un destino que no es cuenta de prueba: el servidor lo rechaza ──
  nube.llamadasAdmin = [];
  const r = await abrir(browser, { rol: 'asesor' });
  await espera(r, () => document.getElementById('hdr-dd-cuentas') && _CP.lista !== null);
  await r.evaluate(() => { _CP.lista.push({ id: 'no-es-de-prueba', full_name: 'Alguien Real', role: 'vip' }); _cpRender(); });
  await r.evaluate(() => _cpIr('no-es-de-prueba'));
  ok(await espera(r, () => /No se pudo cambiar de cuenta/.test(document.body.innerText)), 'pedir una cuenta que no es de prueba se rechaza y se avisa');
  await r.context().close();

  // ── Una cuenta común no ve nada de esto ──
  nube.esPrueba = false;
  nube.llamadasAdmin = [];
  const q = await abrir(browser, { rol: 'asesor' });
  await espera(q, () => document.getElementById('hdr-user') && document.getElementById('hdr-user').textContent);
  await q.waitForTimeout(600);
  ok(await q.evaluate(() => { const e = document.getElementById('hdr-dd-cuentas'); return !e || e.style.display === 'none'; }),
    'una cuenta común no ve el cambiador');
  ok(!nube.llamadasAdmin.some((x) => x.action === 'cuentas_prueba'), 'y ni siquiera le pregunta al servidor');
  await q.context().close();
};
