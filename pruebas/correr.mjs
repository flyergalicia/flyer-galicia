// Corre las pruebas automáticas del armador (ver LEEME.md).
// Uso:  node pruebas/correr.mjs            → todas
//       node pruebas/correr.mjs t39 t41    → sólo esas (alcanza con el comienzo del nombre)
//       node pruebas/correr.mjs --detalle  → muestra todo lo que imprime cada prueba
// Cada prueba corre en su propio proceso (la nube simulada guarda estado y no
// se tiene que mezclar entre pruebas). Antes de correrlas hay que armar con
// `node _build.mjs`: se prueba index.html, no _source.html.
import { readdirSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { homedir } from 'os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PROYECTO = resolve(AQUI, '..');
const PUERTO = 8765;
const args = process.argv.slice(2);
const detalle = args.includes('--detalle');
const filtros = args.filter((a) => !a.startsWith('--'));

// ── Playwright y Chromium: de la variable PLAYWRIGHT, o de la caché de npx ──
function buscarPlaywright() {
  if (process.env.PLAYWRIGHT && existsSync(process.env.PLAYWRIGHT)) return process.env.PLAYWRIGHT;
  const bases = [join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx'), join(homedir(), '.npm', '_npx')];
  let mejor = null, fecha = 0;
  for (const b of bases) {
    if (!existsSync(b)) continue;
    for (const d of readdirSync(b)) {
      const p = join(b, d, 'node_modules', 'playwright');
      if (existsSync(join(p, 'package.json'))) { const t = statSync(p).mtimeMs; if (t > fecha) { fecha = t; mejor = p; } }
    }
  }
  return mejor;
}
function buscarChromium() {
  if (process.env.CHROMIUM && existsSync(process.env.CHROMIUM)) return process.env.CHROMIUM;
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.LOCALAPPDATA || join(homedir(), '.cache'), 'ms-playwright');
  if (!existsSync(b)) return null;
  const cands = readdirSync(b).filter((d) => /^chromium-\d+$/.test(d)).sort((x, y) => +y.split('-')[1] - +x.split('-')[1]);
  for (const d of cands) {
    for (const exe of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      if (existsSync(join(b, d, exe))) return join(b, d, exe);
    }
  }
  return null;
}

// ── Modo "una prueba" (lo llama el proceso principal) ──
if (args[0] === '--una') {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const pw = require(process.env.FG_PLAYWRIGHT);
  const browser = await pw.chromium.launch(process.env.FG_CHROMIUM ? { executablePath: process.env.FG_CHROMIUM } : {});
  try { await require(join(AQUI, args[1]))(browser); }
  catch (e) { console.log('ERROR', (e && e.message || String(e)).split('\n')[0]); process.exitCode = 1; }
  finally { await browser.close(); }
  process.exit();
}

// ── Servidor local del proyecto (index.html no anda por file://) ──
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
function servir() {
  return new Promise((res) => {
    const srv = createServer(async (req, resp) => {
      try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const f = resolve(join(PROYECTO, p));
        if (!f.startsWith(PROYECTO)) { resp.writeHead(403); resp.end(); return; }
        const buf = await readFile(f);
        resp.writeHead(200, { 'Content-Type': TIPOS[(f.match(/\.[a-z]+$/i) || [''])[0].toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        resp.end(buf);
      } catch { resp.writeHead(404); resp.end('404'); }
    });
    srv.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.log(`(el puerto ${PUERTO} ya está en uso: se usa ese servidor)`); res(null); } else throw e; });
    srv.listen(PUERTO, '127.0.0.1', () => res(srv));
  });
}

const PW = buscarPlaywright(), CH = buscarChromium();
if (!PW) { console.log('No encontré Playwright. Instalalo una vez con:  npx -y playwright@latest install chromium\n(o indicá dónde está con la variable PLAYWRIGHT).'); process.exit(1); }
// t…_*.cjs = con navegador; u…_*.mjs = sin navegador (lógica suelta, por ejemplo de las Edge Functions)
const todas = readdirSync(AQUI).filter((f) => /^t\d+_.*\.cjs$/.test(f) || /^u\d+_.*\.mjs$/.test(f)).sort();
const elegidas = filtros.length ? todas.filter((f) => filtros.some((x) => f.startsWith(x))) : todas;
if (!elegidas.length) { console.log('No hay pruebas con ese nombre.'); process.exit(1); }
const srv = await servir();
console.log(`Corriendo ${elegidas.length} prueba(s)…\n`);
const resumen = [];
for (const f of elegidas) {
  const t0 = Date.now();
  const salida = await new Promise((res) => {
    const ch = spawn(process.execPath, f.endsWith('.mjs') ? ['--no-warnings', join(AQUI, f)] : [fileURLToPath(import.meta.url), '--una', f], { env: { ...process.env, FG_PLAYWRIGHT: PW, FG_CHROMIUM: CH || '' } });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    ch.on('close', (code) => res({ out, code }));
  });
  const lineas = salida.out.split(/\r?\n/);
  const fallas = lineas.filter((l) => /^\s*FALLA|^ERROR|^PAGEERROR|errores( admin)?: [1-9]/.test(l));
  const oks = lineas.filter((l) => /^\s*OK\s/.test(l)).length;
  const bien = !fallas.length && salida.code === 0;
  resumen.push({ f, bien });
  console.log(`${bien ? '✓' : '✗'} ${f.replace(/\.cjs$/, '')}  (${oks} comprobaciones, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (detalle) console.log(lineas.filter((l) => l && !/^CONSOLE /.test(l)).map((l) => '    ' + l).join('\n'));
  else fallas.forEach((l) => console.log('    ' + l.trim()));
}
if (srv) srv.close();
const mal = resumen.filter((r) => !r.bien);
console.log(`\n${resumen.length - mal.length} de ${resumen.length} pruebas bien.` + (mal.length ? ' Con problemas: ' + mal.map((r) => r.f.replace(/\.cjs$/, '')).join(', ') : ''));
process.exit(mal.length ? 1 : 0);
