-- Verificación de 013_propuestas_conversacion.sql (sólo lectura):
--   node supabase/_runsql.mjs supabase/_verify_conversacion.sql
with chk as (
  select 'estado admite consulta' as chequeo,
         exists (select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid
                  where r.relname='padron_propuestas' and c.contype='c'
                    and pg_get_constraintdef(c.oid) like '%consulta%') as ok
  union all
  select 'una sola propuesta abierta (pendiente o consulta) por empresa',
         exists (select 1 from pg_indexes where tablename='padron_propuestas'
                  and indexname='padron_propuestas_pendiente_unica' and indexdef like '%consulta%')
  union all
  select 'creada_por acepta null (se puede borrar la cuenta del hunter)',
         exists (select 1 from information_schema.columns where table_name='padron_propuestas'
                  and column_name='creada_por' and is_nullable='YES')
  union all
  select 'tabla de mensajes con RLS',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.padron_propuesta_mensajes')), false)
  union all
  select 'mensajes: sin escritura directa',
         not exists (select 1 from pg_policies where tablename='padron_propuesta_mensajes' and cmd in ('INSERT','UPDATE','DELETE'))
  union all
  select 'mensajes: se pueden leer',
         exists (select 1 from pg_policies where tablename='padron_propuesta_mensajes' and cmd='SELECT')
  union all
  select 'consultar existe (security definer)',
         exists (select 1 from pg_proc where proname='padron_propuesta_consultar' and prosecdef)
  union all
  select 'responder existe (security definer)',
         exists (select 1 from pg_proc where proname='padron_propuesta_responder' and prosecdef)
  union all
  select 'aprobar: una sola firma, con comentario',
         (select count(*) from pg_proc where proname='padron_propuesta_aprobar') = 1
         and exists (select 1 from pg_proc where proname='padron_propuesta_aprobar' and pronargs = 2)
)
select chequeo, ok, case when ok then 'OK' else 'REVISAR' end as estado from chk order by ok, chequeo;
