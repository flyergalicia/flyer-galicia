-- 048: lo que un oficial derivó y todavía NADIE asignó no cuenta como trabajo
-- planificado (desvirtúa la métrica: no es de nadie todavía). Se cuenta aparte,
-- en "sin_asignar", para que el oficial y su líder no se lo olviden.
-- Idempotente: sólo reemplaza gestiones_tablero (igual a la 045 salvo esas dos
-- líneas de kpis).
create or replace function public.gestiones_tablero(
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null,
  p_hunter uuid default null,
  p_dueno uuid default null,
  p_prueba boolean default false,
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
       and (not coalesce(p_solo_mio, false) or auth.uid() in (x.hunter_id, x.dueno_id, x.creada_por, x.lider_id))
  ),
  r as (select * from g where estado = 'realizada' or (tipo = 'datos' and estado <> 'cancelada')),
  todos as (
    select p.*, r.fecha as g_fecha, r.hunter_id, r.dueno_id, r.tipo, r.modalidad, r.empresa, r.empresa_key
      from public.gestion_prospectos p join r on r.id = p.gestion_id
  ),
  pr as (select * from todos where estado <> 'a_contactar')
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'visitas',      (select count(*) from r),
      -- planificadas: sólo lo que YA tiene hunter (lo demás no es trabajo de nadie)
      'planificadas', (select count(*) from g where estado = 'planificada' and tipo <> 'datos' and hunter_id is not null),
      'sin_asignar',  (select count(*) from g where estado = 'planificada' and tipo <> 'datos' and hunter_id is null),
      'empresas',     (select count(distinct (dueno_id, empresa_key)) from r),
      'asistentes',   (select coalesce(sum(asistentes), 0) from r),
      'prospectos',   (select count(*) from pr),
      'altas',        (select count(*) from pr where estado = 'alta'),
      'datos',        (select count(*) from todos where tipo = 'datos'),
      'contactados',  (select count(*) from todos where tipo = 'datos' and estado <> 'a_contactar')
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
        'altas', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0),
        'paquetes', coalesce((select jsonb_object_agg(q.paquete, q.n) from (
          select pr.paquete, count(*) n from pr
           where pr.hunter_id is not distinct from r.hunter_id and pr.estado = 'alta' and pr.paquete is not null
           group by pr.paquete) q), '{}'::jsonb)) x
        from r group by r.hunter_id) t), '[]'::jsonb),
    'por_dueno', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', r.dueno_id, 'visitas', count(*),
        'prospectos', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0),
        'altas', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0)) x
        from r group by r.dueno_id) t), '[]'::jsonb),
    'por_empresa', coalesce((select jsonb_agg(jsonb_build_object('empresa', emp, 'dueno', dueno_id, 'cuit', cuit,
        'visitas', v, 'prospectos', p, 'altas', a) order by a desc, v desc) from (
      select r.dueno_id, min(r.empresa) emp, min(r.cuit) cuit, count(*) v,
        coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0) p,
        coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0) a
        from r group by r.dueno_id, r.empresa_key
        order by a desc, v desc limit 300) t), '[]'::jsonb),
    'por_paquete', coalesce((select jsonb_agg(jsonb_build_object('paquete', paquete, 'altas', n)) from (
      select paquete, count(*) n from pr where estado = 'alta' group by paquete) t), '[]'::jsonb),
    'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'n', n)) from (
      select motivo, count(*) n from pr where estado = 'descartado' group by motivo) t), '[]'::jsonb),
    'por_tipo', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('tipo', r.tipo, 'modalidad', r.modalidad, 'visitas', count(*),
        'prospectos', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id)), 0),
        'altas', coalesce(sum((select count(*) from pr where pr.gestion_id = r.id and pr.estado = 'alta')), 0)) x
        from r group by r.tipo, r.modalidad) t), '[]'::jsonb),
    'por_estado_pros', coalesce((select jsonb_object_agg(estado, n) from (
      select estado, count(*) n from todos group by estado) t), '{}'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke all on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) to authenticated;
