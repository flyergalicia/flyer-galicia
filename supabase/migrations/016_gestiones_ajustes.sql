-- Ajustes de Gestiones (2026-10-11), pedidos al revisarlo en prueba:
--  1) "Visita" y "Acción" son lo mismo: quedan Acción y Feria.
--  2) Repetición flexible: cada N días, X veces (o sin fin), en vez de
--     semanal/quincenal/mensual fijos.
--  3) "Sólo lo mío" (p_solo_mio) en la lista y el tablero: el admin entra
--     viendo lo suyo y con "Ver todo" ve el resto (la RLS no cambia).
-- Idempotente. Al aplicarla había 2 gestiones de prueba (mensual y quincenal):
-- pasan a "cada 30 días" y "cada 14 días".

-- ── 1) Tipo ──
update public.gestiones set tipo = 'accion' where tipo = 'visita';
alter table public.gestiones drop constraint if exists gestiones_tipo_check;
alter table public.gestiones add constraint gestiones_tipo_check check (tipo in ('accion','feria'));
alter table public.gestiones alter column tipo set default 'accion';

-- ── 2) Repetición ──
alter table public.gestiones add column if not exists cada_dias smallint;
alter table public.gestiones add column if not exists veces smallint;
alter table public.gestiones add column if not exists vez smallint;
alter table public.gestiones drop constraint if exists gestiones_frecuencia_check;
update public.gestiones set cada_dias = case frecuencia when 'semanal' then 7 when 'quincenal' then 14 when 'mensual' then 30 end,
                            frecuencia = 'repite'
 where frecuencia in ('semanal','quincenal','mensual');
alter table public.gestiones add constraint gestiones_frecuencia_check check (frecuencia in ('unica','repite'));
alter table public.gestiones drop constraint if exists gestiones_repite_datos;
alter table public.gestiones add constraint gestiones_repite_datos check (
  (frecuencia = 'unica' and cada_dias is null and veces is null)
  -- is not null explícito: con cada_dias vacío el between da NULL y un check con NULL PASA.
  or (frecuencia = 'repite' and cada_dias is not null and cada_dias between 1 and 365 and (veces is null or veces between 2 and 52))
);
alter table public.gestiones drop constraint if exists gestiones_vez_ok;
alter table public.gestiones add constraint gestiones_vez_ok check (vez is null or (vez >= 1 and (veces is null or vez <= veces)));

-- ── 3) Lista y tablero con "sólo lo mío" (se borra la firma vieja: si no,
--    quedan dos sobrecargas y la llamada desde el cliente es ambigua) ──
drop function if exists public.gestiones_lista(integer);
create or replace function public.gestiones_lista(p_limit integer default 300, p_solo_mio boolean default false)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(x.j order by x.fecha desc, x.created_at desc), '[]'::jsonb)
    from (
      select g.fecha, g.created_at,
             to_jsonb(g) || jsonb_build_object(
               'n_pros',  (select count(*) from public.gestion_prospectos p where p.gestion_id = g.id),
               'n_altas', (select count(*) from public.gestion_prospectos p where p.gestion_id = g.id and p.estado = 'alta')
             ) as j
        from public.gestiones g
       where not coalesce(p_solo_mio, false) or auth.uid() in (g.hunter_id, g.dueno_id, g.creada_por)
       order by g.fecha desc, g.created_at desc
       limit least(greatest(coalesce(p_limit, 300), 1), 2000)
    ) x;
$$;
revoke all on function public.gestiones_lista(integer, boolean) from public;
grant execute on function public.gestiones_lista(integer, boolean) to authenticated;

drop function if exists public.gestiones_tablero(date, date, text, uuid, uuid, boolean);
create or replace function public.gestiones_tablero(
  p_desde date default null, p_hasta date default null, p_tipo text default null,
  p_hunter uuid default null, p_dueno uuid default null, p_prueba boolean default false,
  p_solo_mio boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_prueba boolean := coalesce(p_prueba, false) and (
    public.get_my_role() = 'admin'
    or exists (select 1 from public.profiles where id = auth.uid() and es_prueba));
  v_out jsonb;
begin
  with g as (
    select * from public.gestiones x
     where (p_desde is null or x.fecha >= p_desde)
       and (p_hasta is null or x.fecha <= p_hasta)
       and (p_tipo  is null or x.tipo = p_tipo)
       and (p_hunter is null or x.hunter_id = p_hunter)
       and (p_dueno  is null or x.dueno_id = p_dueno)
       and (v_prueba or not x.prueba)
       and (not coalesce(p_solo_mio, false) or auth.uid() in (x.hunter_id, x.dueno_id, x.creada_por))
  ),
  r as (select * from g where estado = 'realizada'),
  pr as (
    select p.*, r.fecha as g_fecha, r.hunter_id, r.dueno_id, r.tipo, r.modalidad, r.empresa, r.empresa_key
      from public.gestion_prospectos p join r on r.id = p.gestion_id
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'visitas',      (select count(*) from r),
      'planificadas', (select count(*) from g where estado = 'planificada'),
      'empresas',     (select count(distinct (dueno_id, empresa_key)) from r),
      'asistentes',   (select coalesce(sum(asistentes), 0) from r),
      'prospectos',   (select count(*) from pr),
      'altas',        (select count(*) from pr where estado = 'alta')
    ),
    'por_mes', coalesce((select jsonb_agg(m order by m->>'mes') from (
      select jsonb_build_object('mes', to_char(date_trunc('month', r.fecha), 'YYYY-MM'),
        'visitas', count(*),
        'prospectos', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0),
        'altas', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0)) m
        from r group by date_trunc('month', r.fecha)) t), '[]'::jsonb),
    'por_hunter', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', r.hunter_id, 'visitas', count(*),
        'prospectos', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0),
        'altas', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0)) x
        from r group by r.hunter_id) t), '[]'::jsonb),
    'por_dueno', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', r.dueno_id, 'visitas', count(*),
        'prospectos', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0),
        'altas', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0)) x
        from r group by r.dueno_id) t), '[]'::jsonb),
    'por_empresa', coalesce((select jsonb_agg(jsonb_build_object('empresa', emp, 'dueno', dueno_id,
        'visitas', v, 'prospectos', p, 'altas', a) order by a desc, v desc) from (
      select r.dueno_id, min(r.empresa) emp, count(*) v,
        coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0) p,
        coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0) a
        from r group by r.dueno_id, r.empresa_key
        order by a desc, v desc limit 300) t), '[]'::jsonb),
    'por_renta', coalesce((select jsonb_agg(jsonb_build_object('renta', renta, 'altas', n)) from (
      select renta, count(*) n from pr where estado = 'alta' group by renta) t), '[]'::jsonb),
    'por_tipo', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('tipo', r.tipo, 'modalidad', r.modalidad, 'visitas', count(*),
        'prospectos', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0),
        'altas', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0)) x
        from r group by r.tipo, r.modalidad) t), '[]'::jsonb),
    'por_estado_pros', coalesce((select jsonb_object_agg(estado, n) from (
      select estado, count(*) n from pr group by estado) t), '{}'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) from public;
grant execute on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) to authenticated;
