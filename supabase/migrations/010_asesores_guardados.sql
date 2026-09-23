-- Asesores guardados (predeterminados) en la nube, privados por usuario.
--
-- ANTES: la lista vivía SOLO en localStorage (clave fg_asesores_<uid>), o sea en
-- el navegador de esa computadora. Cambiar de PC, de navegador o limpiar los
-- datos del sitio = perder todos los asesores guardados.
--
-- AHORA: una fila por asesor, con dueño, y RLS del lado del servidor.
--   · Cada uno ve y edita SOLO sus propios asesores. Nadie más, admin incluido.
--   · Igual que el resto de las tablas, hace falta estar activo (is_active()).
-- El localStorage sigue usándose como caché local (para abrir el popover al
-- instante y no quedar a ciegas si falla la red), pero la fuente de verdad es esta tabla.
--
-- Idempotente: se puede correr varias veces.

create table if not exists public.asesores_guardados (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,               -- id que genera el cliente ('a<ts><rnd>')
  orden      integer not null default 0,  -- posición en la lista (0 = arriba)
  name       text not null default '',    -- rótulo con el que se guardó
  nombre     text not null default '',
  celular    text not null default '',
  email      text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists asesores_guardados_user_idx
  on public.asesores_guardados(user_id, orden);

alter table public.asesores_guardados enable row level security;

drop policy if exists "asesores propios: ver" on public.asesores_guardados;
create policy "asesores propios: ver" on public.asesores_guardados
  for select using (auth.uid() = user_id and public.is_active());

drop policy if exists "asesores propios: crear" on public.asesores_guardados;
create policy "asesores propios: crear" on public.asesores_guardados
  for insert with check (auth.uid() = user_id and public.is_active());

drop policy if exists "asesores propios: modificar" on public.asesores_guardados;
create policy "asesores propios: modificar" on public.asesores_guardados
  for update using (auth.uid() = user_id and public.is_active())
  with check (auth.uid() = user_id and public.is_active());

drop policy if exists "asesores propios: borrar" on public.asesores_guardados;
create policy "asesores propios: borrar" on public.asesores_guardados
  for delete using (auth.uid() = user_id and public.is_active());

-- Reemplazo atómico de la lista propia. El cliente maneja la lista entera en
-- memoria (guardar, eliminar, importar Excel) y la sube completa: sin esto
-- habría un instante entre el borrado y la inserción en el que un error dejaría
-- la lista vacía. security invoker => corre con los permisos del usuario, RLS incluido.
create or replace function public.asesores_replace(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;

  delete from public.asesores_guardados where user_id = auth.uid();

  insert into public.asesores_guardados (user_id, id, orden, name, nombre, celular, email)
  select auth.uid(),
         coalesce(nullif(r.value->>'id', ''), 'a' || r.ord::text || '_' || substr(md5(random()::text), 1, 6)),
         (r.ord - 1)::int,
         left(coalesce(r.value->>'name', ''), 200),
         left(coalesce(r.value->>'nombre', ''), 200),
         left(coalesce(r.value->>'celular', ''), 60),
         left(coalesce(r.value->>'email', ''), 200)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as r(value, ord)
   where jsonb_typeof(r.value) = 'object'
      on conflict (user_id, id) do nothing; -- ids repetidos: se queda el primero, no se cae el guardado

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.asesores_replace(jsonb) from public;
grant execute on function public.asesores_replace(jsonb) to authenticated;
