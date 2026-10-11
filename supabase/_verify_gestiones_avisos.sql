-- Verificación de sólo lectura de la 017.
select 'columna visto_dueno' as chequeo, exists(select 1 from information_schema.columns where table_name='gestiones' and column_name='visto_dueno') as ok
union all select 'función gestion_marcar_vista', exists(select 1 from pg_proc where proname='gestion_marcar_vista')
union all select 'trigger con visto_dueno', pg_get_functiondef('public.gestiones_antes()'::regprocedure) like '%visto_dueno%'
union all select 'sin novedades viejas', not exists(select 1 from public.gestiones where not visto_dueno);
