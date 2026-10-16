-- 024: el catálogo de promociones se actualiza solo todos los días a las 9
-- (hora Argentina = 12:00 UTC, sin horario de verano). Pedido del dueño
-- (16-oct-2026): antes la app lo refrescaba al abrir la solapa y al no
-- encontrar una marca, y eso hacía esperar al asesor. Queda el botón
-- "Actualizar catálogo ahora" para lo que Galicia publique durante el día.
--
-- pg_cron dispara la tarea y pg_net hace el pedido HTTP a la Edge Function
-- promos-galicia (acción sync). La función no tiene usuario en este caso: se
-- autoriza con el header x-cron-secret, cuya clave vive en el Vault de la base
-- (secreto 'promos_cron_secret') y en los secretos de la función
-- (PROMOS_CRON_SECRET). La clave NO está en este archivo: se carga aparte,
-- antes de aplicar esta migración:
--   select vault.create_secret('<clave>', 'promos_cron_secret');
-- y la misma <clave> en Supabase → Edge Functions → Secrets.
--
-- pg_net queda en el esquema net, que PostgREST no expone (sólo public), así
-- que no suma nada que un visitante pueda llamar.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reaplicable: con el mismo nombre, cron.schedule reemplaza la tarea.
select cron.schedule(
  'promos-galicia-sync-diario',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://cajyjnxjbobdpltflgnb.supabase.co/functions/v1/promos-galicia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'promos_cron_secret')
    ),
    body := '{"action":"sync"}'::jsonb,
    -- El sync tarda ~5 s (catálogo + 24 provincias); el tope por defecto de
    -- pg_net es 5 s y lo cortaría.
    timeout_milliseconds := 60000
  );
  $$
);

-- Verificación:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, left(content, 200), created from net._http_response order by created desc limit 5;
