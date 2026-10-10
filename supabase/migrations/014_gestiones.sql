-- Gestiones comerciales: visitas, ferias y acciones en empresas, con sus
-- prospectos y altas. Más: rol Líder (ve el tablero de su equipo), la cuenta de
-- prueba (Prospect, cambia de perfil sola) y un interruptor general para
-- prender/apagar todo esto sin tocar código.
--
-- Interruptor app_flags.gestiones:
--   off    → nadie ve ni escribe nada de esto (las policies lo cortan acá abajo,
--            no sólo la pantalla).
--   prueba → sólo el admin y las cuentas de prueba (profiles.es_prueba).
--   on     → todos los activos (qué pantalla ve cada perfil lo decide
--            Facultades → "Gestiones comerciales", como el resto de la app).
--
-- Quién ve una gestión: el hunter que la hace, el oficial dueño de la empresa
-- (el que la "cede"), quien la creó, el líder de cualquiera de ellos, y el admin.
-- Las cuentas de prueba marcan sus gestiones (prueba=true) y el tablero las
-- deja afuera salvo que el admin pida verlas.
--
-- Idempotente: se puede correr varias veces.

-- ── 1) Interruptor ──────────────────────────────────────────────────────────
create table if not exists public.app_flags (
  clave      text primary key,
  valor      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_flags enable row level security;
drop policy if exists "flags: leer" on public.app_flags;
create policy "flags: leer" on public.app_flags
  for select to authenticated using (public.is_active());
drop policy if exists "flags: admin escribe" on public.app_flags;
create policy "flags: admin escribe" on public.app_flags
  for all to authenticated
  using (public.is_active() and public.get_my_role() = 'admin')
  with check (public.is_active() and public.get_my_role() = 'admin'
              and (clave <> 'gestiones' or valor in ('off','prueba','on')));
insert into public.app_flags(clave, valor) values ('gestiones', 'prueba')
  on conflict (clave) do nothing;

-- ── 2) profiles: rol Líder, a qué líder responde cada uno, cuenta de prueba ──
alter table public.profiles add column if not exists es_prueba boolean not null default false;
alter table public.profiles add column if not exists lider_id uuid references auth.users(id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_lider_no_uno_mismo') then
    alter table public.profiles
      add constraint profiles_lider_no_uno_mismo check (lider_id is null or lider_id <> id);
  end if;
end $$;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','vip','pro','asesor','hunter','lider'));
create index if not exists profiles_lider_idx on public.profiles(lider_id);

-- El guardia de siempre (001) + dos cosas: nadie se cambia solo el líder ni se
-- marca/desmarca como cuenta de prueba; y la cuenta de prueba SÍ puede cambiar
-- su propio rol, pero sólo a través de prueba_cambiar_rol (que prende un flag
-- de la transacción) y nunca a admin.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() = 'admin' then return new; end if;
  if auth.role() is distinct from 'authenticated' then return new; end if;
  if new.es_prueba is distinct from old.es_prueba or new.lider_id is distinct from old.lider_id then
    raise exception 'No autorizado a modificar el líder o la marca de prueba';
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status then
    if old.es_prueba
       and new.id = auth.uid()
       and new.status is not distinct from old.status
       and new.role <> 'admin'
       and coalesce(current_setting('fg.prueba_rol', true), '') = '1' then
      return new;
    end if;
    raise exception 'No autorizado a modificar rol o estado';
  end if;
  return new;
end;
$$;

create or replace function public.prueba_cambiar_rol(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and es_prueba) then
    raise exception 'Sólo la cuenta de prueba puede cambiar de perfil';
  end if;
  if p_role not in ('asesor','vip','pro','hunter','lider') then
    raise exception 'Perfil inválido';
  end if;
  perform set_config('fg.prueba_rol', '1', true);
  update public.profiles set role = p_role where id = auth.uid();
  perform set_config('fg.prueba_rol', '', true);
  return p_role;
end;
$$;
revoke all on function public.prueba_cambiar_rol(text) from public;
grant execute on function public.prueba_cambiar_rol(text) to authenticated;

-- ── 3) Helpers ──────────────────────────────────────────────────────────────
create or replace function public.gestiones_on()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case coalesce((select valor from public.app_flags where clave = 'gestiones'), 'off')
    when 'on' then true
    when 'prueba' then (
      public.get_my_role() = 'admin'
      or exists (select 1 from public.profiles where id = auth.uid() and es_prueba)
    )
    else false
  end;
$$;
revoke all on function public.gestiones_on() from public;
grant execute on function public.gestiones_on() to authenticated;

create or replace function public.es_lider_de(p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_uid is not null and exists(
    select 1 from public.profiles p where p.id = p_uid and p.lider_id = auth.uid()
  );
$$;
revoke all on function public.es_lider_de(uuid) from public;
grant execute on function public.es_lider_de(uuid) to authenticated;

create or replace function public.puede_ver_gestion(p_hunter uuid, p_dueno uuid, p_creada uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() = p_hunter or auth.uid() = p_dueno or auth.uid() = p_creada
      or public.get_my_role() = 'admin'
      or public.es_lider_de(p_hunter) or public.es_lider_de(p_dueno) or public.es_lider_de(p_creada);
$$;
revoke all on function public.puede_ver_gestion(uuid, uuid, uuid) from public;
grant execute on function public.puede_ver_gestion(uuid, uuid, uuid) to authenticated;

-- Nombres de las personas (para elegir hunter, filtrar y mostrar quién hizo
-- qué). Un no-admin no puede leer profiles ajenos: por eso security definer, y
-- sólo con el interruptor prendido para quien llama.
create or replace function public.gestiones_personas()
returns table(id uuid, nombre text, rol text, lider_id uuid, es_prueba boolean)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email, 'Sin nombre'), p.role, p.lider_id, p.es_prueba
    from public.profiles p
   where p.status = 'active' and public.gestiones_on() and public.is_active()
   order by 2;
$$;
revoke all on function public.gestiones_personas() from public;
grant execute on function public.gestiones_personas() to authenticated;

-- ── 4) Tablas ───────────────────────────────────────────────────────────────
create table if not exists public.gestiones (
  id           uuid primary key default gen_random_uuid(),
  empresa      text not null,
  empresa_key  text not null,                                   -- lower(trim(empresa)), lo pone el trigger
  dueno_id     uuid references auth.users(id) on delete set null, -- oficial dueño en el padrón: el que "cede"
  hunter_id    uuid references auth.users(id) on delete set null, -- quien la hace
  creada_por   uuid references auth.users(id) on delete set null,
  origen       text not null default 'propia' check (origen in ('propia','derivada')),
  tipo         text not null default 'visita' check (tipo in ('visita','feria','accion')),
  modalidad    text not null default 'presencial' check (modalidad in ('presencial','virtual')),
  frecuencia   text not null default 'unica' check (frecuencia in ('unica','semanal','quincenal','mensual')),
  serie_id     uuid,                                            -- agrupa las repeticiones de una feria
  fecha        date not null default current_date,
  estado       text not null default 'realizada' check (estado in ('planificada','realizada','cancelada')),
  dotacion     integer check (dotacion is null or dotacion between 0 and 1000000),
  asistentes   integer check (asistentes is null or asistentes between 0 and 1000000),
  nota         text check (nota is null or length(nota) <= 2000),
  visto_hunter boolean not null default true,                   -- false: derivada que el hunter todavía no abrió
  prueba       boolean not null default false,                  -- la tocó una cuenta de prueba
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists gestiones_fecha_idx  on public.gestiones(fecha);
create index if not exists gestiones_hunter_idx on public.gestiones(hunter_id, fecha);
create index if not exists gestiones_dueno_idx  on public.gestiones(dueno_id, fecha);
create index if not exists gestiones_creada_idx on public.gestiones(creada_por);
create index if not exists gestiones_emp_idx    on public.gestiones(dueno_id, empresa_key);

create table if not exists public.gestion_prospectos (
  id          uuid primary key default gen_random_uuid(),
  gestion_id  uuid not null references public.gestiones(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 1 and 120),
  cuil        text check (cuil is null or cuil ~ '^[0-9]{11}$'),
  renta       smallint check (renta is null or renta between 1 and 4),
  estado      text not null default 'prospecto' check (estado in ('prospecto','en_gestion','alta','descartado')),
  fecha_alta  date,
  creado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gestion_prospectos_g_idx on public.gestion_prospectos(gestion_id);

-- ── 5) Triggers: lo que el cliente no decide ────────────────────────────────
create or replace function public.gestiones_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    if new.serie_id is null then new.serie_id := gen_random_uuid(); end if;
  else
    -- Lo que identifica la gestión no cambia después de creada.
    new.id := old.id; new.empresa := old.empresa; new.empresa_key := old.empresa_key;
    new.dueno_id := old.dueno_id; new.creada_por := old.creada_por; new.origen := old.origen;
    new.serie_id := old.serie_id; new.created_at := old.created_at;
    -- Reasignar el hunter: sólo quien la creó (el oficial que la derivó) o el admin.
    if new.hunter_id is distinct from old.hunter_id
       and not (auth.uid() = old.creada_por or public.get_my_role() = 'admin') then
      new.hunter_id := old.hunter_id;
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
drop trigger if exists trg_gestiones_antes on public.gestiones;
create trigger trg_gestiones_antes before insert or update on public.gestiones
  for each row execute function public.gestiones_antes();

create or replace function public.gestion_prospectos_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.nombre := trim(new.nombre);
  if new.cuil is not null then
    new.cuil := nullif(regexp_replace(new.cuil, '[^0-9]', '', 'g'), '');
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
  else
    new.id := old.id; new.gestion_id := old.gestion_id;
    new.creado_por := old.creado_por; new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.estado = 'alta' and new.fecha_alta is null then new.fecha_alta := current_date; end if;
  if new.estado <> 'alta' then new.fecha_alta := null; end if;
  return new;
end;
$$;
drop trigger if exists trg_gestion_prospectos_antes on public.gestion_prospectos;
create trigger trg_gestion_prospectos_antes before insert or update on public.gestion_prospectos
  for each row execute function public.gestion_prospectos_antes();

-- ── 6) RLS ──────────────────────────────────────────────────────────────────
alter table public.gestiones enable row level security;
alter table public.gestion_prospectos enable row level security;

drop policy if exists "gestiones: ver" on public.gestiones;
create policy "gestiones: ver" on public.gestiones
  for select to authenticated
  using (public.is_active() and public.gestiones_on()
         and public.puede_ver_gestion(hunter_id, dueno_id, creada_por));

-- Crear: el hunter registra la suya (propia) o el oficial deriva una de SU
-- empresa (derivada). Quién es dueño y quién creó lo fija el trigger.
drop policy if exists "gestiones: crear" on public.gestiones;
create policy "gestiones: crear" on public.gestiones
  for insert to authenticated
  with check (public.is_active() and public.gestiones_on()
              and (origen = 'propia' or origen = 'derivada'));

drop policy if exists "gestiones: editar" on public.gestiones;
create policy "gestiones: editar" on public.gestiones
  for update to authenticated
  using (public.is_active() and public.gestiones_on()
         and (hunter_id = auth.uid() or creada_por = auth.uid() or public.get_my_role() = 'admin'))
  with check (public.is_active() and public.gestiones_on()
         and (hunter_id = auth.uid() or creada_por = auth.uid() or public.get_my_role() = 'admin'));

drop policy if exists "gestiones: borrar" on public.gestiones;
create policy "gestiones: borrar" on public.gestiones
  for delete to authenticated
  using (public.is_active() and public.gestiones_on()
         and (creada_por = auth.uid() or public.get_my_role() = 'admin'));

-- Prospectos: los ve quien ve la gestión (la subconsulta pasa por la RLS de
-- gestiones); los escribe quien puede editar la gestión.
drop policy if exists "prospectos: ver" on public.gestion_prospectos;
create policy "prospectos: ver" on public.gestion_prospectos
  for select to authenticated
  using (exists (select 1 from public.gestiones g where g.id = gestion_id));

drop policy if exists "prospectos: escribir" on public.gestion_prospectos;
create policy "prospectos: escribir" on public.gestion_prospectos
  for all to authenticated
  using (public.is_active() and public.gestiones_on() and exists (
    select 1 from public.gestiones g where g.id = gestion_id
       and (g.hunter_id = auth.uid() or g.creada_por = auth.uid() or public.get_my_role() = 'admin')))
  with check (public.is_active() and public.gestiones_on() and exists (
    select 1 from public.gestiones g where g.id = gestion_id
       and (g.hunter_id = auth.uid() or g.creada_por = auth.uid() or public.get_my_role() = 'admin')));

-- ── 7) Tablero: los números ya sumados (un par de KB, no las filas) ─────────
-- security INVOKER a propósito: corre con la RLS de quien pregunta, así cada uno
-- suma sólo lo que puede ver (el hunter lo suyo, el oficial sus empresas, el
-- líder su equipo, el admin todo).
create or replace function public.gestiones_tablero(
  p_desde date default null, p_hasta date default null, p_tipo text default null,
  p_hunter uuid default null, p_dueno uuid default null, p_prueba boolean default false
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
revoke all on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean) from public;
grant execute on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean) to authenticated;
