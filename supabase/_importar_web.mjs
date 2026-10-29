// Manda a la función benchmark-sync lo que se leyó en el navegador de la app (carga asistida
// de Santander o Macro). Uso:
//   node supabase/_importar_web.mjs santander <archivo.json>
//   node supabase/_importar_web.mjs macro <archivo.json>
// <archivo.json> es una lista (array): para Santander, las respuestas de /bff-benefits/brands/{id}
// tal como las pidió la página; para Macro, [{comercio, categoria, cuotas, segmento}].
// Necesita SB_TOKEN en el entorno (para leer la clave del cron del Vault). La clave nunca se
// imprime ni se guarda en un archivo.
import { readFileSync } from 'fs';
const TOKEN = process.env.SB_TOKEN;
const REF = 'cajyjnxjbobdpltflgnb';
const [banco, archivo] = process.argv.slice(2);
if (!TOKEN) { console.error('Falta SB_TOKEN en el entorno.'); process.exit(1); }
if (!['santander', 'macro', 'icbc'].includes(banco) || !archivo) { console.error('Uso: node supabase/_importar_web.mjs santander|macro|icbc <archivo.json>'); process.exit(1); }
const items = JSON.parse(readFileSync(archivo, 'utf8'));
if (!Array.isArray(items) || !items.length) { console.error('El archivo tiene que ser una lista con al menos un elemento.'); process.exit(1); }

const q = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "select decrypted_secret from vault.decrypted_secrets where name = 'bench_cron_secret'" }),
});
const filas = await q.json();
const clave = Array.isArray(filas) && filas[0] && filas[0].decrypted_secret;
if (!clave) { console.error('No se pudo leer la clave del cron (HTTP ' + q.status + ').'); process.exit(1); }

const r = await fetch(`https://${REF}.supabase.co/functions/v1/benchmark-sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-cron-secret': clave },
  body: JSON.stringify({ action: 'importar_web', banco, items }),
});
const texto = await r.text();
console.log('HTTP', r.status, texto.slice(0, 600));
if (!r.ok) process.exit(1);
