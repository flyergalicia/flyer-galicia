import { readFileSync } from 'fs';
const TOKEN = process.env.SB_TOKEN;
const REF = 'cajyjnxjbobdpltflgnb';
const SLUG = 'auth-admin';
const API = 'https://api.supabase.com';
const H = { 'Authorization': 'Bearer ' + TOKEN };

const mode = process.argv[2] || 'info';

async function getFn() {
  const r = await fetch(`${API}/v1/projects/${REF}/functions/${SLUG}`, { headers: H });
  return { status: r.status, body: await r.text() };
}

if (mode === 'info') {
  const r = await getFn();
  console.log('GET function ->', r.status);
  console.log(r.body);
} else if (mode === 'deploy') {
  // Preservar verify_jwt del estado actual.
  const cur = await getFn();
  let verifyJwt = false;
  try { verifyJwt = !!JSON.parse(cur.body).verify_jwt; } catch {}
  console.log('verify_jwt actual:', verifyJwt);

  const code = readFileSync(new URL('./functions/auth-admin/index.ts', import.meta.url), 'utf8');
  const fd = new FormData();
  fd.append('metadata', JSON.stringify({
    name: SLUG,
    entrypoint_path: 'index.ts',
    verify_jwt: verifyJwt,
  }));
  fd.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts');

  const r = await fetch(`${API}/v1/projects/${REF}/functions/deploy?slug=${SLUG}`, {
    method: 'POST', headers: H, body: fd,
  });
  console.log('DEPLOY ->', r.status);
  console.log(await r.text());
}
