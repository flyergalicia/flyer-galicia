-- Avisos de Gestiones (2026-10-11).
--   Hunter: una acción que le derivaron y todavía no abrió (visto_hunter, ya existía).
--   Oficial dueño: NUEVO visto_dueno → un hunter registró una acción en una empresa
--   suya, o completó una que él derivó. Las altas no avisan (se ven en el tablero).
-- "Visto" se marca por SERIE (una serie de 3 fechas es un solo aviso) y sólo con
-- gestion_marcar_vista: el dueño no puede editar una acción que registró el
-- hunter, y nadie puede apagarle el aviso al otro con un update directo.
-- Idempotente.

alter table public.gestiones add column if not exists visto_dueno boolean not null default true;
create index if not exists gestiones_novedad_idx on public.gestiones(dueno_id) where not visto_dueno;
create index if not exists gestiones_nueva_idx on public.gestiones(hunter_id) where not visto_hunter;

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
      new.dueno_id := auth.uid();     -- deriva el dueño de la empresa
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
    -- Novedad para el dueño si la registró otro (un hunter en una empresa suya).
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

-- Marca vista una serie para quien llama: como hunter (las que le derivaron) y
-- como dueño (las novedades de sus empresas). No toca nada más.
create or replace function public.gestion_marcar_vista(p_serie uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_active() or not public.gestiones_on() then return 0; end if;
  perform set_config('fg.marcar_vista', '1', true);
  update public.gestiones
     set visto_hunter = case when hunter_id = auth.uid() then true else visto_hunter end,
         visto_dueno  = case when dueno_id  = auth.uid() then true else visto_dueno  end
   where serie_id = p_serie
     and (hunter_id = auth.uid() or dueno_id = auth.uid())
     and ((hunter_id = auth.uid() and not visto_hunter) or (dueno_id = auth.uid() and not visto_dueno));
  get diagnostics v_n = row_count;
  perform set_config('fg.marcar_vista', '', true);
  return v_n;
end;
$$;
revoke all on function public.gestion_marcar_vista(uuid) from public;
grant execute on function public.gestion_marcar_vista(uuid) to authenticated;

-- Lo que ya existía no aparece como novedad.
do $$
begin
  perform set_config('fg.marcar_vista', '1', true);
  update public.gestiones set visto_dueno = true where not visto_dueno;
  perform set_config('fg.marcar_vista', '', true);
end $$;
