-- Un pedido de "olvidé mi contraseña" ya no bloquea la cuenta.
--
-- El pedido es PÚBLICO (se hace sin sesión, sólo con el mail) y deja la cuenta en
-- status = 'reset_pending'. Hasta ahora ese estado equivalía a "inactivo": cualquiera
-- que conociera el mail de un asesor (o de un admin) podía dejarlo afuera de la app
-- hasta que un admin resolviera el pedido. Como el pedido NO cambia la clave real
-- (eso pasa recién en approve_reset), bloquear no protege nada.
--
-- Ahora 'reset_pending' sigue marcando la cuenta para que el admin vea el pedido en
-- el panel, pero la cuenta sigue funcionando con su clave de siempre. Lo que
-- cuenta como "activo" para las reglas de acceso (RLS, storage) pasa a ser
-- 'active' o 'reset_pending'. 'pending' (nunca aprobada) e 'inactive' siguen
-- sin acceso.
--
-- Idempotente. Para volver atrás: la definición anterior está en 006_status_activo.sql.

create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and status in ('active', 'reset_pending')
  );
$$;

revoke all on function public.is_active() from public;
grant execute on function public.is_active() to authenticated, service_role;
