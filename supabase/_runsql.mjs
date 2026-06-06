import { readFileSync } from 'fs';
const TOKEN = process.env.SB_TOKEN;
const REF = 'cajyjnxjbobdpltflgnb';
const file = process.argv[2];
const sql = readFileSync(file, 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('HTTP', res.status);
console.log(text);
