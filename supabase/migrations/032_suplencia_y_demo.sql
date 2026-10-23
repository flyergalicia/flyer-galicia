-- Suplencia con acceso a la base + empresas de ejemplo separadas de las reales.
--
-- 1) Empresas de ejemplo (las de la cuenta de prueba Prospect): un Hunter real
--    NUNCA las ve, y la cuenta de prueba en modo Hunter ve SÓLO las de prueba
--    (así una demo no muestra empresas ni oficiales reales).
-- 2) El suplente (profiles.suplente_id, 012) puede BUSCAR las empresas del
--    oficial que lo eligió, sólo mientras siga elegido: padron_suplencias()
--    lo revisa en cada llamada. No se agrega ninguna policy a padron_empresas
--    (loadPadron y "Padrón Asesores" quedan igual).
-- 3) Si el suplente baja un flyer con datos distintos, puede PEDIR que se
--    guarden: queda una propuesta con origen 'suplente' (oficiales, cashback y
--    rubro) que aprueba o rechaza el dueño cuando vuelve. El suplente no puede
--    aprobar su propio pedido, ni se le puede repreguntar (no tiene pantalla
--    para contestar).
--
-- Idempotente: se puede correr varias veces.

-- ── 1) Cuentas de prueba ────────────────────────────────────────────────────
create or replace function public.soy_prueba()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select es_prueba from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.soy_prueba() from public, anon;
grant execute on function public.soy_prueba() to authenticated;

create or replace function public.ids_prueba()
returns uuid[] language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from public.profiles where es_prueba;
$$;
revoke all on function public.ids_prueba() from public, anon;
grant execute on function public.ids_prueba() to authenticated;

-- El hunter lee las empresas de "su mundo": reales si es real, de prueba si es
-- de prueba. Los helpers van en (select …) para que se evalúen una sola vez.
alter policy "hunter lee todas las empresas" on public.padron_empresas
  using (
    (select public.is_active())
    and ((select public.get_my_role()) = 'hunter'::text)
    -- el ::uuid[] hace que any() tome el arreglo y no "una subconsulta de arreglos"
    and ((user_id = any((select public.ids_prueba())::uuid[])) = (select public.soy_prueba()))
  );

-- Mismo criterio en la lista de empresas de la Agenda de Gestiones (030) para
-- el hunter. El admin sigue viendo todo; líder y el resto, lo de siempre.
create or replace function public.gestiones_empresas(p_q text default null, p_limit integer default 30)
returns table(empresa text, dueno_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  with yo as (select public.get_my_role() as rol, public.soy_prueba() as prueba, public.ids_prueba() as ids)
  select pe.empresa, pe.user_id
    from public.padron_empresas pe, yo
   where public.is_active() and public.gestiones_on()
     and (yo.rol = 'admin'
          or (yo.rol = 'hunter' and (pe.user_id = any(yo.ids)) = yo.prueba)
          or pe.user_id = auth.uid()
          or public.es_lider_de(pe.user_id))
     and (coalesce(trim(p_q), '') = '' or lower(pe.empresa) like '%' || lower(trim(p_q)) || '%')
   order by pe.empresa
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.gestiones_empresas(text, integer) from public, anon;
grant execute on function public.gestiones_empresas(text, integer) to authenticated;

-- ── 2) La base del oficial que me eligió como suplente (sólo lectura) ──────
create or replace function public.padron_suplencias()
returns table(empresa text, cuits text[], config text, asesores jsonb, rubro jsonb,
              user_id uuid, dueno_nombre text)
language sql
security definer
stable
set search_path = public
as $$
  select pe.empresa, pe.cuits, pe.config, pe.asesores, pe.rubro, pe.user_id,
         coalesce(nullif(trim(p.full_name), ''), p.email, 'otro oficial')
    from public.profiles p
    join public.padron_empresas pe on pe.user_id = p.id
   where p.suplente_id = auth.uid()
     and p.status = 'active'
     and public.is_active()
     and coalesce(public.get_my_role(), '') <> 'hunter'
   order by pe.empresa;
$$;
revoke all on function public.padron_suplencias() from public, anon;
grant execute on function public.padron_suplencias() to authenticated;

-- ── 3) Pedido del suplente ──────────────────────────────────────────────────
alter table public.padron_propuestas add column if not exists origen text not null default 'hunter';
alter table public.padron_propuestas add column if not exists config_antes text;
alter table public.padron_propuestas add column if not exists config text;
alter table public.padron_propuestas add column if not exists rubro_antes jsonb;
alter table public.padron_propuestas add column if not exists rubro jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'padron_propuestas_origen_check') then
    alter table public.padron_propuestas
      add constraint padron_propuestas_origen_check check (origen in ('hunter','suplente'));
  end if;
end $$;

-- Función aparte (no una sobrecarga de padron_propuesta_crear: dos firmas con
-- el mismo nombre rompen la llamada por ambigüedad, lección de la 013).
-- p_config / p_rubro en null = ese dato no cambia.
create or replace function public.padron_suplencia_proponer(
  p_empresa text, p_dueno uuid, p_asesores jsonb,
  p_config text default null, p_rubro jsonb default null, p_nota text default null
)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_empresa, '')));
  v_row public.padron_empresas;
  v_out public.padron_propuestas;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if not public.es_suplente_de(p_dueno) then
    raise exception 'Ya no sos suplente de ese oficial';
  end if;
  if v_key = '' then raise exception 'Falta indicar la empresa'; end if;

  select pe.* into v_row from public.padron_empresas pe
   where pe.user_id = p_dueno and lower(trim(pe.empresa)) = v_key limit 1;
  if v_row.id is null then raise exception 'Esa empresa ya no está en la base de ese oficial'; end if;

  if exists (select 1 from public.padron_propuestas pp
              where pp.dueno_id = p_dueno and pp.empresa_key = v_key and pp.estado in ('pendiente','consulta')) then
    raise exception 'Ya hay un pedido abierto para esta empresa';
  end if;

  insert into public.padron_propuestas
    (empresa_key, empresa, dueno_id, creada_por, creada_por_nombre, origen,
     asesores_antes, asesores, config_antes, config, rubro_antes, rubro, nota)
  values
    (v_key, v_row.empresa, p_dueno, auth.uid(), public._prop_mi_nombre(), 'suplente',
     v_row.asesores, coalesce(p_asesores, v_row.asesores),
     case when p_config is null then null else v_row.config end, p_config,
     case when jsonb_typeof(p_rubro) = 'object' then v_row.rubro else null end,
     case when jsonb_typeof(p_rubro) = 'object' then p_rubro else null end,
     p_nota)
  returning * into v_out;

  if coalesce(trim(p_nota), '') <> '' then
    insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
    values (v_out.id, auth.uid(), v_out.creada_por_nombre, 'suplente', 'nota', trim(p_nota));
  end if;
  return v_out;
end;
$$;
revoke all on function public.padron_suplencia_proponer(text, uuid, jsonb, text, jsonb, text) from public, anon;
grant execute on function public.padron_suplencia_proponer(text, uuid, jsonb, text, jsonb, text) to authenticated;

-- Aprobar: cuerpo de la 013 + cashback/rubro + "nadie aprueba lo que pidió".
create or replace function public.padron_propuesta_aprobar(p_id uuid, p_comentario text default null)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_p       public.padron_propuestas;
  v_row     public.padron_empresas;
  v_usuario text;
  v_total   integer;
  v_cambios jsonb;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then raise exception 'Esa propuesta no existe'; end if;
  if v_p.estado not in ('pendiente','consulta') then raise exception 'Esa propuesta ya se resolvió'; end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés aprobar esta propuesta';
  end if;
  if v_p.creada_por = auth.uid() and v_p.dueno_id <> auth.uid() then
    raise exception 'Este pedido lo hiciste vos: lo aprueba el oficial cuando vuelva';
  end if;

  select pe.* into v_row from public.padron_empresas pe
   where pe.user_id = v_p.dueno_id and lower(trim(pe.empresa)) = v_p.empresa_key limit 1;

  if v_row.id is null then
    update public.padron_propuestas
       set estado = 'rechazada', resuelta_por = auth.uid(), resuelta_at = now(),
           motivo = 'La empresa ya no está en la base'
     where id = p_id returning * into v_p;
    return v_p;
  end if;

  update public.padron_empresas
     set asesores = v_p.asesores,
         config   = coalesce(v_p.config, config),
         rubro    = coalesce(v_p.rubro, rubro)
   where id = v_row.id;

  -- "antes" = lo que había AL APROBAR (v_row), no la foto de cuando se propuso.
  v_cambios := jsonb_build_object('asesores', jsonb_build_object('antes', v_row.asesores, 'despues', v_p.asesores));
  if v_p.config is not null and v_p.config is distinct from v_row.config then
    v_cambios := v_cambios || jsonb_build_object('config', jsonb_build_object('antes', v_row.config, 'despues', v_p.config));
  end if;
  if v_p.rubro is not null and v_p.rubro is distinct from v_row.rubro then
    v_cambios := v_cambios || jsonb_build_object('rubro', jsonb_build_object('antes', v_row.rubro, 'despues', v_p.rubro));
  end if;

  select coalesce(nullif(trim(full_name), ''), email, '') into v_usuario from public.profiles where id = v_p.dueno_id;
  select count(*) into v_total from public.padron_empresas where user_id = v_p.dueno_id;
  insert into public.padron_log (user_id, usuario, accion, empresa, cambios, total)
  values (v_p.dueno_id, coalesce(v_usuario, ''), 'modificacion', v_row.empresa, v_cambios, v_total);

  insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(),
          case when v_p.dueno_id = auth.uid() then 'dueno' else 'suplente' end, 'aprobacion',
          coalesce(nullif(trim(p_comentario), ''), ''));

  update public.padron_propuestas
     set estado = 'aprobada', resuelta_por = auth.uid(), resuelta_at = now()
   where id = p_id returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_aprobar(uuid, text) from public, anon;
grant execute on function public.padron_propuesta_aprobar(uuid, text) to authenticated;

-- Repreguntar: no a un pedido del suplente (no tiene dónde contestar).
create or replace function public.padron_propuesta_consultar(p_id uuid, p_texto text)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_p public.padron_propuestas;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribí la consulta'; end if;
  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then raise exception 'Esa propuesta no existe'; end if;
  if v_p.origen = 'suplente' then raise exception 'A un pedido del suplente no se le puede repreguntar: aprobalo o rechazalo'; end if;
  if v_p.estado <> 'pendiente' then raise exception 'Esa propuesta no está esperando tu revisión'; end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés consultar sobre esta propuesta';
  end if;

  insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(),
          case when v_p.dueno_id = auth.uid() then 'dueno' else 'suplente' end, 'consulta', trim(p_texto));

  update public.padron_propuestas set estado = 'consulta' where id = p_id returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_consultar(uuid, text) from public, anon;
grant execute on function public.padron_propuesta_consultar(uuid, text) to authenticated;

-- Rechazar: el suplente tampoco "rechaza" su propio pedido en nombre del dueño
-- (para retirarlo alcanza con no insistir; lo cierra el dueño).
create or replace function public.padron_propuesta_rechazar(p_id uuid, p_motivo text default null)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_p public.padron_propuestas;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then raise exception 'Esa propuesta no existe'; end if;
  if v_p.estado not in ('pendiente','consulta') then raise exception 'Esa propuesta ya se resolvió'; end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés rechazar esta propuesta';
  end if;
  if v_p.creada_por = auth.uid() and v_p.dueno_id <> auth.uid() then
    raise exception 'Este pedido lo hiciste vos: lo resuelve el oficial cuando vuelva';
  end if;

  insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(),
          case when v_p.dueno_id = auth.uid() then 'dueno' else 'suplente' end, 'rechazo',
          coalesce(nullif(trim(p_motivo), ''), ''));

  update public.padron_propuestas
     set estado = 'rechazada', resuelta_por = auth.uid(), resuelta_at = now(), motivo = p_motivo
   where id = p_id returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_rechazar(uuid, text) from public, anon;
grant execute on function public.padron_propuesta_rechazar(uuid, text) to authenticated;
