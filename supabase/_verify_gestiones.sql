-- Verificación de sólo lectura de la 014 (gestiones, líder, prueba, interruptor).
select 'tabla app_flags' as chequeo, (to_regclass('public.app_flags') is not null) as ok
union all select 'interruptor gestiones con valor válido',
  exists(select 1 from public.app_flags where clave='gestiones' and valor in ('off','prueba','on'))
union all select 'tabla gestiones', to_regclass('public.gestiones') is not null
union all select 'tabla gestion_prospectos', to_regclass('public.gestion_prospectos') is not null
union all select 'RLS gestiones prendida', (select relrowsecurity from pg_class where oid='public.gestiones'::regclass)
union all select 'RLS prospectos prendida', (select relrowsecurity from pg_class where oid='public.gestion_prospectos'::regclass)
union all select 'RLS app_flags prendida', (select relrowsecurity from pg_class where oid='public.app_flags'::regclass)
union all select 'policies gestiones = 4', (select count(*) from pg_policies where tablename='gestiones') = 4
union all select 'policies prospectos = 2', (select count(*) from pg_policies where tablename='gestion_prospectos') = 2
union all select 'rol lider permitido', pg_get_constraintdef((select oid from pg_constraint where conname='profiles_role_check')) like '%lider%'
union all select 'columnas es_prueba y lider_id',
  (select count(*) from information_schema.columns where table_name='profiles' and column_name in ('es_prueba','lider_id')) = 2
union all select 'funciones', (select count(*) from pg_proc where proname in
  ('gestiones_on','es_lider_de','puede_ver_gestion','gestiones_personas','gestiones_tablero','prueba_cambiar_rol','gestiones_antes','gestion_prospectos_antes')) = 8
union all select 'triggers', (select count(*) from pg_trigger where tgname in ('trg_gestiones_antes','trg_gestion_prospectos_antes')) = 2
union all select 'guardia protege lider y prueba', pg_get_functiondef('public.guard_profile_update()'::regprocedure) like '%es_prueba%';
