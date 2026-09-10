-- Habilita el rol 'pro' en profiles.role (además de admin/vip/asesor).
-- Idempotente: se puede correr varias veces, y no hace nada si la columna nunca
-- tuvo una restricción de valores.
--
-- Contexto: la tabla profiles no se crea en este repo (vive en la base), así que
-- no sabemos de antemano si role tiene un CHECK que limite los valores. Este
-- script busca cualquier CHECK de profiles que mencione la columna role, lo
-- elimina y lo vuelve a crear incluyendo 'pro'.

do $$
declare
  con record;
begin
  for con in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'profiles'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', con.conname);
    raise notice 'Constraint eliminado: %', con.conname;
  end loop;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin','vip','pro','asesor'));
  raise notice 'Constraint profiles_role_check creado con admin/vip/pro/asesor';
end
$$;
