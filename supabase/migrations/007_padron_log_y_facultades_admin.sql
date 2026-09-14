-- 007: registro de cambios del padrón + facultades propias del admin.
--
-- 1) profiles.facultades: cada ADMIN puede destildarse funcionalidades (por
--    ejemplo, no ver la Opción 2 del armador) sin afectar al otro admin ni a la
--    matriz por rol (_facultades.json). null = todo habilitado (comportamiento
--    previo). Para los no-admin la columna no se usa: su gating sigue por rol.
--
-- 2) padron_log: constancia de cada alta / modificación / baja de empresa del
--    padrón, con fecha, usuario y qué cambió. La escribe padron_replace (única
--    puerta de escritura del padrón) dentro de la misma transacción, comparando
--    el padrón viejo con el nuevo. Reglas de lectura = las del padrón (003/006):
--    cada uno ve lo suyo; el admin ve además lo de los no-admin; nunca lo del
--    otro admin.
--
-- Idempotente: se puede correr varias veces.

-- ── 1) Facultades propias del admin ────────────────────────────────────────────
alter table public.profiles add column if not exists facultades jsonb;
-- Sin policy nueva: "profiles: editar propio" (006) ya deja actualizar la fila
-- propia, y guard_profile_update (001) sólo frena role/status.

-- ── 2) Tabla de cambios del padrón ─────────────────────────────────────────────
create table if not exists public.padron_log (
  id          bigserial primary key,
  -- set null (como flyer_logs): la historia sobrevive al borrado del usuario.
  user_id     uuid references auth.users(id) on delete set null,
  usuario     text not null default '',             -- nombre/mail al momento del cambio
  accion      text not null check (accion in ('alta','modificacion','baja')),
  empresa     text not null default '',
  -- Sólo las claves que cambiaron: {cuits:{antes,despues}, config:{...}, asesores:{...}}.
  -- En un alta va lo cargado en "despues"; en una baja lo que tenía en "antes".
  cambios     jsonb not null default '{}'::jsonb,
  total       integer not null default 0,           -- empresas en el padrón tras ese guardado
  created_at  timestamptz not null default now()
);

create index if not exists padron_log_user_idx on public.padron_log(user_id, created_at desc);
create index if not exists padron_log_created_idx on public.padron_log(created_at desc);

alter table public.padron_log enable row level security;

drop policy if exists "padron_log: insertar propio" on public.padron_log;
create policy "padron_log: insertar propio" on public.padron_log
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());

drop policy if exists "padron_log: ver propio" on public.padron_log;
create policy "padron_log: ver propio" on public.padron_log
  for select to authenticated
  using (user_id = auth.uid() and public.is_active());

-- user_id null (usuario borrado) => coalesce '' <> 'admin' => el admin lo ve,
-- y el nombre sale del snapshot "usuario".
drop policy if exists "padron_log: admin lee de no-admins" on public.padron_log;
create policy "padron_log: admin lee de no-admins" on public.padron_log
  for select to authenticated
  using (
    public.is_active()
    and public.get_my_role() = 'admin'
    and coalesce((select pr.role from public.profiles pr where pr.id = padron_log.user_id), '') <> 'admin'
  );
-- Sin update/delete: el log no se edita desde la app.

grant select, insert on public.padron_log to authenticated;
grant usage, select on sequence public.padron_log_id_seq to authenticated;

-- ── 3) padron_replace: igual que antes + diff al log ───────────────────────────
-- Misma firma y mismo contrato (devuelve la cantidad de filas insertadas), así
-- el cliente no cambia. security invoker: la inserción en padron_log pasa por
-- la RLS del usuario real.
create or replace function public.padron_replace(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
  v_uid uuid := auth.uid();
  v_usuario text;
  v_old jsonb;  -- foto del padrón antes del reemplazo (sin tablas temporales:
                -- el rol authenticated no tiene por qué poder crearlas)
  v_new jsonb;
begin
  if v_uid is null then
    raise exception 'Sin sesión';
  end if;

  select coalesce(nullif(full_name,''), nullif(email_asesor,''), email, '')
    into v_usuario
    from public.profiles where id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'empresa', empresa, 'cuits', to_jsonb(cuits), 'config', config, 'asesores', asesores)
           order by created_at, id), '[]'::jsonb)
    into v_old
    from public.padron_empresas where user_id = v_uid;

  delete from public.padron_empresas where user_id = v_uid;

  insert into public.padron_empresas (user_id, empresa, cuits, config, asesores)
  select v_uid,
         coalesce(r->>'empresa', ''),
         coalesce((select array_agg(c) from jsonb_array_elements_text(r->'cuits') c), '{}'),
         coalesce(r->>'config', ''),
         coalesce(r->'asesores', '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;

  get diagnostics n = row_count;

  select coalesce(jsonb_agg(jsonb_build_object(
           'empresa', empresa, 'cuits', to_jsonb(cuits), 'config', config, 'asesores', asesores)
           order by created_at, id), '[]'::jsonb)
    into v_new
    from public.padron_empresas where user_id = v_uid;

  -- Diff por razón social normalizada (una fila por clave, por si hay repetidas).
  -- alta: clave nueva · baja: clave que desapareció · modificacion: misma clave
  -- y cambió CUIT, cashback o asesores (en "cambios" va sólo lo que cambió).
  with od as (
    select distinct on (lower(trim(x.empresa))) lower(trim(x.empresa)) as k, x.*
      from jsonb_to_recordset(v_old) as x(empresa text, cuits jsonb, config text, asesores jsonb)
     order by lower(trim(x.empresa))
  ), nw as (
    select distinct on (lower(trim(x.empresa))) lower(trim(x.empresa)) as k, x.*
      from jsonb_to_recordset(v_new) as x(empresa text, cuits jsonb, config text, asesores jsonb)
     order by lower(trim(x.empresa))
  ), dif as (
    select 'alta'::text as accion, nw.empresa,
           jsonb_build_object(
             'cuits',    jsonb_build_object('despues', nw.cuits),
             'config',   jsonb_build_object('despues', nw.config),
             'asesores', jsonb_build_object('despues', nw.asesores)) as cambios
      from nw left join od on od.k = nw.k
     where od.k is null
    union all
    select 'baja', od.empresa,
           jsonb_build_object(
             'cuits',    jsonb_build_object('antes', od.cuits),
             'config',   jsonb_build_object('antes', od.config),
             'asesores', jsonb_build_object('antes', od.asesores))
      from od left join nw on nw.k = od.k
     where nw.k is null
    union all
    select 'modificacion', nw.empresa,
           (case when od.cuits is distinct from nw.cuits
                 then jsonb_build_object('cuits', jsonb_build_object('antes', od.cuits, 'despues', nw.cuits))
                 else '{}'::jsonb end)
           || (case when od.config is distinct from nw.config
                 then jsonb_build_object('config', jsonb_build_object('antes', od.config, 'despues', nw.config))
                 else '{}'::jsonb end)
           || (case when od.asesores is distinct from nw.asesores
                 then jsonb_build_object('asesores', jsonb_build_object('antes', od.asesores, 'despues', nw.asesores))
                 else '{}'::jsonb end)
      from nw join od on od.k = nw.k
     where od.cuits is distinct from nw.cuits
        or od.config is distinct from nw.config
        or od.asesores is distinct from nw.asesores
  )
  insert into public.padron_log (user_id, usuario, accion, empresa, cambios, total)
  select v_uid, v_usuario, accion, empresa, cambios, n from dif;

  return n;
end
$$;

revoke all on function public.padron_replace(jsonb) from public;
revoke execute on function public.padron_replace(jsonb) from anon;
grant execute on function public.padron_replace(jsonb) to authenticated;
