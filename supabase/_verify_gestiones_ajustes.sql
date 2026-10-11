-- Verificación de sólo lectura de la 016.
select 'tipo: accion y feria' as chequeo, pg_get_constraintdef((select oid from pg_constraint where conname='gestiones_tipo_check')) like '%accion%feria%' and pg_get_constraintdef((select oid from pg_constraint where conname='gestiones_tipo_check')) not like '%visita%' as ok
union all select 'frecuencia: unica/repite', pg_get_constraintdef((select oid from pg_constraint where conname='gestiones_frecuencia_check')) like '%repite%'
union all select 'columnas cada_dias, veces, vez', (select count(*) from information_schema.columns where table_name='gestiones' and column_name in ('cada_dias','veces','vez')) = 3
union all select 'check de repetición', exists(select 1 from pg_constraint where conname='gestiones_repite_datos')
union all select 'una sola gestiones_lista (con p_solo_mio)', (select count(*) from pg_proc where proname='gestiones_lista') = 1 and pg_get_function_arguments('public.gestiones_lista(integer,boolean)'::regprocedure) like '%p_solo_mio%'
union all select 'una sola gestiones_tablero (con p_solo_mio)', (select count(*) from pg_proc where proname='gestiones_tablero') = 1 and pg_get_function_arguments('public.gestiones_tablero(date,date,text,uuid,uuid,boolean,boolean)'::regprocedure) like '%p_solo_mio%'
union all select 'no quedan visitas viejas', not exists(select 1 from public.gestiones where tipo='visita');
