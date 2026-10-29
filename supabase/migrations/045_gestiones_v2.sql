-- 045: Gestiones v2 (2026-10-29). PRUEBA EN RAMA APARTE: no aplicar hasta que
-- el dueño apruebe la demo.
--  1) CUIT de la empresa en cada gestión (se copia del padrón al crearla).
--  2) Tipo nuevo "Base de datos" (tipo 'datos'): una lista de personas que el
--     hunter trabaja a distancia, con "trabajarla hasta" (vence). Las personas
--     arrancan "A contactar".
--  3) Derivar "al equipo": sin hunter y con lider_id → bandeja "Por asignar"
--     del líder.
--  4) Cambiar el hunter: admin, el oficial que la derivó (mientras no esté
--     realizada) y el líder (de un hunter de su equipo a otro). El hunter nunca.
--  5) Horarios que se pisan: la base los frena, salvo admin o líder del hunter.
--  6) "No puedo ir" del hunter, conversación por acción (mensajes y leídos) e
--     historial (eventos que escriben los triggers).
--  7) Prospectos: contacto, referencia, motivo de descarte y próximo contacto;
--     un alta lleva paquete y un descarte, motivo.
-- Idempotente.

-- ── 1) Columnas nuevas ──────────────────────────────────────────────────────
alter table public.gestiones add column if not exists cuit text;
alter table public.gestiones add column if not exists lider_id uuid references auth.users(id) on delete set null;
alter table public.gestiones add column if not exists vence date;
alter table public.gestiones add column if not exists no_puede_at timestamptz;
alter table public.gestiones add column if not exists no_puede_motivo text;
alter table public.gestiones drop constraint if exists gestiones_no_puede_ok;
alter table public.gestiones add constraint gestiones_no_puede_ok check (no_puede_motivo is null or length(no_puede_motivo) <= 500);
alter table public.gestiones drop constraint if exists gestiones_tipo_check;
alter table public.gestiones add constraint gestiones_tipo_check check (tipo in ('accion','feria','posicion','datos'));
create index if not exists gestiones_por_asignar_idx on public.gestiones(lider_id) where hunter_id is null;
create index if not exists gestiones_no_puede_idx on public.gestiones(hunter_id) where no_puede_at is not null;

alter table public.gestion_prospectos add column if not exists contacto text;
alter table public.gestion_prospectos add column if not exists referencia text;
alter table public.gestion_prospectos add column if not exists motivo text;
alter table public.gestion_prospectos add column if not exists proximo date;
alter table public.gestion_prospectos drop constraint if exists gestion_prospectos_estado_check;
alter table public.gestion_prospectos add constraint gestion_prospectos_estado_check
  check (estado in ('a_contactar','prospecto','en_gestion','alta','descartado'));
alter table public.gestion_prospectos drop constraint if exists gestion_prospectos_motivo_check;
alter table public.gestion_prospectos add constraint gestion_prospectos_motivo_check
  check (motivo is null or motivo in ('ya_galicia','no_interesa','no_contesta','no_califica','otro'));
alter table public.gestion_prospectos drop constraint if exists gestion_prospectos_textos_ok;
alter table public.gestion_prospectos add constraint gestion_prospectos_textos_ok
  check ((contacto is null or length(contacto) <= 120) and (referencia is null or length(referencia) <= 120));
create index if not exists gestion_prospectos_proximo_idx on public.gestion_prospectos(proximo) where proximo is not null;

-- CUIT de lo que ya existe (antes de cambiar el trigger: el nuevo no lo deja tocar).
update public.gestiones g set cuit = x.c
  from (select pe.user_id, lower(trim(pe.empresa)) as k, array_to_string(pe.cuits, ',') as c
          from public.padron_empresas pe) x
 where g.cuit is null and x.user_id = g.dueno_id and x.k = g.empresa_key and coalesce(x.c, '') <> '';

-- Fin de un tramo: sin "hasta" se toma una hora (sin pasar de medianoche).
create or replace function public.ges_fin(p_desde time, p_hasta time)
returns time
language sql
immutable
set search_path = public
as $$
  select coalesce(p_hasta, case when p_desde >= time '23:00' then time '23:59:59' else p_desde + interval '1 hour' end);
$$;
revoke all on function public.ges_fin(time, time) from public, anon;

-- ── 2) Trigger: lo que el cliente no decide ─────────────────────────────────
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
    new.cuit := coalesce(old.cuit, new.cuit);
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

create or replace function public.gestion_prospectos_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_era     text;
  v_paq_era text;
begin
  new.nombre := trim(new.nombre);
  if new.cuil is not null then
    new.cuil := nullif(regexp_replace(new.cuil, '[^0-9]', '', 'g'), '');
  end if;
  new.contacto := nullif(trim(new.contacto), '');
  new.referencia := nullif(trim(new.referencia), '');
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
  else
    new.id := old.id; new.gestion_id := old.gestion_id;
    new.creado_por := old.creado_por; new.created_at := old.created_at;
    new.updated_at := now();
    v_era := old.estado; v_paq_era := old.paquete;
  end if;
  -- Un alta dice con qué paquete fue ("Sin paquete" = Caja de Ahorro) y un
  -- descarte, por qué. Las altas viejas sin paquete se pueden seguir editando.
  if new.estado = 'alta' and new.paquete is null
     and (v_era is distinct from 'alta' or v_paq_era is not null) then
    raise exception 'GES_PAQ: elegí con qué paquete fue el alta';
  end if;
  if new.estado = 'descartado' and new.motivo is null and v_era is distinct from 'descartado' then
    raise exception 'GES_MOT: elegí por qué se descarta';
  end if;
  if new.estado <> 'descartado' then new.motivo := null; end if;
  if new.estado in ('alta','descartado') then new.proximo := null; end if;
  if new.estado = 'alta' and new.fecha_alta is null then new.fecha_alta := current_date; end if;
  if new.estado <> 'alta' then new.fecha_alta := null; end if;
  return new;
end;
$$;
revoke execute on function public.gestion_prospectos_antes() from public, anon, authenticated;

-- ── 3) Quién ve y quién edita ───────────────────────────────────────────────
-- Suma el líder que reparte (lider_id). Editar: además el líder del hunter
-- (cambia hunter, día, horario, nota; los prospectos no).
alter policy "gestiones: ver" on public.gestiones
  using (((select public.is_active()) and (select public.gestiones_on())
          and (public.puede_ver_gestion(hunter_id, dueno_id, creada_por) or lider_id = (select auth.uid()))));

alter policy "gestiones: editar" on public.gestiones
  using (((select public.is_active()) and (select public.gestiones_on())
          and ((hunter_id = (select auth.uid())) or (creada_por = (select auth.uid())) or (lider_id = (select auth.uid()))
               or public.es_lider_de(hunter_id) or ((select public.get_my_role()) = 'admin'))))
  with check (((select public.is_active()) and (select public.gestiones_on())
          and ((hunter_id = (select auth.uid())) or (creada_por = (select auth.uid())) or (lider_id = (select auth.uid()))
               or public.es_lider_de(hunter_id) or ((select public.get_my_role()) = 'admin'))));

-- ── 4) Conversación, leídos e historial ─────────────────────────────────────
create table if not exists public.gestion_mensajes (
  id          uuid primary key default gen_random_uuid(),
  gestion_id  uuid not null references public.gestiones(id) on delete cascade,
  autor       uuid references auth.users(id) on delete set null,
  tipo        text not null default 'msg' check (tipo in ('msg','no_puedo')),
  texto       text not null check (length(trim(texto)) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists gestion_mensajes_g_idx on public.gestion_mensajes(gestion_id, created_at);
create index if not exists gestion_mensajes_autor_idx on public.gestion_mensajes(autor);

create table if not exists public.gestion_leido (
  gestion_id  uuid not null references public.gestiones(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  at          timestamptz not null default now(),
  primary key (gestion_id, user_id)
);
create index if not exists gestion_leido_user_idx on public.gestion_leido(user_id);

create table if not exists public.gestion_eventos (
  id          uuid primary key default gen_random_uuid(),
  gestion_id  uuid not null references public.gestiones(id) on delete cascade,
  quien       uuid references auth.users(id) on delete set null,
  que         text not null,
  detalle     jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);
create index if not exists gestion_eventos_g_idx on public.gestion_eventos(gestion_id, at);
create index if not exists gestion_eventos_quien_idx on public.gestion_eventos(quien);

alter table public.gestion_mensajes enable row level security;
alter table public.gestion_leido enable row level security;
alter table public.gestion_eventos enable row level security;
-- Leer: quien ve la gestión (la subconsulta pasa por la RLS de gestiones).
-- Escribir: sólo las funciones de abajo y los triggers.
drop policy if exists "mensajes: ver" on public.gestion_mensajes;
create policy "mensajes: ver" on public.gestion_mensajes for select to authenticated
  using (exists (select 1 from public.gestiones g where g.id = gestion_id));
drop policy if exists "leido: ver lo mio" on public.gestion_leido;
create policy "leido: ver lo mio" on public.gestion_leido for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "eventos: ver" on public.gestion_eventos;
create policy "eventos: ver" on public.gestion_eventos for select to authenticated
  using (exists (select 1 from public.gestiones g where g.id = gestion_id));

-- ¿Quien llama participa de esta gestión? (hunter, dueño, quien la creó,
-- el líder que reparte o el líder del hunter). El admin ve todo, pero las
-- novedades de mensajes son sólo de lo que participa.
create or replace function public.gestion_participa(p_g public.gestiones)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() in (p_g.hunter_id, p_g.dueno_id, p_g.creada_por, p_g.lider_id)
      or public.es_lider_de(p_g.hunter_id);
$$;
revoke all on function public.gestion_participa(public.gestiones) from public, anon;
grant execute on function public.gestion_participa(public.gestiones) to authenticated;

create or replace function public.gestion_marcar_leida(p_gestion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active() or not public.gestiones_on() then return; end if;
  if not exists (select 1 from public.gestiones g where g.id = p_gestion
                 and (public.puede_ver_gestion(g.hunter_id, g.dueno_id, g.creada_por) or g.lider_id = auth.uid())) then
    return;
  end if;
  insert into public.gestion_leido(gestion_id, user_id, at) values (p_gestion, auth.uid(), now())
    on conflict (gestion_id, user_id) do update set at = excluded.at;
end;
$$;
revoke all on function public.gestion_marcar_leida(uuid) from public, anon;
grant execute on function public.gestion_marcar_leida(uuid) to authenticated;

create or replace function public.gestion_mensaje_enviar(p_gestion uuid, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_active() or not public.gestiones_on() then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribí el mensaje'; end if;
  if not exists (select 1 from public.gestiones g where g.id = p_gestion
                 and (public.puede_ver_gestion(g.hunter_id, g.dueno_id, g.creada_por) or g.lider_id = auth.uid())) then
    raise exception 'No tenés acceso a esa acción';
  end if;
  insert into public.gestion_mensajes(gestion_id, autor, tipo, texto)
    values (p_gestion, auth.uid(), 'msg', left(trim(p_texto), 1000)) returning id into v_id;
  perform public.gestion_marcar_leida(p_gestion);
  return v_id;
end;
$$;
revoke all on function public.gestion_mensaje_enviar(uuid, text) from public, anon;
grant execute on function public.gestion_mensaje_enviar(uuid, text) to authenticated;

-- "No puedo ir": sólo el hunter de una acción planificada. Le llega al oficial
-- y al líder como mensaje; la acción sigue en su agenda hasta que la reasignen.
create or replace function public.gestion_no_puedo(p_gestion uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.gestiones;
begin
  if not public.is_active() or not public.gestiones_on() then raise exception 'No autorizado'; end if;
  select * into g from public.gestiones where id = p_gestion;
  if not found or g.hunter_id is distinct from auth.uid() then raise exception 'Sólo el hunter de esa acción puede avisar que no puede'; end if;
  if g.estado <> 'planificada' then raise exception 'Sólo se avisa en una acción planificada'; end if;
  perform set_config('fg.no_puede', '1', true);
  update public.gestiones set no_puede_at = now(), no_puede_motivo = left(nullif(trim(p_motivo), ''), 500) where id = p_gestion;
  perform set_config('fg.no_puede', '', true);
  insert into public.gestion_mensajes(gestion_id, autor, tipo, texto)
    values (p_gestion, auth.uid(), 'no_puedo', left(coalesce(nullif(trim(p_motivo), ''), 'No puedo ir'), 1000));
  perform public.gestion_marcar_leida(p_gestion);
end;
$$;
revoke all on function public.gestion_no_puedo(uuid, text) from public, anon;
grant execute on function public.gestion_no_puedo(uuid, text) to authenticated;

-- Mensajes de otros sin leer, por gestión, de lo que quien llama participa.
-- security invoker: la RLS de gestiones y mensajes ya filtra.
create or replace function public.gestiones_mensajes_nuevos()
returns table(gestion_id uuid, serie_id uuid, empresa text, n integer, ultimo_autor uuid, ultimo_at timestamptz, no_puedo boolean)
language sql
stable
set search_path = public
as $$
  select m.gestion_id, g.serie_id, g.empresa, count(*)::integer,
         (array_agg(m.autor order by m.created_at desc))[1], max(m.created_at), bool_or(m.tipo = 'no_puedo')
    from public.gestion_mensajes m
    join public.gestiones g on g.id = m.gestion_id
    left join public.gestion_leido l on l.gestion_id = m.gestion_id and l.user_id = (select auth.uid())
   where m.autor is distinct from (select auth.uid())
     and m.created_at > coalesce(l.at, '-infinity'::timestamptz)
     and public.gestion_participa(g)
   group by m.gestion_id, g.serie_id, g.empresa
   order by max(m.created_at) desc
   limit 100;
$$;
revoke all on function public.gestiones_mensajes_nuevos() from public, anon;
grant execute on function public.gestiones_mensajes_nuevos() to authenticated;

-- Historial: lo anotan los triggers, nadie lo escribe a mano.
create or replace function public.gestiones_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.gestion_eventos(gestion_id, quien, que, detalle) values (new.id, auth.uid(),
      case when new.origen = 'propia' then 'registrada' when new.hunter_id is null then 'por_asignar' else 'derivada' end,
      jsonb_build_object('hunter', new.hunter_id, 'lider', new.lider_id, 'estado', new.estado));
    return null;
  end if;
  if new.hunter_id is distinct from old.hunter_id then
    insert into public.gestion_eventos(gestion_id, quien, que, detalle)
      values (new.id, auth.uid(), 'hunter', jsonb_build_object('de', old.hunter_id, 'a', new.hunter_id));
  end if;
  if new.fecha is distinct from old.fecha or new.hora_desde is distinct from old.hora_desde or new.hora_hasta is distinct from old.hora_hasta then
    insert into public.gestion_eventos(gestion_id, quien, que, detalle)
      values (new.id, auth.uid(), 'horario', jsonb_build_object(
        'fecha_de', old.fecha, 'fecha_a', new.fecha,
        'desde_de', to_char(old.hora_desde, 'HH24:MI'), 'hasta_de', to_char(old.hora_hasta, 'HH24:MI'),
        'desde_a', to_char(new.hora_desde, 'HH24:MI'), 'hasta_a', to_char(new.hora_hasta, 'HH24:MI')));
  end if;
  if new.estado is distinct from old.estado then
    insert into public.gestion_eventos(gestion_id, quien, que, detalle)
      values (new.id, auth.uid(), 'estado', jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;
  if new.no_puede_at is not null and old.no_puede_at is null then
    insert into public.gestion_eventos(gestion_id, quien, que, detalle)
      values (new.id, auth.uid(), 'no_puede', jsonb_build_object('motivo', new.no_puede_motivo));
  end if;
  return null;
end;
$$;
revoke execute on function public.gestiones_despues() from public, anon, authenticated;
drop trigger if exists trg_gestiones_despues on public.gestiones;
create trigger trg_gestiones_despues after insert or update on public.gestiones
  for each row execute function public.gestiones_despues();

create or replace function public.gestion_prospectos_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_era text;
begin
  if tg_op = 'UPDATE' then v_era := old.estado; end if;
  if new.estado = 'alta' and v_era is distinct from 'alta' then
    insert into public.gestion_eventos(gestion_id, quien, que, detalle)
      values (new.gestion_id, auth.uid(), 'alta', jsonb_build_object('nombre', new.nombre, 'paquete', new.paquete));
  elsif new.estado = 'descartado' and v_era is distinct from 'descartado' then
    insert into public.gestion_eventos(gestion_id, quien, que, detalle)
      values (new.gestion_id, auth.uid(), 'descarte', jsonb_build_object('nombre', new.nombre, 'motivo', new.motivo));
  end if;
  return null;
end;
$$;
revoke execute on function public.gestion_prospectos_despues() from public, anon, authenticated;
drop trigger if exists trg_gestion_prospectos_despues on public.gestion_prospectos;
create trigger trg_gestion_prospectos_despues after insert or update on public.gestion_prospectos
  for each row execute function public.gestion_prospectos_despues();

-- ── 5) Lecturas ─────────────────────────────────────────────────────────────
-- Lista: igual que la 016, con el líder en "sólo lo mío" y los conteos de una
-- base de datos (n_pros ya no cuenta a los "A contactar").
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
               'n_pros',  (select count(*) from public.gestion_prospectos p where p.gestion_id = g.id and p.estado <> 'a_contactar'),
               'n_altas', (select count(*) from public.gestion_prospectos p where p.gestion_id = g.id and p.estado = 'alta'),
               'n_datos', (select count(*) from public.gestion_prospectos p where p.gestion_id = g.id)
             ) as j
        from public.gestiones g
       where not coalesce(p_solo_mio, false) or (select auth.uid()) in (g.hunter_id, g.dueno_id, g.creada_por, g.lider_id)
       order by g.fecha desc, g.created_at desc
       limit least(greatest(coalesce(p_limit, 300), 1), 2000)
    ) x;
$$;
revoke all on function public.gestiones_lista(integer, boolean) from public, anon;
grant execute on function public.gestiones_lista(integer, boolean) to authenticated;

-- Ocupado de un hunter en un día: sin las bases de datos (no tienen horario).
create or replace function public.gestiones_ocupado(p_hunter uuid, p_fecha date)
returns table(id uuid, hora_desde time, hora_hasta time, tipo text, empresa text)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.hora_desde, g.hora_hasta, g.tipo,
         case when public.puede_ver_gestion(g.hunter_id, g.dueno_id, g.creada_por) or g.lider_id = auth.uid() then g.empresa end
    from public.gestiones g
   where public.is_active() and public.gestiones_on()
     and g.hunter_id = p_hunter and g.fecha = p_fecha and g.estado <> 'cancelada' and g.tipo <> 'datos'
   order by g.hora_desde nulls first;
$$;
revoke all on function public.gestiones_ocupado(uuid, date) from public, anon;
grant execute on function public.gestiones_ocupado(uuid, date) to authenticated;

-- Horarios de todos los hunters en un día (sin empresas): para "libres a esa hora".
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
     and g.fecha = p_fecha and g.estado <> 'cancelada' and g.hunter_id is not null
     and g.hora_desde is not null and g.tipo <> 'datos';
$$;
revoke all on function public.gestiones_dia(date) from public, anon;
grant execute on function public.gestiones_dia(date) to authenticated;

-- Empresas para elegir: igual que la 032, con sus CUIT y buscando también por CUIT.
-- Cambia lo que devuelve: hay que borrarla antes.
drop function if exists public.gestiones_empresas(text, integer);
create function public.gestiones_empresas(p_q text default null, p_limit integer default 30)
returns table(empresa text, dueno_id uuid, cuits text[])
language sql
security definer
stable
set search_path = public
as $$
  with yo as (select public.get_my_role() as rol, public.soy_prueba() as prueba, public.ids_prueba() as ids,
                     lower(trim(coalesce(p_q, ''))) as q, regexp_replace(coalesce(p_q, ''), '\D', '', 'g') as d)
  select pe.empresa, pe.user_id, pe.cuits
    from public.padron_empresas pe, yo
   where public.is_active() and public.gestiones_on()
     and (yo.rol = 'admin'
          or (yo.rol = 'hunter' and (pe.user_id = any(yo.ids)) = yo.prueba)
          or pe.user_id = auth.uid()
          or public.es_lider_de(pe.user_id))
     and (yo.q = '' or lower(pe.empresa) like '%' || yo.q || '%'
          or (length(yo.d) >= 4 and exists (select 1 from unnest(pe.cuits) c where c like '%' || yo.d || '%')))
   order by pe.empresa
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.gestiones_empresas(text, integer) from public, anon;
grant execute on function public.gestiones_empresas(text, integer) to authenticated;

-- Tablero: igual que la 027, con
--   r            = realizadas + bases de datos no canceladas (se trabajan mientras están abiertas)
--   pr           = personas contactadas (sin las "A contactar")
--   kpis.datos / kpis.contactados  personas de bases de datos y cuántas se contactaron
--   por_motivo   descartes por motivo
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
      'planificadas', (select count(*) from g where estado = 'planificada' and tipo <> 'datos'),
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
end;
$$;
revoke all on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) to authenticated;
