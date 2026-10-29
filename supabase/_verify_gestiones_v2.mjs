// Verificación de la migración 045 SIN tocar Supabase: corre las migraciones de
// Gestiones (014, 015, 016, 017, 027, 030) y la 045 en un Postgres local (PGlite)
// con lo mínimo de Supabase simulado (auth.uid, roles) y prueba las reglas
// nuevas como cada persona, con la RLS de verdad (45 comprobaciones).
// Necesita PGlite instalado en una carpeta aparte (no se versiona):
//   npm install @electric-sql/pglite@0.2.17   (en esa carpeta)
//   PGLITE=<esa carpeta>/node_modules/@electric-sql/pglite node supabase/_verify_gestiones_v2.mjs
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(join(process.env.PGLITE, 'dist', 'index.js')).href : '@electric-sql/pglite');

const RAIZ = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mig = (n) => readFileSync(join(RAIZ, 'supabase', 'migrations', n), 'utf8');
const db = new PGlite();
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  OK  ' : '  FALLA ') + m); if (!c) fallas++; };

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function auth.role() to authenticated, anon;
create table public.profiles(id uuid primary key references auth.users(id), role text, status text default 'active', full_name text, email text, suplente_id uuid);
create function public.get_my_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id = auth.uid() $$;
create function public.is_active() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id = auth.uid() and status = 'active') $$;
create table public.padron_empresas(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), empresa text not null default '', cuits text[] not null default '{}', config text not null default '', asesores jsonb not null default '[]', created_at timestamptz default now());
alter table public.padron_empresas enable row level security;
create policy "padron propio: ver" on public.padron_empresas for select using (auth.uid() = user_id);
`);
for (const n of ['014_gestiones.sql', '015_gestiones_lista.sql', '016_gestiones_ajustes.sql', '017_gestiones_avisos.sql', '027_gestiones_paquetes.sql', '030_gestiones_agenda.sql']) await db.exec(mig(n));
// De la 032 sólo lo que usa gestiones_empresas
await db.exec(`
create or replace function public.soy_prueba() returns boolean language sql security definer stable set search_path = public as $$ select coalesce((select es_prueba from public.profiles where id = auth.uid()), false) $$;
create or replace function public.ids_prueba() returns uuid[] language sql security definer stable set search_path = public as $$ select coalesce(array_agg(id), '{}'::uuid[]) from public.profiles where es_prueba $$;
update public.app_flags set valor = 'on' where clave = 'gestiones';
`);
// Una gestión vieja (antes de la 045) para ver que se le completa el CUIT.
const U = { of: 'a0000000-0000-4000-8000-000000000001', of2: 'a0000000-0000-4000-8000-000000000002', h1: 'b0000000-0000-4000-8000-000000000001', h2: 'b0000000-0000-4000-8000-000000000002', h3: 'b0000000-0000-4000-8000-000000000003', li: 'c0000000-0000-4000-8000-000000000001', li2: 'c0000000-0000-4000-8000-000000000002' };
await db.exec(`
insert into auth.users values ('${U.of}'),('${U.of2}'),('${U.h1}'),('${U.h2}'),('${U.h3}'),('${U.li}'),('${U.li2}');
insert into public.profiles(id, role, full_name, lider_id) values ('${U.li}','lider','Laura',null),('${U.li2}','lider','Otra',null),('${U.of}','vip','Mariana','${U.li}'),('${U.of2}','asesor','Diego','${U.li}'),('${U.h1}','hunter','Sofía','${U.li}'),('${U.h2}','hunter','Tomás','${U.li}'),('${U.h3}','hunter','Julia','${U.li2}');
insert into public.padron_empresas(user_id, empresa, cuits) values ('${U.of}','ACME SA','{30900001118}'),('${U.of}','BETA SRL','{30900002114,30712345678}'),('${U.of2}','GAMA SA','{30900007116}');
select set_config('request.jwt.claim.sub', '${U.of}', false);
insert into public.gestiones(empresa, empresa_key, dueno_id, hunter_id, creada_por, origen, tipo, fecha, estado) values ('ACME SA','acme sa','${U.of}','${U.h1}','${U.of}','derivada','accion', current_date - 10, 'realizada');
select set_config('request.jwt.claim.sub', '', false);
`);
await db.exec(mig('045_gestiones_v2.sql'));
ok(true, 'la migración 045 corre sobre las anteriores de Gestiones');
await db.exec(mig('045_gestiones_v2.sql'));
ok(true, 'y se puede volver a correr (idempotente)');
ok((await db.query(`select cuit from public.gestiones where empresa = 'ACME SA'`)).rows[0].cuit === '30900001118', 'a las gestiones viejas se les completa el CUIT');

await db.exec(`grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;`);
// Correr como una persona: con su sesión y con la RLS (rol authenticated).
async function como(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { const r = await db.query(sql, params || []); return { rows: r.rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role;'); }
}
const hoy = (await db.query('select current_date::text d')).rows[0].d;

// Oficial deriva a Sofía con horario; el CUIT se copia
let r = await como(U.of, `insert into public.gestiones(empresa, origen, hunter_id, tipo, estado, fecha, hora_desde, hora_hasta) values ('BETA SRL','derivada','${U.h1}','posicion','planificada','${hoy}','10:00','12:00') returning id, cuit`);
ok(!r.error && r.rows[0].cuit === '30900002114,30712345678', 'derivar copia el CUIT (los dos) del padrón ' + (r.error || ''));
const g1 = r.rows && r.rows[0].id;
// Pisar el horario: el oficial no puede
r = await como(U.of, `insert into public.gestiones(empresa, origen, hunter_id, tipo, estado, fecha, hora_desde, hora_hasta) values ('ACME SA','derivada','${U.h1}','accion','planificada','${hoy}','11:00','13:00') returning id`);
ok(r.error && /GES_PISA/.test(r.error) && /10:00 a 12:00/.test(r.error), 'el oficial no puede pisar el horario del hunter (' + (r.error || 'sin error') + ')');
r = await como(U.of, `insert into public.gestiones(empresa, origen, hunter_id, tipo, estado, fecha, hora_desde, hora_hasta) values ('ACME SA','derivada','${U.h1}','accion','planificada','${hoy}','12:00','13:00') returning id`);
ok(!r.error, 'justo cuando termina la otra sí se puede');
r = await como(U.of, `insert into public.gestiones(empresa, origen, hunter_id, tipo, estado, fecha, vence) values ('ACME SA','derivada','${U.h1}','datos','planificada','${hoy}', current_date + 10) returning id`);
ok(!r.error, 'una base de datos no tiene horario y no se pisa con nada');
const gDatos = r.rows && r.rows[0].id;
// El líder sí puede pisarlo (lo decide él)
r = await como(U.li, `insert into public.gestiones(empresa, dueno_id, origen, hunter_id, tipo, estado, fecha, hora_desde, hora_hasta) values ('GAMA SA','${U.of2}','derivada','${U.h1}','accion','planificada','${hoy}','10:30','11:30') returning id, dueno_id`);
ok(!r.error && r.rows[0].dueno_id === U.of2, 'el líder de ese hunter sí puede, y asigna en empresas de otro oficial ' + (r.error || ''));
// Por asignar
r = await como(U.of, `insert into public.gestiones(empresa, origen, hunter_id, lider_id, tipo, estado, fecha) values ('ACME SA','derivada',null,'${U.li}','feria','planificada','${hoy}') returning id`);
ok(!r.error, 'el oficial la manda al líder sin hunter ' + (r.error || ''));
const gPA = r.rows && r.rows[0].id;
r = await como(U.of, `insert into public.gestiones(empresa, origen, hunter_id, lider_id, tipo, estado, fecha) values ('ACME SA','derivada',null,'${U.h2}','feria','planificada','${hoy}')`);
ok(r.error && /líder/.test(r.error), 'sin hunter, el "líder" tiene que ser un líder');
r = await como(U.li, `select count(*)::int n from public.gestiones where hunter_id is null`);
ok(r.rows && r.rows[0].n === 1, 'el líder ve lo que le mandaron para asignar');
r = await como(U.li2, `select count(*)::int n from public.gestiones where id = '${gPA}'`);
ok(r.rows && r.rows[0].n === 0, 'otro líder no lo ve');
// El líder asigna (a uno de su equipo sí; a uno de otro equipo no)
r = await como(U.li, `update public.gestiones set hunter_id = '${U.h3}' where id = '${gPA}' returning hunter_id`);
ok(r.rows && r.rows[0].hunter_id === null, 'el líder no puede dársela a un hunter de otro equipo');
r = await como(U.li, `update public.gestiones set hunter_id = '${U.h2}', hora_desde = '15:00' where id = '${gPA}' returning hunter_id, visto_hunter`);
ok(r.rows && r.rows[0].hunter_id === U.h2 && r.rows[0].visto_hunter === false, 'el líder se la asigna a Tomás y a Tomás le aparece como nueva');
// El hunter no puede pasársela a otro
r = await como(U.h1, `update public.gestiones set hunter_id = '${U.h2}' where id = '${g1}' returning hunter_id`);
ok(r.rows && r.rows[0].hunter_id === U.h1, 'el hunter no puede pasársela a otro');
// Tampoco en lo que registró él
r = await como(U.h1, `insert into public.gestiones(empresa, dueno_id, origen, tipo, estado, fecha) values ('ACME SA','${U.of}','propia','accion','realizada', current_date - 1) returning id`);
const gProp = r.rows && r.rows[0].id;
r = await como(U.h1, `update public.gestiones set hunter_id = '${U.h2}', estado = 'planificada' where id = '${gProp}' returning hunter_id`);
ok(r.rows && r.rows[0].hunter_id === U.h1, 'ni en lo que registró él');
// El oficial que la derivó sí, mientras no esté realizada
r = await como(U.of, `update public.gestiones set hunter_id = '${U.h2}' where id = '${gDatos}' returning hunter_id`);
ok(r.rows && r.rows[0].hunter_id === U.h2, 'el oficial que la derivó se la puede pasar a otro');
await como(U.h2, `update public.gestiones set estado = 'realizada' where id = '${gDatos}'`);
r = await como(U.of, `update public.gestiones set hunter_id = '${U.h1}' where id = '${gDatos}' returning hunter_id`);
ok(r.rows && r.rows[0].hunter_id === U.h2, 'una vez realizada, el oficial ya no');
// "No puedo ir"
r = await como(U.h1, `select public.gestion_no_puedo('${g1}', 'Tengo médico')`);
ok(!r.error, 'el hunter avisa que no puede ' + (r.error || ''));
r = await como(U.of, `select no_puede_at is not null np, no_puede_motivo m from public.gestiones where id = '${g1}'`);
ok(r.rows && r.rows[0].np && r.rows[0].m === 'Tengo médico', 'el oficial ve el aviso con el motivo');
r = await como(U.h1, `update public.gestiones set no_puede_at = null where id = '${g1}' returning no_puede_at`);
ok(r.rows && r.rows[0].no_puede_at !== null, 'el aviso no se borra a mano');
r = await como(U.h2, `select public.gestion_no_puedo('${g1}', 'x')`);
ok(r.error, 'otro hunter no puede avisar por él');
// Mensajes
r = await como(U.of, `select * from public.gestiones_mensajes_nuevos()`);
ok(r.rows && r.rows.length === 1 && r.rows[0].no_puedo === true && r.rows[0].ultimo_autor === U.h1, 'al oficial le llega el "no puedo" como mensaje nuevo');
r = await como(U.li, `select * from public.gestiones_mensajes_nuevos()`);
ok(r.rows && r.rows.some((x) => x.gestion_id === g1), 'y al líder del hunter también');
await como(U.of, `select public.gestion_mensaje_enviar('${g1}', 'No hay problema, la paso')`);
r = await como(U.of, `select * from public.gestiones_mensajes_nuevos()`);
ok(r.rows && r.rows.length === 0, 'al escribir, quedan leídos los de antes');
r = await como(U.h1, `select * from public.gestiones_mensajes_nuevos()`);
ok(r.rows && r.rows.length === 1 && r.rows[0].ultimo_autor === U.of, 'al hunter le llega la respuesta');
r = await como(U.h1, `insert into public.gestion_mensajes(gestion_id, autor, texto) values ('${g1}', '${U.of}', 'trucho')`);
ok(r.error, 'nadie inserta mensajes directo (ni a nombre de otro)');
r = await como(U.h3, `select count(*)::int n from public.gestion_mensajes where gestion_id = '${g1}'`);
ok(r.rows && r.rows[0].n === 0, 'quien no ve la acción no ve la conversación');
r = await como(U.h3, `select public.gestion_mensaje_enviar('${g1}', 'hola')`);
ok(r.error, 'ni puede escribir en ella');
// Prospectos: alta con paquete, descarte con motivo
r = await como(U.h1, `insert into public.gestion_prospectos(gestion_id, nombre, estado) values ('${g1}', 'Ana', 'alta')`);
ok(r.error && /GES_PAQ/.test(r.error), 'un alta sin paquete no entra');
r = await como(U.h1, `insert into public.gestion_prospectos(gestion_id, nombre, estado, paquete, contacto, referencia) values ('${g1}', 'Ana', 'alta', 'caja', ' 11 5555 ', 'Legajo 1') returning id, contacto, fecha_alta`);
ok(!r.error && r.rows[0].contacto === '11 5555' && r.rows[0].fecha_alta, 'con paquete (sin paquete = Caja de Ahorro) sí, con contacto y referencia');
const pA = r.rows && r.rows[0].id;
r = await como(U.h1, `update public.gestion_prospectos set paquete = null where id = '${pA}'`);
ok(r.error && /GES_PAQ/.test(r.error), 'a un alta no se le puede borrar el paquete');
r = await como(U.h1, `insert into public.gestion_prospectos(gestion_id, nombre, estado, proximo) values ('${g1}', 'Beto', 'en_gestion', current_date) returning id`);
const pB = r.rows && r.rows[0].id;
r = await como(U.h1, `update public.gestion_prospectos set estado = 'descartado' where id = '${pB}'`);
ok(r.error && /GES_MOT/.test(r.error), 'un descarte sin motivo no entra');
r = await como(U.h1, `update public.gestion_prospectos set estado = 'descartado', motivo = 'ya_galicia' where id = '${pB}' returning motivo, proximo`);
ok(r.rows && r.rows[0].motivo === 'ya_galicia' && r.rows[0].proximo === null, 'con motivo sí, y se borra el próximo contacto');
r = await como(U.h1, `update public.gestion_prospectos set estado = 'en_gestion' where id = '${pB}' returning motivo`);
ok(r.rows && r.rows[0].motivo === null, 'si vuelve a estar en gestión, se borra el motivo');
r = await como(U.h1, `insert into public.gestion_prospectos(gestion_id, nombre, estado) values ('${gDatos}', 'C', 'a_contactar')`);
ok(r.error, 'el hunter que ya no la tiene no carga personas');
r = await como(U.of, `insert into public.gestion_prospectos(gestion_id, nombre, estado) values ('${gDatos}', 'Carla', 'a_contactar') returning estado`);
ok(!r.error && r.rows[0].estado === 'a_contactar', 'el oficial carga la base con personas "A contactar"');
// Historial
r = await como(U.of, `select que, detalle from public.gestion_eventos where gestion_id = '${gPA}' order by at`);
ok(r.rows && r.rows.map((x) => x.que).join(',') === 'por_asignar,hunter,horario', 'historial: por asignar → asignada → horario (' + (r.rows || []).map((x) => x.que).join(',') + ')');
r = await como(U.h1, `select que, detalle from public.gestion_eventos where gestion_id = '${g1}' order by at`);
ok(r.rows && r.rows.some((x) => x.que === 'no_puede') && r.rows.some((x) => x.que === 'alta' && x.detalle.paquete === 'caja') && r.rows.some((x) => x.que === 'descarte' && x.detalle.motivo === 'ya_galicia'), 'historial: el "no puedo", el alta con su paquete y el descarte con su motivo');
r = await como(U.h1, `insert into public.gestion_eventos(gestion_id, que) values ('${g1}', 'trucho')`);
ok(r.error, 'nadie escribe el historial a mano');
// Lecturas
r = await como(U.of, `select public.gestiones_lista(50, false) l`);
const lista = r.rows && r.rows[0].l;
const fl = lista && lista.find((x) => x.id === gDatos);
ok(fl && fl.n_datos === 1 && fl.n_pros === 0 && fl.cuit, 'la lista trae el CUIT y cuántas personas tiene una base (y cuántas contactadas)');
await como(U.h1, `update public.gestiones set estado = 'realizada' where id = '${g1}'`);
r = await como(U.of, `select public.gestiones_tablero(null, null, null, null, null, false, false) t`);
const t = r.rows && r.rows[0].t;
ok(t && t.kpis.altas === 1 && t.por_paquete.some((x) => x.paquete === 'caja') && Array.isArray(t.por_motivo) && 'datos' in t.kpis, 'el tablero suma altas por paquete, motivos y bases ' + (r.error || ''));
r = await como(U.h1, `select * from public.gestiones_empresas('7123', 10)`);
ok(r.rows && r.rows.length === 1 && r.rows[0].empresa === 'BETA SRL' && r.rows[0].cuits.length === 2, 'buscar empresa por parte del CUIT');
r = await como(U.of, `select * from public.gestiones_dia('${hoy}')`);
ok(r.rows && r.rows.filter((x) => x.hunter_id === U.h1).length >= 2 && !r.rows.some((x) => x.empresa), 'horarios del día de todos los hunters, sin empresa');
r = await como(U.of2, `select * from public.gestiones_ocupado('${U.h1}', '${hoy}')`);
ok(r.rows && r.rows.length >= 2 && r.rows.some((x) => x.empresa === null) && r.rows.some((x) => x.empresa === 'GAMA SA'), 'ocupado: la empresa sólo si quien pregunta puede ver la acción');
console.log(fallas ? fallas + ' FALLAS' : 'todo bien');
process.exit(fallas ? 1 : 0);
