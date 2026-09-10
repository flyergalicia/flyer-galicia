-- Padrón de empresas privado por usuario.
--
-- ANTES: el padrón vivía en flyers/_padron.json, un archivo PÚBLICO del bucket:
-- cualquiera con la URL lo leía sin siquiera estar logueado. Esconder la lupa en
-- el cliente no era privacidad, era un cartel de "no mirar".
--
-- AHORA: una fila por empresa, con dueño, y RLS que hace cumplir la privacidad
-- del lado del servidor. Reglas acordadas con el usuario:
--   · Cada uno ve y edita SOLO su propio padrón.
--   · Un admin puede LEER (nunca editar) el padrón de los NO admin, para la
--     solapa "Padrón Asesores".
--   · El padrón de un admin es privado incluso para otro admin.
--
-- Idempotente: se puede correr varias veces.

create table if not exists public.padron_empresas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  empresa    text not null default '',
  cuits      text[] not null default '{}',
  config     text not null default '',
  asesores   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists padron_empresas_user_idx on public.padron_empresas(user_id);

alter table public.padron_empresas enable row level security;

-- Lo propio: ver, crear, modificar y borrar.
drop policy if exists "padron propio: ver" on public.padron_empresas;
create policy "padron propio: ver" on public.padron_empresas
  for select using (auth.uid() = user_id);

drop policy if exists "padron propio: crear" on public.padron_empresas;
create policy "padron propio: crear" on public.padron_empresas
  for insert with check (auth.uid() = user_id);

drop policy if exists "padron propio: modificar" on public.padron_empresas;
create policy "padron propio: modificar" on public.padron_empresas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "padron propio: borrar" on public.padron_empresas;
create policy "padron propio: borrar" on public.padron_empresas
  for delete using (auth.uid() = user_id);

-- El admin LEE el padrón de los no-admin (solapa "Padrón Asesores").
-- No hay policy de escritura para el admin: mirar sí, tocar no.
-- El padrón de un admin NO es visible para otro admin.
drop policy if exists "admin lee padron de no-admins" on public.padron_empresas;
create policy "admin lee padron de no-admins" on public.padron_empresas
  for select using (
    public.get_my_role() = 'admin'
    and coalesce((select pr.role from public.profiles pr where pr.id = padron_empresas.user_id), '') <> 'admin'
  );

-- Reemplazo atómico del padrón propio. El cliente guarda el padrón entero de una
-- (así funciona el editor y la importación de Excel): sin esto habría un momento
-- entre el borrado y la inserción en el que un error dejaría el padrón vacío.
-- security invoker => corre con los permisos del usuario real, RLS incluido.
create or replace function public.padron_replace(p_rows jsonb)
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

  delete from public.padron_empresas where user_id = auth.uid();

  insert into public.padron_empresas (user_id, empresa, cuits, config, asesores)
  select auth.uid(),
         coalesce(r->>'empresa', ''),
         coalesce((select array_agg(c) from jsonb_array_elements_text(r->'cuits') c), '{}'),
         coalesce(r->>'config', ''),
         coalesce(r->'asesores', '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.padron_replace(jsonb) from public;
grant execute on function public.padron_replace(jsonb) to authenticated;
