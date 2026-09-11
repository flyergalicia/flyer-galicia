-- Hardening RLS (auditoría 2026-09-11): las policies que hoy sólo piden "estar
-- logueado" pasan a exigir además status = 'active'.
--
-- POR QUÉ: cuando un admin desactiva una cuenta (o una está pendiente de
-- aprobación), la app le muestra "cuenta inactiva" y no la deja entrar — pero
-- el token de Supabase seguía siendo válido y con él se podían consultar
-- tablas por la API REST: catálogo de promociones, padrón propio, insertar en
-- flyer_logs, listar el bucket. El "desactivar" era sólo de pantalla.
--
-- Estado real ANTES de esta migración (dump de pg_policies, para poder volver):
--   profiles:     "Admin can view all profiles" ALL (get_my_role()='admin')
--                 "Users can update own profile" UPDATE (auth.uid()=id)
--                 "Users can view own profile"   SELECT (auth.uid()=id)
--   flyer_logs:   "Admin can view all logs" ALL (get_my_role()='admin')
--                 "Users can insert own logs" INSERT check (auth.uid()=user_id)
--                 "Users can view own logs"   SELECT (auth.uid()=user_id)
--   flyer_versions (tabla vieja, sin uso en el código):
--                 "Admin access flyer_versions" ALL to authenticated USING true  <-- cualquier logueado, todo
--                 "Admin can manage versions" ALL (get_my_role()='admin')
--                 "Active users can read versions" SELECT (activo o admin)
--                 "Anon read flyer_versions" SELECT to anon (is_active=true)
--   padron_empresas, promos_*, storage.objects: ver 003 / 005 / 001.
--   get_my_role: SECURITY DEFINER, stable. profiles: RLS on, FORCE off, owner postgres.
--
-- Idempotente: se puede correr varias veces.

-- 1) is_active(): ¿el usuario de la sesión tiene status='active'?
--    SECURITY DEFINER a propósito: lee profiles SIN pasar por RLS. Si pasara,
--    las policies de profiles que la llaman entrarían en recursión.
create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and status = 'active'
  );
$$;
revoke all on function public.is_active() from public;
grant execute on function public.is_active() to anon, authenticated, service_role;

-- 2) profiles. La fila PROPIA se lee SIN exigir is_active(): checkProfile
--    necesita leer su status para mostrar "pendiente" / "inactiva".
drop policy if exists "Admin can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;

create policy "profiles: ver propio" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles: admin activo ve todos" on public.profiles
  for select to authenticated
  using (public.get_my_role() = 'admin' and public.is_active());

-- last_login / email_asesor / nombre_asesor / celular_asesor desde la app.
-- role y status los frena el trigger guard_profile_update (001).
create policy "profiles: editar propio" on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.is_active())
  with check (id = auth.uid());

create policy "profiles: admin activo edita" on public.profiles
  for update to authenticated
  using (public.get_my_role() = 'admin' and public.is_active())
  with check (public.get_my_role() = 'admin' and public.is_active());
-- Sin insert/delete para authenticated: los hace la Edge Function (service_role)
-- y el trigger handle_new_user.

-- 3) flyer_logs: cada usuario activo registra lo propio; sólo el admin activo lee.
drop policy if exists "Admin can view all logs" on public.flyer_logs;
drop policy if exists "Users can insert own logs" on public.flyer_logs;
drop policy if exists "Users can view own logs" on public.flyer_logs;

create policy "flyer_logs: insertar propio" on public.flyer_logs
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());

create policy "flyer_logs: admin activo lee" on public.flyer_logs
  for select to authenticated
  using (public.get_my_role() = 'admin' and public.is_active());

-- 4) flyer_versions: tabla de una versión anterior de la app (el código actual
--    no la consulta). Tenía una policy "todo para cualquier logueado" y lectura
--    anónima. Queda sólo para el admin activo.
drop policy if exists "Admin access flyer_versions" on public.flyer_versions;
drop policy if exists "Active users can read versions" on public.flyer_versions;
drop policy if exists "Anon read flyer_versions" on public.flyer_versions;
drop policy if exists "Admin can manage versions" on public.flyer_versions;
create policy "flyer_versions: solo admin activo" on public.flyer_versions
  for all to authenticated
  using (public.get_my_role() = 'admin' and public.is_active())
  with check (public.get_my_role() = 'admin' and public.is_active());

-- 5) promos (005)
drop policy if exists "promos: leer" on public.promos_galicia_cache;
create policy "promos: leer" on public.promos_galicia_cache
  for select to authenticated using (public.is_active());

drop policy if exists "promos meta: leer" on public.promos_galicia_meta;
create policy "promos meta: leer" on public.promos_galicia_meta
  for select to authenticated using (public.is_active());

-- 6) storage (001). El bucket es PÚBLICO: esto gobierna list() y las rutas
--    autenticadas, no /object/public/ (que la app y la Edge Function necesitan).
drop policy if exists "flyers_select_auth" on storage.objects;
create policy "flyers_select_auth" on storage.objects
  for select to authenticated
  using (bucket_id = 'flyers' and public.is_active());

drop policy if exists "flyers_admin_insert" on storage.objects;
create policy "flyers_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'flyers' and public.get_my_role() = 'admin' and public.is_active());

drop policy if exists "flyers_admin_update" on storage.objects;
create policy "flyers_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'flyers' and public.get_my_role() = 'admin' and public.is_active())
  with check (bucket_id = 'flyers' and public.get_my_role() = 'admin' and public.is_active());

drop policy if exists "flyers_admin_delete" on storage.objects;
create policy "flyers_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'flyers' and public.get_my_role() = 'admin' and public.is_active());

-- 7) padron_empresas (003): igual que antes + activo, y acotado a authenticated.
drop policy if exists "padron propio: ver" on public.padron_empresas;
create policy "padron propio: ver" on public.padron_empresas
  for select to authenticated
  using (auth.uid() = user_id and public.is_active());

drop policy if exists "padron propio: crear" on public.padron_empresas;
create policy "padron propio: crear" on public.padron_empresas
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_active());

drop policy if exists "padron propio: modificar" on public.padron_empresas;
create policy "padron propio: modificar" on public.padron_empresas
  for update to authenticated
  using (auth.uid() = user_id and public.is_active())
  with check (auth.uid() = user_id and public.is_active());

drop policy if exists "padron propio: borrar" on public.padron_empresas;
create policy "padron propio: borrar" on public.padron_empresas
  for delete to authenticated
  using (auth.uid() = user_id and public.is_active());

drop policy if exists "admin lee padron de no-admins" on public.padron_empresas;
create policy "admin lee padron de no-admins" on public.padron_empresas
  for select to authenticated
  using (
    public.is_active()
    and public.get_my_role() = 'admin'
    and coalesce((select pr.role from public.profiles pr where pr.id = padron_empresas.user_id), '') <> 'admin'
  );

-- padron_replace ya exige auth.uid(); el grant a anon que quedó colgado no
-- servía para nada. Fuera.
revoke execute on function public.padron_replace(jsonb) from anon;

-- 8) profiles.email es la columna por la que request_reset busca la cuenta.
--    El trigger handle_new_user la completa siempre; por si quedó alguna vacía.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and coalesce(p.email, '') = '';
