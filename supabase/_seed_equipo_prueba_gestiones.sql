-- Simulación completa de Gestiones entre las 4 cuentas de prueba:
--   Martin Romero (líder) · Sofia Merle y Leandro Peralta (oficiales, Pro)
--   Nicolas Ferrari (hunter, del equipo de Martin)
-- Sobre las empresas inventadas de _seed_equipo_prueba.sql. Personas, teléfonos
-- y legajos son de fantasía. Las fechas se calculan desde HOY (hora Argentina).
--
-- Qué queda armado:
--   · 5 acciones ya hechas con prospectos, altas con y sin paquete y descartes
--     con motivo (para que el tablero y la evolución mensual tengan números).
--   · La agenda de esta semana y de las próximas, sin horarios pisados.
--   · Una acción de Leandro con el mismo hunter el mismo día: Sofia la ve como
--     "Ocupado" en su grilla, sin saber de qué empresa es.
--   · Dos "Que la asigne el líder" esperando en la bandeja de Martin.
--   · Un "No puedo ir" de Nicolas.
--   · Dos bases de datos (37 personas) con próximos contactos vencidos y de hoy.
--   · Conversación con un mensaje sin leer para Sofia, y una feria que se repite.
--
-- Se puede volver a correr: borra sólo estos ejemplos (serie_id e1000000-…) y
-- los vuelve a cargar. No toca lo de Prospect ni lo de nadie más.
--   node supabase/_runsql.mjs supabase/_seed_equipo_prueba_gestiones.sql
do $$
declare
  v_so uuid; v_le uuid; v_ni uuid; v_ma uuid;
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  sid text := 'e1000000-0000-4000-8000-0000000000';
  g uuid; d date;
begin
  select id into v_so from public.profiles where es_prueba and lower(email) = 'pruebaoficial@bancogalicia.com.ar';
  select id into v_le from public.profiles where es_prueba and lower(email) = 'pruenaoficial2@bancogalicia.com.ar';
  select id into v_ni from public.profiles where es_prueba and lower(email) = 'pruebahunter@bancogalicia.com.ar';
  select id into v_ma from public.profiles where es_prueba and lower(email) = 'pruebalider@bancogalicia.com.ar';
  if v_so is null or v_le is null or v_ni is null or v_ma is null then
    raise exception 'Faltan cuentas de prueba (Sofia / Leandro / Nicolas / Martin) marcadas como es_prueba';
  end if;

  delete from public.gestiones where serie_id::text like 'e1000000-0000-4000-8000-%';

  -- ══ SOFIA (oficial) ════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_so, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_so::text, true);

  -- 1) Feria ya hecha hace 20 días
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, dotacion, asistentes, nota, serie_id)
  values ('Molinos del Oeste SA','derivada',v_ni,'feria','presencial','realizada', hoy-20,'10:00','14:00','Comedor de planta, Ruta 8 km 42', 260, 70,
          'Feria de beneficios. Pidieron volver con el flyer de combustible.', (sid||'01')::uuid) returning id into g;

  -- 2) Posición comercial de la semana pasada
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, dotacion, asistentes, nota, serie_id)
  values ('Clínica Sierra Chica SA','derivada',v_ni,'posicion','presencial','realizada', hoy-5,'09:00','13:00','Hall de ingreso, sector guardia', 140, 30,
          'Mucho personal de enfermería del turno mañana.', (sid||'02')::uuid);

  -- 3) Para mañana: la que Nicolas todavía no vio, con una pregunta suya
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  values ('Logística Ruta Azul SRL','derivada',v_ni,'accion','presencial','planificada', hoy+1,'10:00','12:00','Depósito de Pacheco, oficina de RRHH',
          'Preguntar por Mariela (RRHH). Tienen 60 choferes que cobran en otro banco.', (sid||'03')::uuid);

  -- 4) En tres días: la que Nicolas va a avisar que no puede
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, serie_id)
  values ('Automotores Llanura Verde SA','derivada',v_ni,'accion','presencial','planificada', hoy+3,'09:00','13:00','Concesionaria, salón de ventas', (sid||'04')::uuid);

  -- 5) Base de datos: la lista la pega el oficial, la trabaja el hunter
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, vence, nota, serie_id)
  values ('Metalúrgica Dos Puentes SA','derivada',v_ni,'datos','virtual','planificada', hoy-6, hoy+12,
          'Listado de RRHH. Llamar de 14 a 18, no antes.', (sid||'05')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado) values
    (g,'Alejandra Ponce','11 5801-3001','Legajo 1201','a_contactar'),
    (g,'Bruno Salazar','11 5801-3002','Legajo 1202','a_contactar'),
    (g,'Camila Ferreyra','camila.ferreyra@correo.demo','Legajo 1203','a_contactar'),
    (g,'Diego Maldonado','11 5801-3004','Legajo 1204','a_contactar'),
    (g,'Emilia Vázquez','11 5801-3005','Legajo 1205','a_contactar'),
    (g,'Franco Ledesma','11 5801-3006','Legajo 1206','a_contactar'),
    (g,'Gisela Paredes','gisela.paredes@correo.demo','Legajo 1207','a_contactar'),
    (g,'Hernán Olivera','11 5801-3008','Legajo 1208','a_contactar'),
    (g,'Irina Camargo','11 5801-3009','Legajo 1209','a_contactar'),
    (g,'Joaquín Rivas','11 5801-3010','Legajo 1210','a_contactar'),
    (g,'Karina Lastra','11 5801-3011','Legajo 1211','a_contactar'),
    (g,'Leonardo Brizuela','11 5801-3012','Legajo 1212','a_contactar'),
    (g,'Mariana Quiñones','mariana.q@correo.demo','Legajo 1213','a_contactar'),
    (g,'Nahuel Peralta','11 5801-3014','Legajo 1214','a_contactar'),
    (g,'Ornella Bustos','11 5801-3015','Legajo 1215','a_contactar'),
    (g,'Pablo Cardozo','11 5801-3016','Legajo 1216','a_contactar'),
    (g,'Rocío Maidana','11 5801-3017','Legajo 1217','a_contactar'),
    (g,'Sebastián Noguera','11 5801-3018','Legajo 1218','a_contactar'),
    (g,'Tamara Villagra','tamara.villagra@correo.demo','Legajo 1219','a_contactar'),
    (g,'Ulises Barrientos','11 5801-3020','Legajo 1220','a_contactar'),
    (g,'Valentina Ruiz Díaz','11 5801-3021','Legajo 1221','a_contactar'),
    (g,'Walter Figueroa','11 5801-3022','Legajo 1222','a_contactar');

  -- 6) Para que la asigne Martin
  insert into public.gestiones(empresa, origen, hunter_id, lider_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  values ('Cooperativa Agraria San Vicente Ltda.','derivada',null,v_ma,'feria','presencial','planificada', hoy+6,'14:00','18:00','Salón de la cooperativa',
          'Feria de la cosecha. Mandan micro desde el pueblo, va a haber mucha gente.', (sid||'06')::uuid);

  -- 7) Una cancelada
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, nota, serie_id)
  values ('Colegio San Jerónimo SRL','derivada',v_ni,'accion','presencial','cancelada', hoy+2,'15:00','16:00',
          'La reprogramaron: están con las mesas de examen.', (sid||'07')::uuid);

  -- 8) Feria que se repite cada 15 días (tres fechas, la misma serie)
  foreach d in array array[hoy+7, hoy+22, hoy+37] loop
    insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, frecuencia, cada_dias, veces, nota, serie_id)
    values ('Panadería Industrial Trigo Pampa SRL','derivada',v_ni,'feria','presencial','planificada', d,'14:00','18:00','Playón de carga','repite',15,3,
            'Van los tres turnos: hay que ir cada 15 días.', (sid||'08')::uuid);
  end loop;

  -- ══ LEANDRO (oficial) ══════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_le, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_le::text, true);

  -- 9) Acción ya hecha hace 12 días
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, dotacion, asistentes, nota, serie_id)
  values ('Supermercados Vía Norte SA','derivada',v_ni,'accion','presencial','realizada', hoy-12,'10:00','13:00','Sucursal centro, sala de capacitación', 180, 45,
          'Pidieron volver cuando abran la sucursal nueva.', (sid||'09')::uuid);

  -- 10) Feria del mes pasado (para la evolución mensual)
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, dotacion, asistentes, serie_id)
  values ('Frigorífico Las Tres Marías SA','derivada',v_ni,'feria','presencial','realizada', hoy-27,'09:00','13:00','Comedor del frigorífico', 410, 90, (sid||'10')::uuid);

  -- 11) ★ Mañana a la tarde, el mismo hunter: Sofia la ve sólo como "Ocupado"
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  values ('Transportes Cordillera SRL','derivada',v_ni,'posicion','presencial','planificada', hoy+1,'15:00','17:00','Base de camiones, Ruta 7',
          'Posición comercial en la base. Llevar folletería de combustible.', (sid||'11')::uuid);

  -- 12) Para que la asigne Martin
  insert into public.gestiones(empresa, origen, hunter_id, lider_id, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, nota, serie_id)
  values ('Distribuidora Mayorista El Faro SA','derivada',null,v_ma,'accion','presencial','planificada', hoy+4,'10:00','12:00',
          'No llego a cubrirla, mandámela a quien tengas libre.', (sid||'12')::uuid);

  -- 13) Base de datos chica, recién arrancada
  insert into public.gestiones(empresa, origen, hunter_id, tipo, modalidad, estado, fecha, vence, nota, serie_id)
  values ('Laboratorio Bioquímico Austral SA','derivada',v_ni,'datos','virtual','planificada', hoy-2, hoy+20,
          'Personal de laboratorio. Casi todos cobran en otro banco.', (sid||'13')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado) values
    (g,'Abril Santillán','11 5802-4001','Legajo 55','a_contactar'),
    (g,'Benjamín Córdoba','11 5802-4002','Legajo 56','a_contactar'),
    (g,'Celeste Mariño','celeste.marino@correo.demo','Legajo 57','a_contactar'),
    (g,'Dante Escobar','11 5802-4004','Legajo 58','a_contactar'),
    (g,'Elisa Carrizo','11 5802-4005','Legajo 59','a_contactar'),
    (g,'Fabián Luque','11 5802-4006','Legajo 60','a_contactar'),
    (g,'Guadalupe Rivero','11 5802-4007','Legajo 61','a_contactar'),
    (g,'Horacio Méndez','11 5802-4008','Legajo 62','a_contactar'),
    (g,'Ivana Delgado','ivana.delgado@correo.demo','Legajo 63','a_contactar'),
    (g,'Julián Ayala','11 5802-4010','Legajo 64','a_contactar'),
    (g,'Lorena Gaitán','11 5802-4011','Legajo 65','a_contactar'),
    (g,'Maximiliano Sosa','11 5802-4012','Legajo 66','a_contactar'),
    (g,'Noelia Cabral','11 5802-4013','Legajo 67','a_contactar'),
    (g,'Osvaldo Pereyra','11 5802-4014','Legajo 68','a_contactar'),
    (g,'Priscila Alcaraz','11 5802-4015','Legajo 69','a_contactar');

  -- ══ NICOLAS (hunter): lo suyo y el trabajo sobre lo que le derivaron ═══════
  perform set_config('request.jwt.claims', json_build_object('sub', v_ni, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ni::text, true);

  -- 14) Se agendó él una acción en una empresa de Sofia
  insert into public.gestiones(empresa, dueno_id, origen, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, lugar, nota, serie_id)
  values ('Textiles Punta Mogotes SA', v_so,'propia','accion','presencial','planificada', hoy+2,'09:00','11:00','Portería de la fábrica',
          'Me lo pidió el encargado de planta cuando pasé por la zona.', (sid||'14')::uuid);

  -- 15) Algo que hizo él en una empresa de Leandro
  insert into public.gestiones(empresa, dueno_id, origen, tipo, modalidad, estado, fecha, hora_desde, hora_hasta, dotacion, asistentes, serie_id)
  values ('Centro Médico Los Tilos SRL', v_le,'propia','accion','presencial','realizada', hoy-8,'11:00','13:00', 95, 22, (sid||'15')::uuid) returning id into g;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, cuil, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g,'Silvana Ocampo','11 5803-5001','27304561234',null,'alta','plus',null,null, hoy-6),
    (g,'Tomás Arrieta','11 5803-5002',null,'Guardia','descartado',null,'ya_galicia',null,null),
    (g,'Úrsula Benegas','11 5803-5003',null,null,'prospecto',null,null, hoy+4, null);

  -- Prospectos de la feria de Molinos (la cargó el hunter al volver)
  select id into g from public.gestiones where serie_id = (sid||'01')::uuid;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, cuil, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g,'Adriana Juárez','11 5804-6001','27331122334',null,'alta','plus',null,null, hoy-17),
    (g,'Bautista Ferrari','11 5804-6002','20334455667',null,'alta','gold',null,null, hoy-16),
    (g,'Carolina Sandoval','11 5804-6003',null,'Turno tarde','alta','caja',null,null, hoy-15),
    (g,'Damián Ochoa','11 5804-6004','20356677889','Jefe de planta','alta','platinum',null,null, hoy-14),
    (g,'Estefanía Rolón','11 5804-6005',null,null,'descartado',null,'ya_galicia',null,null),
    (g,'Federico Luna','11 5804-6006',null,null,'descartado',null,'no_interesa',null,null),
    (g,'Graciela Ibarra','11 5804-6007',null,'Administración','descartado',null,'no_contesta',null,null),
    (g,'Hugo Maidana','11 5804-6008',null,'Mantenimiento','en_gestion',null,null, hoy-3, null),
    (g,'Ivana Correa','ivana.correa@correo.demo',null,null,'en_gestion',null,null, hoy-1, null),
    (g,'Julieta Ávila','11 5804-6010',null,null,'en_gestion',null,null, hoy, null);

  -- Prospectos de la posición en la Clínica
  select id into g from public.gestiones where serie_id = (sid||'02')::uuid;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, cuil, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g,'Lucía Benavídez','11 5804-7001','27388990011','Enfermería','alta','plus',null,null, hoy-3),
    (g,'Marcelo Zapata','11 5804-7002','20390011223','Terapia intensiva','alta','black',null,null, hoy-2),
    (g,'Natalia Figueredo','11 5804-7003',null,null,'descartado',null,'no_califica',null,null),
    (g,'Oscar Villanueva','11 5804-7004',null,'Laboratorio','prospecto',null,null, hoy, null),
    (g,'Patricia Giménez','11 5804-7005',null,null,'prospecto',null,null, null, null);

  -- Prospectos de la acción en Vía Norte
  select id into g from public.gestiones where serie_id = (sid||'09')::uuid;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, cuil, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g,'Rodrigo Pizarro','11 5804-8001','20401122334','Depósito','alta','platinum',null,null, hoy-10),
    (g,'Sabrina Molina','11 5804-8002',null,'Caja','alta','caja',null,null, hoy-9),
    (g,'Tobías Hernández','11 5804-8003',null,null,'descartado',null,'ya_galicia',null,null),
    (g,'Vanesa Acuña','11 5804-8004',null,null,'descartado',null,'otro',null,null),
    (g,'Wanda Sorrentino','11 5804-8005',null,'Repositora','en_gestion',null,null, hoy-2, null),
    (g,'Ximena Paz','11 5804-8006',null,null,'en_gestion',null,null, hoy+3, null);

  -- Prospectos de la feria del frigorífico (mes pasado)
  select id into g from public.gestiones where serie_id = (sid||'10')::uuid;
  insert into public.gestion_prospectos(gestion_id, nombre, contacto, cuil, referencia, estado, paquete, motivo, proximo, fecha_alta) values
    (g,'Alan Quiroga','11 5804-9001','20412233445','Cámara de frío','alta','gold',null,null, hoy-24),
    (g,'Brenda Sotelo','11 5804-9002','27423344556',null,'alta','plus',null,null, hoy-23),
    (g,'Cristian Aguirre','11 5804-9003',null,'Despostada','alta','caja',null,null, hoy-22),
    (g,'Daniela Ruiz','11 5804-9004',null,null,'descartado',null,'ya_galicia',null,null),
    (g,'Esteban Moreyra','11 5804-9005',null,null,'descartado',null,'no_interesa',null,null),
    (g,'Fernanda Castro','11 5804-9006',null,'Higiene','descartado',null,'no_contesta',null,null),
    (g,'Gastón Leiva','11 5804-9007',null,null,'prospecto',null,null, null, null),
    (g,'Hilda Romano','11 5804-9008',null,null,'prospecto',null,null, null, null);

  -- La base de Metalúrgica: lo que ya trabajó Nicolas
  select id into g from public.gestiones where serie_id = (sid||'05')::uuid;
  update public.gestion_prospectos set estado='alta', paquete='plus',     fecha_alta = hoy-4 where gestion_id = g and nombre = 'Alejandra Ponce';
  update public.gestion_prospectos set estado='alta', paquete='caja',     fecha_alta = hoy-4 where gestion_id = g and nombre = 'Bruno Salazar';
  update public.gestion_prospectos set estado='alta', paquete='gold',     fecha_alta = hoy-3 where gestion_id = g and nombre = 'Camila Ferreyra';
  update public.gestion_prospectos set estado='alta', paquete='platinum', fecha_alta = hoy-2 where gestion_id = g and nombre = 'Diego Maldonado';
  update public.gestion_prospectos set estado='alta', paquete='caja',     fecha_alta = hoy-1 where gestion_id = g and nombre = 'Emilia Vázquez';
  update public.gestion_prospectos set estado='descartado', motivo='ya_galicia'  where gestion_id = g and nombre = 'Franco Ledesma';
  update public.gestion_prospectos set estado='descartado', motivo='no_interesa' where gestion_id = g and nombre = 'Gisela Paredes';
  update public.gestion_prospectos set estado='descartado', motivo='no_contesta' where gestion_id = g and nombre = 'Hernán Olivera';
  update public.gestion_prospectos set estado='descartado', motivo='no_califica' where gestion_id = g and nombre = 'Irina Camargo';
  update public.gestion_prospectos set estado='en_gestion', proximo = hoy-5 where gestion_id = g and nombre = 'Joaquín Rivas';
  update public.gestion_prospectos set estado='en_gestion', proximo = hoy-2 where gestion_id = g and nombre = 'Karina Lastra';
  update public.gestion_prospectos set estado='prospecto',  proximo = hoy-1 where gestion_id = g and nombre = 'Leonardo Brizuela';
  update public.gestion_prospectos set estado='en_gestion', proximo = hoy   where gestion_id = g and nombre = 'Mariana Quiñones';
  update public.gestion_prospectos set estado='prospecto',  proximo = hoy   where gestion_id = g and nombre = 'Nahuel Peralta';
  update public.gestion_prospectos set estado='en_gestion', proximo = hoy+2 where gestion_id = g and nombre = 'Ornella Bustos';

  -- La base del Laboratorio: recién empezada
  select id into g from public.gestiones where serie_id = (sid||'13')::uuid;
  update public.gestion_prospectos set estado='alta', paquete='plus', fecha_alta = hoy-1 where gestion_id = g and nombre = 'Abril Santillán';
  update public.gestion_prospectos set estado='en_gestion', proximo = hoy+1 where gestion_id = g and nombre = 'Benjamín Córdoba';
  update public.gestion_prospectos set estado='en_gestion', proximo = hoy+3 where gestion_id = g and nombre = 'Celeste Mariño';

  -- Nicolas pregunta en la acción de mañana (a Sofia le queda sin leer)
  select id into g from public.gestiones where serie_id = (sid||'03')::uuid;
  perform public.gestion_mensaje_enviar(g, '¿Llevo el flyer de supermercado o el de combustible? Son casi todos choferes.');

  -- Nicolas avisa que no puede ir a la de Automotores
  select id into g from public.gestiones where serie_id = (sid||'04')::uuid;
  perform public.gestion_no_puedo(g, 'Ese día tengo la capacitación de producto en la sucursal.');

  -- ══ SOFIA responde la pregunta ════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_so, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_so::text, true);
  select id into g from public.gestiones where serie_id = (sid||'01')::uuid;
  perform public.gestion_mensaje_enviar(g, 'Excelente la feria, ya me escribieron de RRHH para repetirla.');

  -- Lo viejo no tiene que aparecer como novedad; lo de mañana sí.
  update public.gestiones set visto_dueno = true where serie_id::text like 'e1000000-0000-4000-8000-%';
  update public.gestiones set visto_hunter = true
   where serie_id::text like 'e1000000-0000-4000-8000-%' and serie_id <> (sid||'03')::uuid;

  raise notice 'Listo: % gestiones y % personas',
    (select count(*) from public.gestiones where serie_id::text like 'e1000000-0000-4000-8000-%'),
    (select count(*) from public.gestion_prospectos p join public.gestiones x on x.id = p.gestion_id where x.serie_id::text like 'e1000000-0000-4000-8000-%');
end $$;
