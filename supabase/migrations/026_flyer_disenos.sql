-- Estudio: diseños de flyer guardados por cada usuario (logos cambiados, movidos,
-- textos) y el pedido para que el admin los publique como una variante nueva.
--
-- Quién ve qué:
--   · Cada uno ve, crea, cambia y borra SUS diseños.
--   · El admin ve los de todos (para revisar los pedidos) y es el único que
--     puede marcarlos "publicado" o "rechazado".
--   · Un diseño ya publicado no se toca ni se borra desde la cuenta del autor
--     (la variante ya está en uso); el admin sí puede.
--   · Hace falta estar activo (is_active()), como en el resto de las tablas.
--
-- El trigger de guardia completa lo que no debe venir del navegador (dueño,
-- nombre del autor, estado de revisión) para que nadie lo pueda falsear.
-- Idempotente: se puede correr varias veces.

create table if not exists public.flyer_disenos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  autor             text not null default '',
  nombre            text not null check (char_length(nombre) between 1 and 80),
  empresa           text not null default '' check (char_length(empresa) <= 160),
  opcion            integer not null check (opcion >= 1),   -- opción (flyer) sobre la que se armó
  base_name         text not null default '',               -- nombre de la imagen de esa opción al guardar
  datos             jsonb not null default '{}'::jsonb,     -- {v, cambios:[...], subidos:{clave:dataURL}}
  miniatura         text not null default '',               -- JPEG chico (data URL) de lo que cambió
  estado            text not null default 'privado' check (estado in ('privado','pedido','publicado','rechazado')),
  nota_admin        text not null default '' check (char_length(nota_admin) <= 500),
  opcion_publicada  integer,
  pedido_at         timestamptz,
  revisado_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- topes de tamaño: un diseño son unos pocos KB; los logos subidos de la PC
  -- viajan adentro (achicados), así que se deja margen pero con techo
  constraint flyer_disenos_datos_tope check (octet_length(datos::text) <= 3000000),
  constraint flyer_disenos_mini_tope check (char_length(miniatura) <= 400000)
);

create index if not exists flyer_disenos_user_idx on public.flyer_disenos(user_id, updated_at desc);
create index if not exists flyer_disenos_estado_idx on public.flyer_disenos(estado) where estado = 'pedido';

alter table public.flyer_disenos enable row level security;
revoke all on public.flyer_disenos from anon;
grant select, insert, update, delete on public.flyer_disenos to authenticated;

drop policy if exists "disenos: ver" on public.flyer_disenos;
create policy "disenos: ver" on public.flyer_disenos
  for select using (
    (select public.is_active())
    and (user_id = (select auth.uid()) or (select public.get_my_role()) = 'admin')
  );

drop policy if exists "disenos: crear" on public.flyer_disenos;
create policy "disenos: crear" on public.flyer_disenos
  for insert with check (
    (select public.is_active())
    and user_id = (select auth.uid())
    and estado in ('privado','pedido')
  );

drop policy if exists "disenos: modificar" on public.flyer_disenos;
create policy "disenos: modificar" on public.flyer_disenos
  for update using (
    (select public.is_active())
    and ((user_id = (select auth.uid()) and estado <> 'publicado') or (select public.get_my_role()) = 'admin')
  )
  with check (
    (select public.is_active())
    and ((user_id = (select auth.uid()) and estado in ('privado','pedido')) or (select public.get_my_role()) = 'admin')
  );

drop policy if exists "disenos: borrar" on public.flyer_disenos;
create policy "disenos: borrar" on public.flyer_disenos
  for delete using (
    (select public.is_active())
    and ((user_id = (select auth.uid()) and estado <> 'publicado') or (select public.get_my_role()) = 'admin')
  );

-- Guardia: el dueño y el autor salen de la sesión, no del navegador; la
-- revisión (nota, opción publicada, fecha) sólo la escribe el admin; la fecha
-- del pedido la pone la base.
create or replace function public.flyer_disenos_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := coalesce(public.get_my_role(), '') = 'admin';
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.autor := coalesce((select nullif(trim(p.full_name), '') from public.profiles p where p.id = auth.uid()),
                          (select p.email from public.profiles p where p.id = auth.uid()), '');
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
  if not v_admin then
    new.nota_admin := old.nota_admin;
    new.opcion_publicada := old.opcion_publicada;
    new.revisado_at := old.revisado_at;
  else
    if new.estado in ('publicado','rechazado') and new.estado is distinct from old.estado then
      new.revisado_at := now();
    end if;
  end if;
  if new.estado = 'pedido' and old.estado is distinct from 'pedido' then
    new.pedido_at := now();
  elsif new.estado <> 'pedido' and not v_admin then
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
