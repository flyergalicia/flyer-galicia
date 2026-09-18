-- 009: el registro de cambios del padrón sólo anota cambios REALES.
-- Problema: padron_replace comparaba el JSON crudo. El cliente siempre manda el
-- rubro como {"opcion":0,"importe":"","importe2":""} y los oficiales como 4 slots
-- (vacíos incluidos), mientras que las filas viejas tenían {} y menos slots. Cada
-- guardado marcaba TODAS las empresas como "modificación" (51 de 52 filas falsas
-- en un guardado del 2026-09-17) y la solapa "Cambios del padrón" repetía todo.
-- Solución: normalizar antes de comparar (misma semántica que _padRubroIgual /
-- _padSane en auth.js). Lo que se GUARDA en "cambios" sigue siendo el valor real.
-- Idempotente. Aplicar con: SB_TOKEN=... node supabase/_runsql.mjs supabase/migrations/009_padron_log_solo_cambios_reales.sql

-- Rubro: sin opción (>0) = null; con opción, importes sólo dígitos e importe2
-- cae al importe si está vacío (es lo que hace la app).
create or replace function public.padron_rubro_norm(j jsonb)
returns jsonb language sql immutable as $$
  select case
    when j is null or jsonb_typeof(j) <> 'object' then null
    when coalesce(nullif(regexp_replace(coalesce(j->>'opcion',''), '\D', '', 'g'), '')::int, 0) <= 0 then null
    else jsonb_build_object(
      'opcion',   nullif(regexp_replace(coalesce(j->>'opcion',''), '\D', '', 'g'), '')::int,
      'importe',  regexp_replace(coalesce(j->>'importe',''), '\D', '', 'g'),
      'importe2', coalesce(nullif(regexp_replace(coalesce(j->>'importe2',''), '\D', '', 'g'), ''),
                           regexp_replace(coalesce(j->>'importe',''), '\D', '', 'g')))
  end
$$;

-- Oficiales: nombre/celular/email recortados, sin slots vacíos, en orden.
create or replace function public.padron_asesores_norm(j jsonb)
returns jsonb language sql immutable as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'nombre',  trim(coalesce(a->>'nombre','')),
             'celular', trim(coalesce(a->>'celular','')),
             'email',   trim(coalesce(a->>'email',''))) order by ord)
      from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality t(a, ord)
     where trim(coalesce(a->>'nombre','')) <> '' or trim(coalesce(a->>'celular','')) <> '' or trim(coalesce(a->>'email',''))  <> ''
  ), '[]'::jsonb)
$$;

-- CUITs: sólo dígitos, sin repetidos, ordenados (el orden no es un cambio).
create or replace function public.padron_cuits_norm(j jsonb)
returns jsonb language sql immutable as $$
  select coalesce((
    select jsonb_agg(d order by d)
      from (select distinct regexp_replace(c, '\D', '', 'g') as d
              from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) c) s
     where d <> ''
  ), '[]'::jsonb)
$$;

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
    select distinct on (lower(trim(x.empresa))) lower(trim(x.empresa)) as k, x.*,
           padron_cuits_norm(x.cuits) as ncu, trim(coalesce(x.config,'')) as ncf,
           padron_asesores_norm(x.asesores) as nas, padron_rubro_norm(x.rubro) as nru
      from jsonb_to_recordset(v_old) as x(empresa text, cuits jsonb, config text, asesores jsonb, rubro jsonb)
     order by lower(trim(x.empresa))
  ), nw as (
    select distinct on (lower(trim(x.empresa))) lower(trim(x.empresa)) as k, x.*,
           padron_cuits_norm(x.cuits) as ncu, trim(coalesce(x.config,'')) as ncf,
           padron_asesores_norm(x.asesores) as nas, padron_rubro_norm(x.rubro) as nru
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
           (case when od.ncu is distinct from nw.ncu
                 then jsonb_build_object('cuits', jsonb_build_object('antes', od.cuits, 'despues', nw.cuits))
                 else '{}'::jsonb end)
           || (case when od.ncf is distinct from nw.ncf
                 then jsonb_build_object('config', jsonb_build_object('antes', od.config, 'despues', nw.config))
                 else '{}'::jsonb end)
           || (case when od.nas is distinct from nw.nas
                 then jsonb_build_object('asesores', jsonb_build_object('antes', od.asesores, 'despues', nw.asesores))
                 else '{}'::jsonb end)
           || (case when od.nru is distinct from nw.nru
                 then jsonb_build_object('rubro', jsonb_build_object('antes', od.rubro, 'despues', nw.rubro))
                 else '{}'::jsonb end)
      from nw join od on od.k = nw.k
     where od.ncu is distinct from nw.ncu
        or od.ncf is distinct from nw.ncf
        or od.nas is distinct from nw.nas
        or od.nru is distinct from nw.nru
  )
  insert into public.padron_log (user_id, usuario, accion, empresa, cambios, total)
  select v_uid, v_usuario, accion, empresa, cambios, n from dif;

  return n;
end
$$;

revoke all on function public.padron_replace(jsonb) from public;
revoke execute on function public.padron_replace(jsonb) from anon;
grant execute on function public.padron_replace(jsonb) to authenticated;
