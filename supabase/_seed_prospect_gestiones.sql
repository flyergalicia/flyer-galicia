-- Ejemplos de Gestiones (versión 2, migración 045) para la cuenta de prueba
-- Prospect, sobre SUS empresas inventadas (_seed_prospect.sql): acciones ya
-- hechas con prospectos y altas (con y sin paquete), descartes con motivo,
-- próximos contactos, dos bases de datos, la agenda de las próximas semanas,
-- una feria que se repite, un "No puedo ir", una cancelada y mensajes.
-- Prospect hace de oficial y de hunter (es una sola cuenta). Personas,
-- teléfonos y legajos son de fantasía. Las fechas se calculan desde HOY.
-- Se puede volver a correr: borra sólo estos ejemplos (serie_id e0000000-…)
-- y los vuelve a cargar. No toca las otras gestiones de Prospect ni las de nadie.
--   node supabase/_runsql.mjs supabase/_seed_prospect_gestiones.sql
do $$
declare
  -- "Hoy" en Argentina (la base trabaja en UTC: después de las 21 ya sería mañana).
  u uuid; g uuid; hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  sid text := 'e0000000-0000-4000-8000-0000000000';
begin
  select id into u from public.profiles where es_prueba and lower(email) = 'prospect@flyergalicia.test';
  if u is null then raise exception 'No encontré la cuenta de prueba Prospect'; end if;
  -- Todo se carga "como Prospect" (los triggers toman quién es de la sesión).
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  delete from public.gestiones where serie_id::text like 'e0000000-0000-4000-8000-%';

  -- ── Lo que ya se hizo ──────────────────────────────────────────────────────
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, dotacion, asistentes, nota, serie_id)
  values ('Frigorífico Pampa Serena SA', 'derivada', u, 'feria', 'presencial', 'realizada', hoy - 13, '10:00', '14:00', 'Comedor de la planta Pilar', 320, 85,
          'Muy buena convocatoria. Volver en noviembre con el flyer de súper.', (sid || '01')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g, 'Martina Aguirre', '11 5555-0101', 'Producción', 'alta', 'plus', null, null, hoy - 9),
    (g, 'Lucas Benítez', '11 5555-0102', 'Logística', 'alta', 'gold', null, null, hoy - 8),
    (g, 'Carolina Duarte', '11 5555-0103', 'Administración', 'alta', 'caja', null, null, hoy - 8),
    (g, 'Facundo Ibarra', '11 5555-0104', 'Gerencia', 'alta', 'platinum', null, null, hoy - 6),
    (g, 'Paula Lezcano', '11 5555-0105', null, 'descartado', null, 'ya_galicia', null, null),
    (g, 'Gonzalo Arce', null, 'Turno noche', 'descartado', null, 'ya_galicia', null, null),
    (g, 'Silvina Moreno', '11 5555-0107', null, 'descartado', null, 'no_interesa', null, null),
    (g, 'Matías Quiroga', '11 5555-0108', 'Mantenimiento', 'en_gestion', null, null, hoy, null),
    (g, 'Andrea Villalba', 'andrea.villalba@correo.demo', null, 'en_gestion', null, null, hoy + 1, null),
    (g, 'Ezequiel Romero', '11 5555-0110', null, 'prospecto', null, null, null, null);

  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, dotacion, asistentes, nota, serie_id)
  values ('Clínica Privada San Bartolo SA', 'derivada', u, 'accion', 'presencial', 'realizada', hoy - 8, '09:00', '12:00', 'Sala de residentes, 2º piso', 140, 40,
          'Hablamos con enfermería y administración.', (sid || '02')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g, 'Natalia Ferreyra', '11 5555-0201', 'Enfermería', 'alta', 'plus', null, null, hoy - 5),
    (g, 'Diego Acosta', '11 5555-0202', 'Guardia', 'alta', 'black', null, null, hoy - 4),
    (g, 'Valeria Sosa', '11 5555-0203', null, 'descartado', null, 'no_contesta', null, null),
    (g, 'Hernán Paz', '11 5555-0204', 'Administración', 'en_gestion', null, null, hoy - 1, null),
    (g, 'Romina Castro', null, 'Enfermería', 'prospecto', null, null, null, null),
    (g, 'Julián Medina', '11 5555-0206', null, 'prospecto', null, null, null, null);

  insert into public.gestiones(empresa, dueno_id, origen, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, asistentes, nota, serie_id)
  values ('Software Tierra Nueva SAS', u, 'propia', 'posicion', 'virtual', 'realizada', hoy - 6, '15:00', '17:00', 25,
          'Charla por videollamada con todo el equipo.', (sid || '03')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g, 'Tomás Herrera', 'tomas.herrera@correo.demo', 'Desarrollo', 'alta', 'caja', null, null, hoy - 3),
    (g, 'Sofía Giménez', 'sofia.gimenez@correo.demo', 'Diseño', 'alta', 'plus', null, null, hoy - 2),
    (g, 'Nicolás Paredes', null, 'Pasantía', 'descartado', null, 'no_califica', null, null),
    (g, 'Lucía Robles', 'lucia.robles@correo.demo', null, 'prospecto', null, null, null, null);

  insert into public.gestiones(empresa, dueno_id, origen, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, asistentes, nota, serie_id)
  values ('Supermercados Familia Ortúzar SA', u, 'propia', 'posicion', 'presencial', 'realizada', hoy - 3, '10:00', '13:00', 'Sucursal centro, entrada del personal', 30,
          'Mucho interés en el paquete Plus Gold.', (sid || '04')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g, 'Marcela Ortiz', '11 5555-0401', 'Cajas', 'alta', 'gold', null, null, hoy - 1),
    (g, 'Pablo Ledesma', '11 5555-0402', 'Depósito', 'alta', 'caja', null, null, hoy - 1),
    (g, 'Gabriela Núñez', '11 5555-0403', null, 'descartado', null, 'otro', null, null),
    (g, 'Sergio Vera', '11 5555-0404', 'Fiambrería', 'en_gestion', null, null, hoy, null),
    (g, 'Daniela Torres', null, 'Cajas', 'prospecto', null, null, null, null);

  -- ── Bases de datos ─────────────────────────────────────────────────────────
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, vence, nota, serie_id)
  values ('Laboratorios Andinos del Sur SA', 'derivada', u, 'datos', 'virtual', 'planificada', hoy - 5, hoy + 10,
          'Personal de planta que cobra el sueldo en otro banco. Ofrecer Plus.', (sid || '05')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g, 'Alejandra Ríos', '11 5555-0501', 'Legajo 101', 'alta', 'plus', null, null, hoy - 3),
    (g, 'Bruno Molina', '11 5555-0502', 'Legajo 102', 'alta', 'plus', null, null, hoy - 2),
    (g, 'Cecilia Vargas', '11 5555-0503', 'Legajo 103', 'alta', 'caja', null, null, hoy - 2),
    (g, 'Damián Ponce', '11 5555-0504', 'Legajo 104', 'alta', 'gold', null, null, hoy - 1),
    (g, 'Elena Godoy', '11 5555-0505', 'Legajo 105', 'en_gestion', null, null, hoy, null),
    (g, 'Fernando Luna', '11 5555-0506', 'Legajo 106', 'en_gestion', null, null, hoy, null),
    (g, 'Graciela Suárez', '11 5555-0507', 'Legajo 107', 'en_gestion', null, null, hoy + 2, null),
    (g, 'Horacio Méndez', '11 5555-0508', 'Legajo 108', 'descartado', null, 'ya_galicia', null, null),
    (g, 'Irene Cabrera', '11 5555-0509', 'Legajo 109', 'descartado', null, 'no_contesta', null, null),
    (g, 'Javier Domínguez', '11 5555-0510', 'Legajo 110', 'prospecto', null, null, hoy + 1, null),
    (g, 'Karina Benítez', '11 5555-0511', 'Legajo 111', 'prospecto', null, null, null, null),
    (g, 'Leandro Silva', '11 5555-0512', 'Legajo 112', 'a_contactar', null, null, null, null),
    (g, 'Mónica Rivas', '11 5555-0513', 'Legajo 113', 'a_contactar', null, null, null, null),
    (g, 'Norberto Gil', '11 5555-0514', 'Legajo 114', 'a_contactar', null, null, null, null),
    (g, 'Olga Figueroa', '11 5555-0515', 'Legajo 115', 'a_contactar', null, null, null, null),
    (g, 'Pedro Salinas', '11 5555-0516', 'Legajo 116', 'a_contactar', null, null, null, null),
    (g, 'Raquel Juárez', '11 5555-0517', 'Legajo 117', 'a_contactar', null, null, null, null),
    (g, 'Santiago Correa', '11 5555-0518', 'Legajo 118', 'a_contactar', null, null, null, null),
    (g, 'Teresa Maldonado', '11 5555-0519', 'Legajo 119', 'a_contactar', null, null, null, null),
    (g, 'Ulises Navarro', '11 5555-0520', 'Legajo 120', 'a_contactar', null, null, null, null);
  insert into public.gestion_mensajes(gestion_id, autor, tipo, texto)
    values (g, u, 'msg', 'Ya llamé a los primeros 10. A los que no atienden les puse fecha para volver a llamar.');

  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, vence, nota, serie_id)
  values ('Transportes Río Bermejo SRL', 'derivada', u, 'datos', 'virtual', 'planificada', hoy, hoy + 14,
          'Choferes nuevos de este mes. Contactar por WhatsApp.', (sid || '06')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado)
  select g, n, '11 5555-06' || lpad(i::text, 2, '0'), 'Chofer ' || i, 'a_contactar'
    from unnest(array['Ariel Toledo','Beatriz Cáceres','Claudio Ojeda','Dolores Barrios','Emilio Rojas','Florencia Paz',
                      'Germán Ledesma','Hilda Mansilla','Ignacio Ferrari','Jorgelina Ruiz','Kevin Ayala','Liliana Bravo']) with ordinality as t(n, i);

  -- ── Agenda (lo que viene) ──────────────────────────────────────────────────
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  values ('Metalúrgica Cerro Azul S.A.', 'derivada', u, 'posicion', 'presencial', 'planificada', hoy, '15:00', '17:00', 'Planta 2, comedor',
          'Llevar el flyer de combustible: tienen flota propia.', (sid || '07')::uuid) returning id into g;
  insert into public.gestion_mensajes(gestion_id, autor, tipo, texto)
    values (g, u, 'msg', 'Confirmado con RRHH: esperan unas 60 personas en el cambio de turno.');

  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, serie_id)
  values ('Bodega Altos del Tupungato SA', 'derivada', u, 'accion', 'presencial', 'planificada', hoy + 1, '10:00', '12:00', 'Sala de capacitación', (sid || '08')::uuid);

  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  values ('Óptica Mirada Clara SRL', 'derivada', u, 'accion', 'presencial', 'cancelada', hoy + 1, '15:00', '16:00', 'Local Palermo',
          'La empresa pidió pasarla para el mes que viene.', (sid || '09')::uuid);

  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  values ('Logística Puerto Escondido SRL', 'derivada', u, 'posicion', 'presencial', 'planificada', hoy + 2, '14:00', '18:00', 'Depósito Dock Sud',
          'Dos turnos: 14 h y 16 h.', (sid || '10')::uuid) returning id into g;
  perform set_config('fg.no_puede', '1', true);
  update public.gestiones set no_puede_at = now(), no_puede_motivo = 'Me superpone con la capacitación del banco.' where id = g;
  perform set_config('fg.no_puede', '', true);
  insert into public.gestion_mensajes(gestion_id, autor, tipo, texto)
    values (g, u, 'no_puedo', 'Me superpone con la capacitación del banco.');

  -- Feria que se repite cada 7 días, 3 veces (las tres fechas ya cargadas)
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, frecuencia, cada_dias, veces, vez, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  select 'Colegio Bilingüe Los Alerces SRL', 'derivada', u, 'feria', 'presencial', 'planificada', 'repite', 7, 3, k, hoy + 4 + (k - 1) * 7, '09:00', '11:00', 'Hall de entrada',
         'Stand en la jornada de docentes.', (sid || '11')::uuid
    from generate_series(1, 3) k;

  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, nota, serie_id)
  values ('Hotel Termas de Copahue Sur SA', 'derivada', u, 'accion', 'virtual', 'planificada', hoy + 6, '11:00', '12:00',
          'Reunión por videollamada con RRHH.', (sid || '12')::uuid);

  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, serie_id)
  values ('Gimnasios Fuerza Activa SAS', 'derivada', u, 'accion', 'presencial', 'planificada', hoy + 7, '18:00', '20:00', 'Sede Caballito', (sid || '13')::uuid);

  -- Los mensajes de ejemplo quedan leídos.
  insert into public.gestion_leido(gestion_id, user_id, at)
  select m.gestion_id, u, now() from public.gestion_mensajes m join public.gestiones x on x.id = m.gestion_id
   where x.serie_id::text like 'e0000000-0000-4000-8000-%'
  on conflict (gestion_id, user_id) do update set at = excluded.at;
end $$;

select json_build_object(
  'gestiones', (select count(*) from public.gestiones where serie_id::text like 'e0000000-0000-4000-8000-%'),
  'personas', (select count(*) from public.gestion_prospectos p join public.gestiones g on g.id = p.gestion_id where g.serie_id::text like 'e0000000-0000-4000-8000-%'),
  'altas', (select count(*) from public.gestion_prospectos p join public.gestiones g on g.id = p.gestion_id where g.serie_id::text like 'e0000000-0000-4000-8000-%' and p.estado = 'alta'),
  'con_cuit', (select count(*) from public.gestiones where serie_id::text like 'e0000000-0000-4000-8000-%' and cuit is not null),
  'eventos', (select count(*) from public.gestion_eventos e join public.gestiones g on g.id = e.gestion_id where g.serie_id::text like 'e0000000-0000-4000-8000-%')
) as ejemplos;
