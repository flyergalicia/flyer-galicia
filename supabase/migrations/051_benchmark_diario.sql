-- 051 · Benchmark: se actualiza todos los días, después de Promociones
-- Hasta acá corría sólo los domingos a las 03:00 (hora Argentina). Promociones se actualiza todos
-- los días a las 09:00 (promos-galicia-sync-diario, 12:00 UTC), así que lo nuevo de Galicia tardaba
-- hasta una semana en llegar al Benchmark. Ahora el Benchmark corre todos los días desde las 09:15,
-- con la copia de Promociones recién actualizada (la acción "galicia" lee promos_galicia_cache).
-- Mismo comando de cada tarea (se copia de la que ya existe, con su clave del Vault); sólo cambian el
-- nombre ("-semanal" -> "-diario") y el horario. El recordatorio del día 5 no se toca.
do $$
declare
  t record;
  nuevo text;
begin
  for t in
    select * from (values
      ('benchmark-sync-semanal',        'benchmark-sync-diario',        '15 12 * * *'),
      ('benchmark-bbva-semanal',        'benchmark-bbva-diario',        '20 12 * * *'),
      ('benchmark-supervielle-semanal', 'benchmark-supervielle-diario', '22 12 * * *'),
      ('benchmark-galicia-1',           'benchmark-galicia-1',          '25 12 * * *'),
      ('benchmark-galicia-2',           'benchmark-galicia-2',          '35 12 * * *'),
      ('benchmark-galicia-3',           'benchmark-galicia-3',          '45 12 * * *'),
      ('benchmark-galicia-4',           'benchmark-galicia-4',          '55 12 * * *'),
      ('benchmark-marcas-1',            'benchmark-marcas-1',           '5 13 * * *'),
      ('benchmark-marcas-2',            'benchmark-marcas-2',           '15 13 * * *'),
      ('benchmark-marcas-3',            'benchmark-marcas-3',           '25 13 * * *')
    ) as v(viejo, nombre, horario)
  loop
    select command into nuevo from cron.job where jobname = t.viejo;
    if nuevo is null then
      raise notice 'No existe la tarea %, se saltea', t.viejo;
      continue;
    end if;
    perform cron.unschedule(t.viejo);
    perform cron.schedule(t.nombre, t.horario, nuevo);
  end loop;
end $$;

-- Verificación: las 10 tareas quedan diarias y activas.
select jobname, schedule, active from cron.job where jobname like 'benchmark-%' order by schedule, jobname;
