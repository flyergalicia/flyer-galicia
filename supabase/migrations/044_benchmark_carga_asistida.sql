-- 044 · Benchmark: condición de las promos cargadas a mano y fin de la lectura automática de Santander
-- (1) "Condición" de una promo cargada a mano: "Paquete Black+ All · Visa Signature por NFC".
--     Se muestra como el segmento real ("Sólo Paquete Black+ All").
-- (2) La web de Santander no deja leerla desde la nube (siempre contesta bloqueado): sus
--     promos propias llegan una vez por mes por la carga asistida (acción importar_web).
alter table public.promos_bench_manual add column if not exists condicion text not null default '';

do $$
declare j text;
begin
  foreach j in array array['benchmark-santander-1', 'benchmark-santander-2', 'benchmark-santander-3'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;
