-- Alta de cuenta: el perfil nace SIEMPRE como "asesor" y "pending".
--
-- POR QUÉ: handle_new_user (el trigger que crea el perfil cuando se crea un usuario
-- en el login de Supabase) tomaba el rol de los datos que mandara quien se
-- registraba (raw_user_meta_data->>'role'). Con el registro directo de Supabase
-- abierto (se cerró en el mismo cambio, ver abajo), cualquiera con la clave pública
-- del navegador podía registrarse mandando role = 'admin': el perfil nacía pendiente
-- pero ya como admin, y como el panel esconde el rol de las cuentas pendientes, al
-- aprobarla el admin le habría dado el panel completo sin darse cuenta. Se revisó la
-- base el 2026-10-15: nadie lo usó (un solo admin, ninguna cuenta rara).
--
-- QUÉ CAMBIA: el rol ya no se lee de los datos del registro. Las altas de la app no
-- lo necesitan: tanto "register" como "create_user" de la función auth-admin crean
-- el usuario y después ESCRIBEN el perfil con el rol y el estado que corresponden
-- (upsert), pisando lo que haya puesto el trigger. Tampoco se acepta ya un nombre con
-- < > ni de más de 80 caracteres (mismo criterio que limpiarNombre de la función).
--
-- Va junto con cerrar el registro directo en el login de Supabase (Auth →
-- disable_signup = true, ajuste del servicio, no de la base): la app nunca lo usa,
-- el alta pasa siempre por la función auth-admin, que exige mail @bancogalicia.com.ar.
-- Para volver atrás: disable_signup = false y esta función como estaba en 001.
--
-- Idempotente: se puede correr varias veces.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    nullif(left(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', ''), '[<>]', '', 'g')), 80), ''),
    'asesor',
    'pending'
  );
  return new;
end;
$$;

-- como en 019: sólo la ejecuta el trigger
revoke execute on function public.handle_new_user() from public, anon, authenticated;
