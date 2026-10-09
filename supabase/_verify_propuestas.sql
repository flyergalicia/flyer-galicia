-- Verificación del circuito de propuestas (correr DESPUÉS de
-- 012_propuestas_oficiales.sql):
--   node supabase/_runsql.mjs supabase/_verify_propuestas.sql
-- De sólo lectura: no inserta, aprueba ni rechaza nada.

with chk as (
  select 'tabla padron_propuestas existe' as chequeo,
         exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='padron_propuestas') as ok
  union all
  select 'RLS prendida en padron_propuestas',
         (select relrowsecurity from pg_class where oid = 'public.padron_propuestas'::regclass)
  union all
  select 'sin policies de insert/update/delete directas (todo por función)',
         not exists (select 1 from pg_policies
                      where schemaname='public' and tablename='padron_propuestas'
                        and cmd in ('INSERT','UPDATE','DELETE'))
  union all
  select 'hay policy de select (creador / dueño / suplente)',
         exists (select 1 from pg_policies
                  where schemaname='public' and tablename='padron_propuestas' and cmd='SELECT')
  union all
  select 'una sola propuesta pendiente por empresa (índice único parcial)',
         exists (select 1 from pg_indexes
                  where schemaname='public' and tablename='padron_propuestas'
                    and indexdef ilike '%estado = ''pendiente''%')
  union all
  select 'profiles.suplente_id existe',
         exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='profiles' and column_name='suplente_id')
  union all
  select 'función crear existe y es security definer',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='padron_propuesta_crear' and p.prosecdef)
  union all
  select 'función aprobar existe y es security definer',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='padron_propuesta_aprobar' and p.prosecdef)
  union all
  select 'función rechazar existe y es security definer',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='padron_propuesta_rechazar' and p.prosecdef)
  union all
  select 'colegas_para_suplente existe (para elegir suplente)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='colegas_para_suplente')
  union all
  select 'es_suplente_de existe',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='es_suplente_de')
)
select chequeo, ok, case when ok then 'OK' else 'REVISAR' end as estado
  from chk
 order by ok, chequeo;
