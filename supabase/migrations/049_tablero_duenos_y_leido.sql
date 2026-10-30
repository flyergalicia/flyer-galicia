-- 049: tres cosas que pidió el dueño después de probar la simulación.
--
-- 1) El filtro "Oficial que cede" del tablero se armaba con los oficiales que
--    aparecían en el RESULTADO ya filtrado, y sólo de lo realizado: un oficial
--    que sólo tiene acciones planificadas no estaba en la lista, y al elegir
--    uno la lista se quedaba con ése solo (no se podía pasar a otro). Ahora la
--    función devuelve aparte "duenos": todos los oficiales que ceden algo en el
--    período, sin mirar el filtro ni el estado.
-- 2) gestion_marcar_no_leida: volver a dejar una acción como no leída (el
--    cartel vuelve), para la persona que llama.
-- 3) gestiones_marcar_todas_leidas: sacar de una todos los carteles propios.
--
-- Idempotente: se puede volver a correr.

-- ── 1) Tablero: la lista de oficiales que ceden, aparte del filtro ─────────
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
  with gd as (
    -- Todo lo del período que esta persona puede ver, SIN el filtro de oficial:
    -- de acá sale la lista de oficiales para el desplegable.
    select * from public.gestiones x
     where (p_desde is null or x.fecha >= p_desde)
       and (p_hasta is null or x.fecha <= p_hasta)
       and (p_tipo  is null or x.tipo = p_tipo)
       and (p_hunter is null or x.hunter_id = p_hunter)
       and (v_prueba or not x.prueba)
       and (not coalesce(p_solo_mio, false) or auth.uid() in (x.hunter_id, x.dueno_id, x.creada_por, x.lider_id))
  ),
  g as (select * from gd where (p_dueno is null or dueno_id = p_dueno)),
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
    -- Para el desplegable "Oficial que cede": todos los del período, con o sin
    -- acciones realizadas, aunque esté puesto el filtro.
    'duenos', coalesce((select jsonb_agg(jsonb_build_object('id', dueno_id, 'n', n) order by n desc) from (
      select dueno_id, count(*) n from gd where dueno_id is not null group by dueno_id) t), '[]'::jsonb),
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

-- ── 2) Dejarla como NO leída (para quien llama) ────────────────────────────
-- Lo contrario de abrirla: vuelve el cartel "Nueva" / "mensajes nuevos". Sólo
-- toca lo propio (como hunter o como dueño) y la marca de lectura propia.
create or replace function public.gestion_marcar_no_leida(p_gestion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g public.gestiones;
begin
  if not public.is_active() or not public.gestiones_on() then return; end if;
  select * into v_g from public.gestiones where id = p_gestion;
  if v_g.id is null then return; end if;
  if not (public.puede_ver_gestion(v_g.hunter_id, v_g.dueno_id, v_g.creada_por) or v_g.lider_id = auth.uid()) then
    return;
  end if;
  -- La marca de lectura de los mensajes: se borra, así los de los demás
  -- vuelven a contar como nuevos.
  delete from public.gestion_leido where gestion_id = p_gestion and user_id = auth.uid();
  -- Y la novedad de la acción, si es suya como hunter o como dueño.
  if auth.uid() in (v_g.hunter_id, v_g.dueno_id) then
    perform set_config('fg.marcar_vista', '1', true);
    update public.gestiones
       set visto_hunter = case when hunter_id = auth.uid() then false else visto_hunter end,
           visto_dueno  = case when dueno_id  = auth.uid() then false else visto_dueno  end
     where id = p_gestion;
    perform set_config('fg.marcar_vista', '', true);
  end if;
end;
$$;
revoke all on function public.gestion_marcar_no_leida(uuid) from public, anon;
grant execute on function public.gestion_marcar_no_leida(uuid) to authenticated;

-- ── 3) Marcar todas como leídas ────────────────────────────────────────────
-- Saca de una todos los carteles propios: las novedades de las acciones y los
-- mensajes sin leer de las conversaciones en las que participa.
create or replace function public.gestiones_marcar_todas_leidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  v_m integer := 0;
begin
  if not public.is_active() or not public.gestiones_on() then return 0; end if;
  perform set_config('fg.marcar_vista', '1', true);
  update public.gestiones
     set visto_hunter = case when hunter_id = auth.uid() then true else visto_hunter end,
         visto_dueno  = case when dueno_id  = auth.uid() then true else visto_dueno  end
   where (hunter_id = auth.uid() and not visto_hunter)
      or (dueno_id  = auth.uid() and not visto_dueno);
  get diagnostics v_n = row_count;
  perform set_config('fg.marcar_vista', '', true);
  insert into public.gestion_leido(gestion_id, user_id, at)
  select distinct m.gestion_id, auth.uid(), now()
    from public.gestion_mensajes m
    join public.gestiones g on g.id = m.gestion_id
   where m.autor is distinct from auth.uid()
     and public.gestion_participa(g)
  on conflict (gestion_id, user_id) do update set at = excluded.at;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end;
$$;
revoke all on function public.gestiones_marcar_todas_leidas() from public, anon;
grant execute on function public.gestiones_marcar_todas_leidas() to authenticated;
