-- Migración de seguridad: cierra agujeros RLS y agrega políticas de storage.
-- Idempotente: se puede correr varias veces.

-- 1) Guard contra escalación de privilegios en profiles.
--    Un usuario normal NO puede cambiar su propio role ni status.
--    Admins (app), service_role (Edge Function) y postgres (management) sí pueden.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin de la app puede cambiar rol/estado.
  if public.get_my_role() = 'admin' then return new; end if;
  -- Solo restringimos a usuarios 'authenticated' (la app). service_role (Edge
  -- Function) y postgres (migraciones) tienen auth.role() distinto y pasan.
  -- NOTA: no se puede usar current_user acá porque, al ser SECURITY DEFINER,
  -- current_user siempre es el dueño ('postgres'). auth.role() lee el JWT real.
  if auth.role() is distinct from 'authenticated' then return new; end if;
  if new.role is distinct from old.role or new.status is distinct from old.status then
    raise exception 'No autorizado a modificar rol o estado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 2) flyer_logs: eliminar políticas inseguras.
--    "Admin access flyer_logs" (qual=true para authenticated) daba acceso total
--    a cualquier usuario logueado. "Anon insert" permitía insertar a cualquiera.
drop policy if exists "Admin access flyer_logs" on public.flyer_logs;
drop policy if exists "Anon insert flyer_logs" on public.flyer_logs;

-- 3) Storage (bucket flyers): el cliente admin sube/activa/borra con su JWT.
drop policy if exists "flyers_select_auth" on storage.objects;
create policy "flyers_select_auth" on storage.objects
  for select to authenticated
  using (bucket_id = 'flyers');

drop policy if exists "flyers_admin_insert" on storage.objects;
create policy "flyers_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'flyers' and public.get_my_role() = 'admin');

drop policy if exists "flyers_admin_update" on storage.objects;
create policy "flyers_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'flyers' and public.get_my_role() = 'admin')
  with check (bucket_id = 'flyers' and public.get_my_role() = 'admin');

drop policy if exists "flyers_admin_delete" on storage.objects;
create policy "flyers_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'flyers' and public.get_my_role() = 'admin');
