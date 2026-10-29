-- 046: ajustes a Gestiones v2 tras la revisión (Claude + Codex, 2026-10-29).
--  1) Una derivada CON hunter no lleva "líder que reparte" (lider_id): antes se
--     podía mandar cualquier id por la API y esa persona pasaba a ver la acción.
--  2) Horarios que se pisan: dos asignaciones al mismo hunter y día al mismo
--     tiempo podían pasar las dos la revisión. Ahora se hacen de a una (candado
--     por hunter y día mientras dura la operación).
--  3) Una gestión vieja sin CUIT lo toma del padrón la próxima vez que se edita.
--  4) gestiones_dia (horarios de los hunters, sin empresas): no la pide un
--     hunter, y el líder ve sólo los de su equipo.
-- Idempotente. El resto del trigger es igual al de la 045.

create or replace function public.gestiones_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marcar  boolean := coalesce(current_setting('fg.marcar_vista', true), '') = '1';
  v_nopuede boolean := coalesce(current_setting('fg.no_puede', true), '') = '1';
  v_rol     text := public.get_my_role();
  v_pisa    record;
  v_mirar   boolean;
begin
  if tg_op = 'INSERT' then
    new.creada_por := auth.uid();
    new.empresa := trim(new.empresa);
    new.empresa_key := lower(new.empresa);
    new.no_puede_at := null; new.no_puede_motivo := null;
    if new.origen = 'propia' then
      new.hunter_id := auth.uid();
      new.lider_id := null;
      new.visto_hunter := true;
    else
      -- El admin, o el líder del hunter, asignan en empresas de otro oficial
      -- (dueno_id elegido). Los demás derivan sólo lo suyo.
      if not (new.dueno_id is not null and new.dueno_id <> auth.uid()
              and (v_rol = 'admin' or public.es_lider_de(new.hunter_id))) then
        new.dueno_id := auth.uid();
      end if;
      if new.hunter_id is null then
        -- "Que la asigne el líder": queda en su bandeja, planificada.
        if new.lider_id is null or not exists (
          select 1 from public.profiles where id = new.lider_id and role = 'lider' and status = 'active') then
          raise exception 'Elegí el hunter o el líder que la va a asignar';
        end if;
        if new.estado <> 'planificada' then
          raise exception 'Una acción sin hunter tiene que quedar planificada';
        end if;
        new.visto_hunter := true;
      else
        if not exists (select 1 from public.profiles where id = new.hunter_id and status = 'active') then
          raise exception 'Ese hunter no existe o no está activo';
        end if;
        new.lider_id := null; -- (1) con hunter no hay "líder que reparte"
        new.visto_hunter := (new.hunter_id = auth.uid());
      end if;
    end if;
    if new.dueno_id is null or not exists (
      select 1 from public.padron_empresas pe
       where pe.user_id = new.dueno_id and lower(trim(pe.empresa)) = new.empresa_key
    ) then
      raise exception 'Esa empresa no está en la base de ese oficial';
    end if;
    select nullif(array_to_string(pe.cuits, ','), '') into new.cuit
      from public.padron_empresas pe
     where pe.user_id = new.dueno_id and lower(trim(pe.empresa)) = new.empresa_key
     limit 1;
    new.visto_dueno := (new.dueno_id = auth.uid());
    if new.serie_id is null then new.serie_id := gen_random_uuid(); end if;
  else
    -- Lo que identifica la gestión no cambia después de creada.
    new.id := old.id; new.empresa := old.empresa; new.empresa_key := old.empresa_key;
    new.dueno_id := old.dueno_id; new.creada_por := old.creada_por; new.origen := old.origen;
    new.serie_id := old.serie_id; new.created_at := old.created_at;
    new.cuit := old.cuit;
    if new.cuit is null then -- (3) una vieja sin CUIT lo toma del padrón
      select nullif(array_to_string(pe.cuits, ','), '') into new.cuit
        from public.padron_empresas pe
       where pe.user_id = old.dueno_id and lower(trim(pe.empresa)) = old.empresa_key
       limit 1;
    end if;
    if v_rol is distinct from 'admin' then new.lider_id := old.lider_id; end if;
    -- Los "visto" y el "no puedo" sólo los cambian sus funciones (o las reglas de abajo).
    if not v_marcar then
      new.visto_hunter := old.visto_hunter;
      new.visto_dueno := old.visto_dueno;
    end if;
    if not v_nopuede then
      new.no_puede_at := old.no_puede_at;
      new.no_puede_motivo := old.no_puede_motivo;
    end if;
    -- Cambiar el hunter. Al nuevo le aparece como nueva y se borra el "no puedo".
    if new.hunter_id is distinct from old.hunter_id then
      if new.hunter_id is not null and (
           v_rol = 'admin'
           or (auth.uid() = old.creada_por and old.origen = 'derivada' and old.estado <> 'realizada')
           or ((public.es_lider_de(old.hunter_id) or old.lider_id = auth.uid()) and public.es_lider_de(new.hunter_id))
         ) then
        if not exists (select 1 from public.profiles where id = new.hunter_id and status = 'active') then
          raise exception 'Ese hunter no existe o no está activo';
        end if;
        new.visto_hunter := (new.hunter_id = auth.uid());
        new.no_puede_at := null; new.no_puede_motivo := null;
      else
        new.hunter_id := old.hunter_id;
      end if;
    end if;
    -- La completó alguien que no es el dueño (el hunter): novedad para el dueño.
    if new.estado = 'realizada' and old.estado is distinct from 'realizada'
       and auth.uid() is distinct from old.dueno_id then
      new.visto_dueno := false;
    end if;
    new.updated_at := now();
  end if;

  -- Horarios que se pisan: un hunter no puede estar en dos lugares. Se mira al
  -- crear y cuando cambia el hunter, el día, el horario o vuelve de cancelada.
  -- Sin horario o en una base de datos no se compara. El admin y el líder de
  -- ese hunter pueden guardar igual (lo deciden ellos).
  if tg_op = 'INSERT' then
    v_mirar := true;
  else
    v_mirar := new.hunter_id is distinct from old.hunter_id or new.fecha is distinct from old.fecha
            or new.hora_desde is distinct from old.hora_desde or new.hora_hasta is distinct from old.hora_hasta
            or old.estado = 'cancelada';
  end if;
  if v_mirar and new.estado <> 'cancelada' and new.hunter_id is not null and new.hora_desde is not null and new.tipo <> 'datos'
     and not (v_rol = 'admin' or public.es_lider_de(new.hunter_id)) then
    -- (2) de a una por hunter y día: la segunda espera a la primera y la ve.
    perform pg_advisory_xact_lock(hashtextextended('gestiones|' || new.hunter_id::text || '|' || new.fecha::text, 0));
    select o.hora_desde, o.hora_hasta into v_pisa
      from public.gestiones o
     where o.hunter_id = new.hunter_id and o.fecha = new.fecha and o.estado <> 'cancelada'
       and o.id <> new.id and o.hora_desde is not null and o.tipo <> 'datos'
       and o.hora_desde < public.ges_fin(new.hora_desde, new.hora_hasta)
       and new.hora_desde < public.ges_fin(o.hora_desde, o.hora_hasta)
     limit 1;
    if found then
      raise exception 'GES_PISA: ese hunter ya tiene algo de % a % ese día',
        to_char(v_pisa.hora_desde, 'HH24:MI'), to_char(public.ges_fin(v_pisa.hora_desde, v_pisa.hora_hasta), 'HH24:MI');
    end if;
  end if;

  new.prueba := exists (
    select 1 from public.profiles
     where es_prueba and id in (new.creada_por, new.hunter_id, new.dueno_id)
  );
  return new;
end;
$$;
revoke execute on function public.gestiones_antes() from public, anon, authenticated;

-- (1) No hace falta limpiar nada: al aplicarla no había ninguna gestión con
-- hunter y "líder que reparte" puesto a mano (las asignadas desde la bandeja
-- conservan a su líder, que es quien las repartió).

-- (4) Horarios del día: no para hunters; el líder, los de su equipo.
create or replace function public.gestiones_dia(p_fecha date)
returns table(hunter_id uuid, hora_desde time, hora_hasta time)
language sql
security definer
stable
set search_path = public
as $$
  select g.hunter_id, g.hora_desde, g.hora_hasta
    from public.gestiones g
   where public.is_active() and public.gestiones_on()
     and coalesce(public.get_my_role(), '') <> 'hunter'
     and (public.get_my_role() is distinct from 'lider' or public.es_lider_de(g.hunter_id))
     and g.fecha = p_fecha and g.estado <> 'cancelada' and g.hunter_id is not null
     and g.hora_desde is not null and g.tipo <> 'datos';
$$;
revoke all on function public.gestiones_dia(date) from public, anon;
grant execute on function public.gestiones_dia(date) to authenticated;
