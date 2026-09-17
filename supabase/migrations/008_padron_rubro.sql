-- 008: rubro por empresa en el padrón (Flyer Rubros).
-- Cada empresa puede tener un beneficio por rubro (Supermercado, Combustible,
-- Ambos…): la app lo usa para completar los topes al elegir la empresa y para
-- avisar si el flyer se está armando en la solapa equivocada.
-- Forma del JSON: {"opcion": 5, "importe": "24000", "importe2": "30000"}
--   opcion  = nº de la opción (de la solapa Flyer Rubros) en _opciones.json; 0 o
--             ausente = sin rubro.
--   importe / importe2 = topes en dígitos (sin $ ni puntos); importe2 sólo si difiere.
-- Idempotente. Aplicar con: SB_TOKEN=... node supabase/_runsql.mjs supabase/migrations/008_padron_rubro.sql

alter table public.padron_empresas
  add column if not exists rubro jsonb not null default '{}'::jsonb;

-- ── padron_replace: igual que en 007 + la columna rubro (insert, fotos y diff) ──
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
  v_old jsonb;
  v_new jsonb;
begin
  if v_uid is null then
    raise exception 'Sin sesión';
  end if;

  select coalesce(nullif(full_name,''), nullif(email_asesor,''), email, '')
    into v_usuario
    from public.profiles where id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'empresa', empresa, 'cuits', to_jsonb(cuits), 'config', config, 'asesores', asesores, 'rubro', rubro)
           order by created_at, id), '[]'::jsonb)
    into v_old
    from public.padron_empresas where user_id = v_uid;

  delete from public.padron_empresas where user_id = v_uid;

  insert into public.padron_empresas (user_id, empresa, cuits, config, asesores, rubro)
  select v_uid,
         coalesce(r->>'empresa', ''),
         coalesce((select array_agg(c) from jsonb_array_elements_text(r->'cuits') c), '{}'),
         coalesce(r->>'config', ''),
         coalesce(r->'asesores', '[]'::jsonb),
         case when jsonb_typeof(r->'rubro') = 'object' then r->'rubro' else '{}'::jsonb end
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;

  get diagnostics n = row_count;

  select coalesce(jsonb_agg(jsonb_build_object(
           'empresa', empresa, 'cuits', to_jsonb(cuits), 'config', config, 'asesores', asesores, 'rubro', rubro)
           order by created_at, id), '[]'::jsonb)
    into v_new
    from public.padron_empresas where user_id = v_uid;

  with od as (
    select distinct on (lower(trim(x.empresa))) lower(trim(x.empresa)) as k, x.*
      from jsonb_to_recordset(v_old) as x(empresa text, cuits jsonb, config text, asesores jsonb, rubro jsonb)
     order by lower(trim(x.empresa))
  ), nw as (
    select distinct on (lower(trim(x.empresa))) lower(trim(x.empresa)) as k, x.*
      from jsonb_to_recordset(v_new) as x(empresa text, cuits jsonb, config text, asesores jsonb, rubro jsonb)
     order by lower(trim(x.empresa))
  ), dif as (
    select 'alta'::text as accion, nw.empresa,
           jsonb_build_object(
             'cuits',    jsonb_build_object('despues', nw.cuits),
             'config',   jsonb_build_object('despues', nw.config),
             'asesores', jsonb_build_object('despues', nw.asesores),
             'rubro',    jsonb_build_object('despues', nw.rubro)) as cambios
      from nw left join od on od.k = nw.k
     where od.k is null
    union all
    select 'baja', od.empresa,
           jsonb_build_object(
             'cuits',    jsonb_build_object('antes', od.cuits),
             'config',   jsonb_build_object('antes', od.config),
             'asesores', jsonb_build_object('antes', od.asesores),
             'rubro',    jsonb_build_object('antes', od.rubro))
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
           || (case when od.rubro is distinct from nw.rubro
                 then jsonb_build_object('rubro', jsonb_build_object('antes', od.rubro, 'despues', nw.rubro))
                 else '{}'::jsonb end)
      from nw join od on od.k = nw.k
     where od.cuits is distinct from nw.cuits
        or od.config is distinct from nw.config
        or od.asesores is distinct from nw.asesores
        or od.rubro is distinct from nw.rubro
  )
  insert into public.padron_log (user_id, usuario, accion, empresa, cambios, total)
  select v_uid, v_usuario, accion, empresa, cambios, n from dif;

  return n;
end
$$;

revoke all on function public.padron_replace(jsonb) from public;
revoke execute on function public.padron_replace(jsonb) from anon;
grant execute on function public.padron_replace(jsonb) to authenticated;
