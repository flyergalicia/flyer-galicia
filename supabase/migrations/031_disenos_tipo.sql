-- 031: "Marcas guardadas" (pedido del dueño, 22-oct-2026).
--
-- Una combinación de cambios de un flyer (franjas, logos de súper con sus días,
-- logos puestos o sacados, textos) que se guarda con un nombre ("Neuquén
-- capital") para aplicarla sola en el modelo nuevo del flyer. Vive en la misma
-- tabla que los diseños de Estudio, con las mismas reglas (cada uno ve lo suyo,
-- el admin todo; el trigger flyer_disenos_guardia pone dueño y autor).
--
-- tipo -> 'diseno' (lo de siempre) o 'combinacion'. Las combinaciones no se
--         piden ni se publican: quedan en estado 'privado'.

alter table public.flyer_disenos
  add column if not exists tipo text not null default 'diseno';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'flyer_disenos_tipo_chk') then
    alter table public.flyer_disenos
      add constraint flyer_disenos_tipo_chk check (tipo in ('diseno','combinacion'));
  end if;
end $$;

create index if not exists flyer_disenos_tipo_idx on public.flyer_disenos(user_id, tipo, updated_at desc);

-- La RLS ("disenos: ver/crear/…") es por fila y ya cubre la columna nueva.
