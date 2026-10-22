-- 030: Agenda de los hunters (2026-10-21).
--  1) Horario (desde–hasta, opcional) y lugar de cada gestión.
--  2) Tipo nuevo "posición comercial" (al lado de acción y feria).
--  3) El líder (a hunters de su equipo) y el admin asignan acciones en empresas
--     de otro oficial: mandan dueno_id y el trigger lo respeta. El resto sigue
--     igual (quien deriva es el dueño). La empresa tiene que estar en la base
--     de ese oficial, para todos.
--  4) gestiones_empresas: empresas que quien llama puede asignar (con su dueño).
--  5) gestiones_ocupado: horarios de un hunter en un día, para avisar si se pisan
--     (el oficial no ve las gestiones de otros oficiales con ese hunter).
-- Idempotente.

-- ── 1) Horario y lugar ──
alter table public.gestiones add column if not exists hora_desde time;
alter table public.gestiones add column if not exists hora_hasta time;
alter table public.gestiones add column if not exists lugar text;
alter table public.gestiones drop constraint if exists gestiones_horario_ok;
-- is not null explícito: con un NULL la comparación da NULL y el check pasa.
alter table public.gestiones add constraint gestiones_horario_ok check (
  (hora_desde is null and hora_hasta is null)
  or (hora_desde is not null and hora_hasta is null)
  or (hora_desde is not null and hora_hasta is not null and hora_desde < hora_hasta)
);
alter table public.gestiones drop constraint if exists gestiones_lugar_ok;
alter table public.gestiones add constraint gestiones_lugar_ok check (lugar is null or length(lugar) <= 200);
create index if not exists gestiones_hunter_dia_idx on public.gestiones(hunter_id, fecha, hora_desde);

-- ── 2) Tipo ──
alter table public.gestiones drop constraint if exists gestiones_tipo_check;
alter table public.gestiones add constraint gestiones_tipo_check check (tipo in ('accion','feria','posicion'));

-- ── 3) Trigger: igual que la 017, salvo el dueño de una derivada ──
create or replace function public.gestiones_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marcar boolean := coalesce(current_setting('fg.marcar_vista', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    new.creada_por := auth.uid();
    new.empresa := trim(new.empresa);
    new.empresa_key := lower(new.empresa);
    if new.origen = 'propia' then
      new.hunter_id := auth.uid();
      new.visto_hunter := true;
    else
      -- El admin, o el líder del hunter, asignan en empresas de otro oficial
      -- (dueno_id elegido). Los demás derivan sólo lo suyo.
      if not (new.dueno_id is not null and new.dueno_id <> auth.uid()
              and (public.get_my_role() = 'admin' or public.es_lider_de(new.hunter_id))) then
        new.dueno_id := auth.uid();
      end if;
      new.visto_hunter := (new.hunter_id = auth.uid());
      if not exists (select 1 from public.profiles where id = new.hunter_id and status = 'active') then
        raise exception 'Ese hunter no existe o no está activo';
      end if;
    end if;
    if new.dueno_id is null or not exists (
      select 1 from public.padron_empresas pe
       where pe.user_id = new.dueno_id and lower(trim(pe.empresa)) = new.empresa_key
    ) then
      raise exception 'Esa empresa no está en la base de ese oficial';
    end if;
    -- Novedad para el dueño si la registró otro (un hunter, el líder o el admin).
    new.visto_dueno := (new.dueno_id = auth.uid());
    if new.serie_id is null then new.serie_id := gen_random_uuid(); end if;
  else
    -- Lo que identifica la gestión no cambia después de creada.
    new.id := old.id; new.empresa := old.empresa; new.empresa_key := old.empresa_key;
    new.dueno_id := old.dueno_id; new.creada_por := old.creada_por; new.origen := old.origen;
    new.serie_id := old.serie_id; new.created_at := old.created_at;
    -- Los "visto" sólo los cambia gestion_marcar_vista (o las reglas de abajo).
    if not v_marcar then
      new.visto_hunter := old.visto_hunter;
      new.visto_dueno := old.visto_dueno;
    end if;
    -- Reasignar el hunter: sólo quien la creó (el oficial que la derivó) o el admin.
    -- Al nuevo hunter le aparece como nueva.
    if new.hunter_id is distinct from old.hunter_id then
      if auth.uid() = old.creada_por or public.get_my_role() = 'admin' then
        new.visto_hunter := (new.hunter_id = auth.uid());
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
  new.prueba := exists (
    select 1 from public.profiles
     where es_prueba and id in (new.creada_por, new.hunter_id, new.dueno_id)
  );
  return new;
end;
$$;
revoke execute on function public.gestiones_antes() from public, anon, authenticated;

-- ── 4) Empresas que quien llama puede asignar, con su dueño ──
-- admin y hunter: todo el padrón (el hunter ya lo lee para Buscar flyer);
-- líder: las suyas y las de su equipo; el resto: las suyas.
create or replace function public.gestiones_empresas(p_q text default null, p_limit integer default 30)
returns table(empresa text, dueno_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  with yo as (select public.get_my_role() as rol)
  select pe.empresa, pe.user_id
    from public.padron_empresas pe, yo
   where public.is_active() and public.gestiones_on()
     and (yo.rol in ('admin','hunter') or pe.user_id = auth.uid() or public.es_lider_de(pe.user_id))
     and (coalesce(trim(p_q), '') = '' or lower(pe.empresa) like '%' || lower(trim(p_q)) || '%')
   order by pe.empresa
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.gestiones_empresas(text, integer) from public, anon;
grant execute on function public.gestiones_empresas(text, integer) to authenticated;

-- ── 5) Ocupado: horarios de un hunter en un día ──
-- Devuelve todas sus gestiones no canceladas de ese día; la empresa sólo si
-- quien llama puede ver esa gestión (si no, sale vacía: "ocupado").
create or replace function public.gestiones_ocupado(p_hunter uuid, p_fecha date)
returns table(id uuid, hora_desde time, hora_hasta time, tipo text, empresa text)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.hora_desde, g.hora_hasta, g.tipo,
         case when public.puede_ver_gestion(g.hunter_id, g.dueno_id, g.creada_por) then g.empresa end
    from public.gestiones g
   where public.is_active() and public.gestiones_on()
     and g.hunter_id = p_hunter and g.fecha = p_fecha and g.estado <> 'cancelada'
   order by g.hora_desde nulls first;
$$;
revoke all on function public.gestiones_ocupado(uuid, date) from public, anon;
grant execute on function public.gestiones_ocupado(uuid, date) to authenticated;
