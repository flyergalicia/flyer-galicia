-- Verificación del rol 'hunter' (correr DESPUÉS de 011_rol_hunter.sql).
--   node supabase/_runsql.mjs supabase/_verify_hunter.sql
--
-- Es de sólo lectura: no inserta ni borra nada. Devuelve una fila por chequeo con
-- ok = true/false, así se ve de un vistazo si quedó bien.
--
-- Nota: no se puede simular una sesión de hunter antes de que exista una cuenta
-- con ese rol (get_my_role() lee profiles). La prueba en vivo es: crear la cuenta
-- Hunter, entrar con ella y ver que la lista traiga las empresas de los oficiales
-- y que el botón Descargar PDF funcione.

with chk as (
  -- 1) profiles.role admite 'hunter'
  select 'role admite hunter' as chequeo,
         exists (
           select 1 from pg_constraint c
             join pg_class r on r.oid = c.conrelid
             join pg_namespace n on n.oid = r.relnamespace
            where n.nspname = 'public' and r.relname = 'profiles' and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like '%hunter%'
         ) as ok

  -- 2) el hunter lee TODAS las empresas (de todos los oficiales, admin incluido)
  union all
  select 'hunter lee todas las empresas',
         exists (
           select 1 from pg_policies
            where schemaname = 'public' and tablename = 'padron_empresas'
              and policyname = 'hunter lee todas las empresas'
              and cmd = 'SELECT'
              and qual like '%hunter%' and qual like '%is_active()%'
              -- sin condición de dueño: tiene que ver las de los demás
              and qual not like '%user_id%'
         )

  -- 3) el hunter NO escribe ninguna empresa, ni las propias
  union all
  select 'hunter no puede crear empresas',
         (select coalesce(bool_and(with_check like '%hunter%'), false)
            from pg_policies
           where schemaname = 'public' and tablename = 'padron_empresas' and cmd = 'INSERT')
  union all
  select 'hunter no puede modificar empresas',
         (select coalesce(bool_and(qual like '%hunter%' and with_check like '%hunter%'), false)
            from pg_policies
           where schemaname = 'public' and tablename = 'padron_empresas' and cmd = 'UPDATE')
  union all
  select 'hunter no puede borrar empresas',
         (select coalesce(bool_and(qual like '%hunter%'), false)
            from pg_policies
           where schemaname = 'public' and tablename = 'padron_empresas' and cmd = 'DELETE')

  -- 4) lo que ya existía sigue en pie (que la 011 no se haya comido nada)
  union all
  select 'sigue estando: cada uno ve lo suyo',
         exists (select 1 from pg_policies where schemaname='public' and tablename='padron_empresas'
                  and policyname = 'padron propio: ver')
  union all
  select 'sigue estando: el admin lee el de los no-admin',
         exists (select 1 from pg_policies where schemaname='public' and tablename='padron_empresas'
                  and policyname = 'admin lee padron de no-admins')
  union all
  select 'sigue estando: RLS prendida en padron_empresas',
         (select relrowsecurity from pg_class where oid = 'public.padron_empresas'::regclass)

  -- 5) el hunter puede registrar su descarga (y leer el flyer del bucket)
  union all
  select 'el hunter puede registrar la descarga',
         exists (select 1 from pg_policies where schemaname='public' and tablename='flyer_logs'
                  and cmd='INSERT' and with_check like '%auth.uid()%')
  union all
  select 'el hunter puede leer el bucket de flyers',
         exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                  and cmd='SELECT' and qual like '%flyers%')
)
select chequeo, ok, case when ok then 'OK' else 'REVISAR' end as estado
  from chk
 order by ok, chequeo;
