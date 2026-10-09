-- Rol 'hunter': busca una empresa cargada por cualquier oficial y se baja SU flyer.
-- No arma nada, no carga empresas, no edita nada.
--
-- Dos cosas, y las dos del lado del servidor (que la pantalla esconda los botones
-- no es una barrera: ver el comentario de 003 sobre el padrón que era un JSON
-- público):
--   1) habilitar el valor 'hunter' en profiles.role;
--   2) que un hunter LEA todas las empresas (de todos los oficiales, incluidas
--      las de los admin — decisión del usuario del 2026-10-08) y no pueda
--      escribir NINGUNA, ni siquiera las suyas.
--
-- Idempotente: se puede correr varias veces.

-- ── 1) profiles.role admite 'hunter' ────────────────────────────────────────
-- Mismo procedimiento que 002_rol_pro.sql: la tabla profiles no se crea en este
-- repo, así que no sabemos el nombre del CHECK; se busca cualquiera que mencione
-- la columna role, se elimina y se recrea con el valor nuevo.
-- Nota: el nombre de la variable NO puede repetir el alias de la tabla en el
-- SELECT del FOR (acá "con" chocaba con "pg_constraint con"): plpgsql tira
-- "record is not assigned yet" al toparse con la ambigüedad. Por eso v_con.
do $$
declare
  v_con record;
begin
  for v_con in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'profiles'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', v_con.conname);
    raise notice 'Constraint eliminado: %', v_con.conname;
  end loop;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('admin','vip','pro','asesor','hunter'));
  raise notice 'Constraint profiles_role_check creado con admin/vip/pro/asesor/hunter';
end
$$;

-- ── 2) padron_empresas: el hunter lee TODO y no escribe NADA ────────────────
-- Lectura: sin la condición de dueño y sin excluir a los admin (a diferencia de
-- la policy del admin, que no ve el padrón de otro admin). El hunter tiene que
-- poder encontrar cualquier empresa cargada por cualquiera.
drop policy if exists "hunter lee todas las empresas" on public.padron_empresas;
create policy "hunter lee todas las empresas" on public.padron_empresas
  for select to authenticated
  using (public.is_active() and public.get_my_role() = 'hunter');

-- Escritura: se recrean las tres policies "propio" de 006 agregándoles que el rol
-- no sea hunter. Así "no edita nada" lo hace cumplir la base: un hunter que le
-- pegue a la API por su cuenta tampoco puede cargar empresas (ni propias).
drop policy if exists "padron propio: crear" on public.padron_empresas;
create policy "padron propio: crear" on public.padron_empresas
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_active() and coalesce(public.get_my_role(),'') <> 'hunter');

drop policy if exists "padron propio: modificar" on public.padron_empresas;
create policy "padron propio: modificar" on public.padron_empresas
  for update to authenticated
  using (auth.uid() = user_id and public.is_active() and coalesce(public.get_my_role(),'') <> 'hunter')
  with check (auth.uid() = user_id and public.is_active() and coalesce(public.get_my_role(),'') <> 'hunter');

drop policy if exists "padron propio: borrar" on public.padron_empresas;
create policy "padron propio: borrar" on public.padron_empresas
  for delete to authenticated
  using (auth.uid() = user_id and public.is_active() and coalesce(public.get_my_role(),'') <> 'hunter');

-- No hace falta tocar nada más:
--   · storage (bucket flyers): lectura para cualquier cuenta activa (006:110-112),
--     así que el hunter baja la imagen del flyer, el legal y la calibración.
--   · flyer_logs: ya acepta el insert propio (006:78-80), así que las descargas
--     del hunter aparecen en Registros.
--   · padron_log: sólo lo escribe padron_replace, que para un hunter ya no pasa
--     del insert.
