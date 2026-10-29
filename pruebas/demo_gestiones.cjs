// Demo de Gestiones v2 para probar a mano, SIN tocar la plataforma: abre
// ventanas de navegador reales con la nube simulada (pruebas/nube_gestiones.cjs)
// y datos inventados. Lo que hace una persona lo ve la otra en vivo.
// Uso (desde la carpeta del proyecto, después de `node _build.mjs`):
//   node pruebas/demo_gestiones.cjs                → Oficial, Hunter y Líder
//   node pruebas/demo_gestiones.cjs oficial hunter2 → sólo esas personas
// Personas: oficial (Mariana, VIP), oficial2 (Diego), hunter (Sofía),
// hunter2 (Tomás), hunter3 (Julia), lider (Laura), admin.
// Para terminar: cerrá las ventanas o Ctrl+C en la consola.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const PROYECTO = path.resolve(__dirname, '..'), PUERTO = 8765;

function buscarPlaywright() {
  if (process.env.PLAYWRIGHT && fs.existsSync(process.env.PLAYWRIGHT)) return process.env.PLAYWRIGHT;
  let mejor = null, fecha = 0;
  for (const b of [path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx'), path.join(os.homedir(), '.npm', '_npx')]) {
    if (!fs.existsSync(b)) continue;
    for (const d of fs.readdirSync(b)) {
      const p = path.join(b, d, 'node_modules', 'playwright');
      if (fs.existsSync(path.join(p, 'package.json'))) { const t = fs.statSync(p).mtimeMs; if (t > fecha) { fecha = t; mejor = p; } }
    }
  }
  return mejor;
}
function buscarChromium() {
  if (process.env.CHROMIUM && fs.existsSync(process.env.CHROMIUM)) return process.env.CHROMIUM;
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'ms-playwright');
  if (!fs.existsSync(b)) return null;
  const cands = fs.readdirSync(b).filter((d) => /^chromium-\d+$/.test(d)).sort((x, y) => +y.split('-')[1] - +x.split('-')[1]);
  for (const d of cands) for (const exe of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'])
    if (fs.existsSync(path.join(b, d, exe))) return path.join(b, d, exe);
  return null;
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
function servir() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = path.resolve(path.join(PROYECTO, p));
      if (!f.startsWith(PROYECTO)) { resp.writeHead(403); resp.end(); return; }
      fs.readFile(f, (e, buf) => {
        if (e) { resp.writeHead(404); resp.end('404'); return; }
        resp.writeHead(200, { 'Content-Type': TIPOS[(f.match(/\.[a-z]+$/i) || [''])[0].toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); resp.end(buf);
      });
    });
    srv.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.log('(El puerto ' + PUERTO + ' ya está en uso: se usa ese servidor. Si la demo no carga, cerrá las pruebas que estén corriendo.)'); res(null); } else throw e; });
    srv.listen(PUERTO, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const PW = buscarPlaywright(), CH = buscarChromium();
  if (!PW) { console.log('No encontré Playwright. Instalalo una vez con:  npx -y playwright@latest install chromium'); process.exit(1); }
  const pw = require(PW), G = require('./nube_gestiones.cjs');
  const quienes = process.argv.slice(2).length ? process.argv.slice(2) : ['oficial', 'hunter', 'lider'];
  const malos = quienes.filter((q) => !G.USERS[q]);
  if (malos.length) { console.log('No conozco a: ' + malos.join(', ') + '. Personas: ' + Object.keys(G.USERS).join(', ')); process.exit(1); }
  const srv = await servir();
  // DEMO_CHEQUEO=1: sin ventanas, abre todo y se cierra (para revisar que la demo arranca).
  const chequeo = !!process.env.DEMO_CHEQUEO;
  const browser = await pw.chromium.launch(Object.assign({ headless: chequeo || !!process.env.DEMO_CAPTURAS, args: ['--window-size=1300,860'] }, CH ? { executablePath: CH } : {}));
  // DEMO_CAPTURAS=1: arma las capturas de pruebas/capturas_gestiones_v2.cjs y se cierra.
  if (process.env.DEMO_CAPTURAS) { await require('./capturas_gestiones_v2.cjs')(browser); await browser.close(); if (srv) srv.close(); process.exit(0); }
  G.sembrar();
  console.log('\nDemo de Gestiones (datos inventados, nada sale a la plataforma). Abriendo: ' + quienes.map((q) => G.USERS[q].name).join(', ') + '…');
  const paginas = [];
  for (const q of quienes) {
    const p = await G.abrirComo(browser, q, { w: 1280, h: 780 });
    // Los avisos (mensajes nuevos, por asignar) se refrescan cada 15 s en la demo.
    await p.evaluate(() => { setInterval(function () { if (typeof _gesAvisoCargar === 'function') _gesAvisoCargar(); }, 15000); document.title = 'Demo · ' + (window._myName || '') + ' · Gestiones'; });
    paginas.push(p);
  }
  console.log([
    '',
    'Qué probar:',
    '  OFICIAL (Mariana Costa):',
    '   · Gestiones: el CUIT al lado de cada empresa; "1 mensaje nuevo" en ALIMENTOS DEL SUR (Sofía preguntó algo).',
    '   · Mis empresas → Derivar: tipo "Base de datos" (pegá una lista de Excel), o "Que la asigne el líder".',
    '   · Derivá algo a Sofía HOY de 16 a 18: no deja (ya tiene algo de 15 a 17) y te muestra quién está libre.',
    '  HUNTER (Sofía Paz):',
    '   · Mi agenda: "Para contactar hoy" y lo de la semana.',
    '   · Abrí ALIMENTOS DEL SUR: respondé en la conversación o tocá "No puedo ir".',
    '   · TEXTIL ARGENTA: pasá a alguien a Alta (pregunta con o sin paquete) o a Descartado (pregunta el motivo).',
    '  LÍDER (Laura Méndez):',
    '   · Agenda del equipo: bandejas "Por asignar" y "Piden que se la pasen a otro"; tocá Asignar / Cambiar hunter.',
    '',
    'Los avisos entre ventanas llegan solos cada 15 segundos (o cambiando de solapa).',
    'Para terminar: cerrá las ventanas o Ctrl+C acá.',
  ].join('\n'));
  if (chequeo) {
    const errores = paginas.reduce((s, p) => s + p.errores.length, 0);
    console.log('\nCHEQUEO: ' + paginas.length + ' ventanas abiertas en Gestiones, errores: ' + errores);
    await browser.close(); if (srv) srv.close(); process.exit(errores ? 1 : 0);
  }
  let abiertas = paginas.length;
  paginas.forEach((p) => p.on('close', () => { if (--abiertas <= 0) { browser.close().catch(() => {}); if (srv) srv.close(); process.exit(0); } }));
  browser.on('disconnected', () => { if (srv) srv.close(); process.exit(0); });
})().catch((e) => { console.log('No se pudo abrir la demo: ' + ((e && e.message) || e)); process.exit(1); });
