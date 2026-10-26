-- 034: Estudio — preguntar antes de aprobar y compartir un diseño con alguien
-- (pedido del dueño, 26-oct-2026).
--
-- 1) PREGUNTAR: el admin, antes de aprobar o no aprobar un pedido de
--    publicación, le puede hacer una pregunta al autor (igual que "Repreguntar"
--    en los cambios de oficiales de los hunters, migración 013).
--    · Estado nuevo 'consulta' (esperando la respuesta del autor).
--    · Tabla flyer_diseno_mensajes: el hilo. Se escribe SÓLO por las funciones
--      de abajo y se lee con la misma regla que el diseño (autor o admin).
--    · flyer_diseno_consultar (admin): pedido/consulta → consulta.
--    · flyer_diseno_responder (autor): consulta → pedido.
--    · En 'consulta' el admin igual puede aprobar o no aprobar, y el autor puede
--      cambiar el diseño ("Guardar cambios") o cancelar el pedido. El autor no
--      puede pasar un diseño a 'consulta' por su cuenta (lo frena la guardia).
--
-- 2) COMPARTIR: sólo el admin le manda una COPIA de un diseño a una o más
--    personas; les aparece en su Estudio como propia (la pueden usar, cambiar
--    o borrar) con "Te lo compartió X". Columnas compartido_por / compartido_de
--    / compartido_at, que sólo escribe flyer_diseno_compartir (la guardia las
--    limpia en cualquier otro alta o cambio). Volver a compartir el mismo
--    diseño con alguien que ya tiene la copia se la reemplaza por la versión
--    nueva, salvo que esa copia esté pedida o publicada.
--
-- Idempotente: se puede correr varias veces.

-- ── 1) Estado 'consulta' ──────────────────────────────────────────────────
do $$
declare
  v_con record;
begin
  for v_con in
    select c.conname
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public' and rel.relname = 'flyer_disenos'
       and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%estado%'
  loop
    execute format('alter table public.flyer_disenos drop constraint %I', v_con.conname);
  end loop;
  alter table public.flyer_disenos
    add constraint flyer_disenos_estado_check
    check (estado in ('privado','pedido','consulta','publicado','rechazado'));
end $$;

drop index if exists public.flyer_disenos_estado_idx;
create index if not exists flyer_disenos_estado_idx on public.flyer_disenos(estado) where estado in ('pedido','consulta');

-- ── 2) Columnas de "compartido" ───────────────────────────────────────────
alter table public.flyer_disenos add column if not exists compartido_por text not null default '';
alter table public.flyer_disenos add column if not exists compartido_de  uuid references public.flyer_disenos(id) on delete set null;
alter table public.flyer_disenos add column if not exists compartido_at  timestamptz;
create index if not exists flyer_disenos_compartido_idx on public.flyer_disenos(compartido_de, user_id) where compartido_de is not null;

-- ── 3) El autor puede guardar cambios mientras el diseño está en consulta ──
drop policy if exists "disenos: modificar" on public.flyer_disenos;
create policy "disenos: modificar" on public.flyer_disenos
  for update using (
    (select public.is_active())
    and ((user_id = (select auth.uid()) and estado <> 'publicado') or (select public.get_my_role()) = 'admin')
  )
  with check (
    (select public.is_active())
    and ((user_id = (select auth.uid()) and estado in ('privado','pedido','consulta')) or (select public.get_my_role()) = 'admin')
  );

-- ── 4) Guardia (reemplaza la de 026) ──────────────────────────────────────
-- fg.estudio_compartir = 'si' lo pone SÓLO flyer_diseno_compartir (set_config
-- local a la transacción): con eso, y siendo admin, un alta puede nacer a nombre
-- de otra persona. set_config no está expuesta por la API (vive en pg_catalog).
create or replace function public.flyer_disenos_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := coalesce(public.get_my_role(), '') = 'admin';
  v_comp  boolean := v_admin and coalesce(current_setting('fg.estudio_compartir', true), '') = 'si';
begin
  if tg_op = 'INSERT' then
    if v_comp then
      -- copia compartida: dueño, autor y "compartido" vienen de la función
      new.estado := 'privado';
    else
      new.user_id := auth.uid();
      new.autor := coalesce((select nullif(trim(p.full_name), '') from public.profiles p where p.id = auth.uid()),
                            (select p.email from public.profiles p where p.id = auth.uid()), '');
      new.compartido_por := '';
      new.compartido_de := null;
      new.compartido_at := null;
    end if;
    new.nota_admin := '';
    new.opcion_publicada := null;
    new.revisado_at := null;
    new.pedido_at := case when new.estado = 'pedido' then now() else null end;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  -- UPDATE
  new.id := old.id;
  new.user_id := old.user_id;
  new.autor := old.autor;
  new.created_at := old.created_at;
  new.updated_at := now();
  if not v_comp then
    new.compartido_por := old.compartido_por;
    new.compartido_de := old.compartido_de;
    new.compartido_at := old.compartido_at;
  end if;
  if not v_admin then
    new.nota_admin := old.nota_admin;
    new.opcion_publicada := old.opcion_publicada;
    new.revisado_at := old.revisado_at;
    if new.estado = 'consulta' and old.estado is distinct from 'consulta' then
      raise exception 'Sólo el administrador puede hacer una pregunta sobre un pedido';
    end if;
  else
    if new.estado in ('publicado','rechazado') and new.estado is distinct from old.estado then
      new.revisado_at := now();
    end if;
  end if;
  if new.estado = 'pedido' and old.estado not in ('pedido','consulta') then
    new.pedido_at := now();
  elsif new.estado not in ('pedido','consulta') and not v_admin then
    new.pedido_at := old.pedido_at;
  end if;
  return new;
end;
$$;
revoke all on function public.flyer_disenos_guardia() from public, anon, authenticated;

drop trigger if exists flyer_disenos_guardia on public.flyer_disenos;
create trigger flyer_disenos_guardia
  before insert or update on public.flyer_disenos
  for each row execute function public.flyer_disenos_guardia();

-- ── 5) El hilo ────────────────────────────────────────────────────────────
create table if not exists public.flyer_diseno_mensajes (
  id           uuid primary key default gen_random_uuid(),
  diseno_id    uuid not null references public.flyer_disenos(id) on delete cascade,
  autor_id     uuid references auth.users(id) on delete set null,
  autor_nombre text not null default '',
  rol          text not null check (rol in ('admin','autor')),
  tipo         text not null check (tipo in ('consulta','respuesta')),
  texto        text not null default '' check (char_length(texto) <= 1000),
  created_at   timestamptz not null default now()
);
create index if not exists flyer_diseno_mensajes_idx on public.flyer_diseno_mensajes(diseno_id, created_at);
alter table public.flyer_diseno_mensajes enable row level security;
revoke all on public.flyer_diseno_mensajes from anon;
grant select on public.flyer_diseno_mensajes to authenticated;

-- Se lee si se puede leer el diseño (el subselect pasa por la RLS de
-- flyer_disenos: autor o admin). Sin escritura directa.
drop policy if exists "diseno mensajes: ver" on public.flyer_diseno_mensajes;
create policy "diseno mensajes: ver" on public.flyer_diseno_mensajes
  for select to authenticated
  using ((select public.is_active()) and exists (
    select 1 from public.flyer_disenos d where d.id = diseno_id
  ));

-- ── 6) Preguntar (admin): pedido/consulta → consulta ──────────────────────
create or replace function public.flyer_diseno_consultar(p_id uuid, p_texto text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_d public.flyer_disenos;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if coalesce(public.get_my_role(), '') <> 'admin' then raise exception 'Sólo el administrador puede preguntar'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribí la pregunta'; end if;
  select * into v_d from public.flyer_disenos where id = p_id for update;
  if v_d.id is null then raise exception 'Ese diseño no existe'; end if;
  if v_d.estado not in ('pedido','consulta') then raise exception 'Ese diseño ya no está pedido (lo cancelaron o ya se resolvió)'; end if;

  insert into public.flyer_diseno_mensajes (diseno_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(), 'admin', 'consulta', left(trim(p_texto), 1000));

  update public.flyer_disenos set estado = 'consulta' where id = p_id;
end;
$$;
revoke all on function public.flyer_diseno_consultar(uuid, text) from public, anon;
grant execute on function public.flyer_diseno_consultar(uuid, text) to authenticated;

-- ── 7) Responder (sólo el autor): consulta → pedido ───────────────────────
create or replace function public.flyer_diseno_responder(p_id uuid, p_texto text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_d public.flyer_disenos;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribí la respuesta'; end if;
  select * into v_d from public.flyer_disenos where id = p_id for update;
  if v_d.id is null then raise exception 'Ese diseño no existe'; end if;
  if v_d.user_id is distinct from auth.uid() then raise exception 'Sólo quien pidió la publicación puede responder'; end if;
  if v_d.estado <> 'consulta' then raise exception 'Ese diseño no tiene una pregunta abierta'; end if;

  insert into public.flyer_diseno_mensajes (diseno_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(), 'autor', 'respuesta', left(trim(p_texto), 1000));

  update public.flyer_disenos set estado = 'pedido' where id = p_id;
end;
$$;
revoke all on function public.flyer_diseno_responder(uuid, text) from public, anon;
grant execute on function public.flyer_diseno_responder(uuid, text) to authenticated;

-- ── 8) Compartir (admin): una copia para cada persona ─────────────────────
-- Devuelve {nuevos:[nombres], actualizados:[nombres], salteados:[{nombre,motivo}]}.
create or replace function public.flyer_diseno_compartir(p_id uuid, p_para uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_d      public.flyer_disenos;
  v_quien  text;
  v_uid    uuid;
  v_p      public.profiles;
  v_nom    text;
  v_ya     public.flyer_disenos;
  v_nuevos jsonb := '[]'::jsonb;
  v_act    jsonb := '[]'::jsonb;
  v_salt   jsonb := '[]'::jsonb;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if coalesce(public.get_my_role(), '') <> 'admin' then raise exception 'Sólo el administrador puede compartir diseños'; end if;
  if p_para is null or cardinality(p_para) = 0 then raise exception 'Elegí con quién compartirlo'; end if;
  if cardinality(p_para) > 200 then raise exception 'Demasiadas personas de una vez'; end if;
  select * into v_d from public.flyer_disenos where id = p_id;
  if v_d.id is null or v_d.tipo <> 'diseno' then raise exception 'Ese diseño no existe'; end if;

  v_quien := public._prop_mi_nombre();
  perform set_config('fg.estudio_compartir', 'si', true);

  foreach v_uid in array (select array_agg(distinct x) from unnest(p_para) x) loop
    select * into v_p from public.profiles where id = v_uid;
    v_nom := coalesce(nullif(trim(v_p.full_name), ''), v_p.email, '');
    if v_p.id is null then
      v_salt := v_salt || jsonb_build_object('nombre', '(usuario borrado)', 'motivo', 'ya no existe');
      continue;
    end if;
    if v_uid = auth.uid() or v_uid = v_d.user_id then
      v_salt := v_salt || jsonb_build_object('nombre', v_nom, 'motivo', 'ya es suyo');
      continue;
    end if;
    if coalesce(v_p.status, '') <> 'active' then
      v_salt := v_salt || jsonb_build_object('nombre', v_nom, 'motivo', 'su cuenta no está activa');
      continue;
    end if;
    if coalesce(v_p.role, '') in ('hunter','lider') then
      v_salt := v_salt || jsonb_build_object('nombre', v_nom, 'motivo', 'su perfil no arma flyers');
      continue;
    end if;

    select * into v_ya from public.flyer_disenos
     where user_id = v_uid and compartido_de = p_id
     order by updated_at desc limit 1;
    if v_ya.id is not null then
      if v_ya.estado not in ('privado','rechazado') then
        v_salt := v_salt || jsonb_build_object('nombre', v_nom, 'motivo', 'ya lo tiene y pidió publicarlo');
        continue;
      end if;
      update public.flyer_disenos
         set nombre = v_d.nombre, empresa = v_d.empresa, opcion = v_d.opcion, base_name = v_d.base_name,
             datos = v_d.datos, miniatura = v_d.miniatura, estado = 'privado', nota_admin = '',
             compartido_por = v_quien, compartido_at = now()
       where id = v_ya.id;
      v_act := v_act || to_jsonb(v_nom);
    else
      insert into public.flyer_disenos
        (user_id, autor, nombre, empresa, opcion, base_name, datos, miniatura, estado, tipo,
         compartido_por, compartido_de, compartido_at)
      values
        (v_uid, v_nom, v_d.nombre, v_d.empresa, v_d.opcion, v_d.base_name, v_d.datos, v_d.miniatura, 'privado', 'diseno',
         v_quien, p_id, now());
      v_nuevos := v_nuevos || to_jsonb(v_nom);
    end if;
  end loop;

  perform set_config('fg.estudio_compartir', '', true);
  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_act, 'salteados', v_salt);
end;
$$;
revoke all on function public.flyer_diseno_compartir(uuid, uuid[]) from public, anon;
grant execute on function public.flyer_diseno_compartir(uuid, uuid[]) to authenticated;
