-- Agenda de los próximos dos meses (23-nov-2026 al 22-ene-2027) para el equipo
-- de prueba: Martin Romero (líder), Sofia Merle y Leandro Peralta (oficiales),
-- Nicolas Ferrari y Camila Duarte (hunters). Empresas de _seed_equipo_prueba.sql;
-- personas y teléfonos de fantasía. Fechas FIJAS (no relativas a hoy): la
-- historia es la de fin de año.
--
-- Qué muestra:
--   · Posiciones comerciales que se repiten (Camila todos los miércoles en la
--     Clínica; Nicolas cada 15 días en Transportes y lunes por medio en Vía Norte).
--   · Diciembre cargado: charlas de aguinaldo, ferias y brindis de fin de año.
--   · Sin nada los fines de semana ni el 7, 8, 24, 25 y 31 de diciembre ni el 1 de enero.
--   · Camila de vacaciones del 4 al 15 de enero: esas semanas trabaja sólo Nicolas.
--   · Martin asigna él mismo (lo ven como novedad) y tiene más "Que la asigne el líder".
--   · Acciones que se agendó cada hunter por su cuenta, un "No puedo ir" de Camila,
--     dos charlas por videollamada y conversaciones.
--   · Dos bases de datos: una con próximos contactos repartidos hasta enero y otra
--     que arranca el 4 de enero.
--
-- Correr DESPUÉS de _seed_equipo_prueba_gestiones.sql (si una acción pisa el
-- horario de otra que ya existe, se saltea y lo avisa). Se puede volver a correr:
-- borra sólo estos ejemplos (serie_id e2000000-…). Lo que ya pasó no se vuelve a cargar.
--   node supabase/_runsql.mjs supabase/_seed_equipo_prueba_agenda.sql
do $$
declare
  v_so uuid; v_le uuid; v_ni uuid; v_ma uuid; v_ca uuid;
  ids jsonb;
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  feriados date[] := array['2026-12-07','2026-12-08','2026-12-24','2026-12-25','2026-12-31','2027-01-01']::date[];
  sid text := 'e2000000-0000-4000-8000-0000000000';
  it jsonb; m jsonb; g uuid; d date; i int; n int; cada int;
  v_crea uuid; v_hun uuid; v_lid uuid; v_due uuid; v_serie uuid;
  v_hd time; v_hh time; cargadas int := 0; salteadas int := 0;
  items jsonb := '[
   {"k":"01","c":"so","h":"ca","t":"posicion","e":"Clínica Sierra Chica SA","f":"2026-11-25","hd":"09:00","hh":"12:00","rep":6,"cada":7,"lu":"Hall de ingreso","n":"Posición fija de los miércoles: turno mañana y salida del turno noche."},
   {"k":"02","c":"le","h":"ni","t":"posicion","e":"Transportes Cordillera SRL","f":"2026-11-25","hd":"14:00","hh":"17:00","rep":4,"cada":14,"lu":"Base de camiones, Ruta 7","n":"Cada 15 días, cuando vuelven los choferes de larga distancia."},
   {"k":"03","c":"le","h":"ni","t":"posicion","e":"Supermercados Vía Norte SA","f":"2026-11-30","hd":"10:00","hh":"12:00","rep":4,"cada":14,"lu":"Sucursal centro, hall de cajas","n":"Lunes por medio, el día que cobran los repositores."},
   {"k":"04","c":"le","h":"ca","t":"feria","e":"Constructora Piedra Alta SA","f":"2026-11-26","hd":"12:00","hh":"15:00","lu":"Obrador nuevo, Pilar","n":"Almuerzo de fin de obra: va todo el personal."},
   {"k":"05","c":"ni","o":"propia","du":"le","t":"accion","e":"Laboratorio Bioquímico Austral SA","f":"2026-11-27","hd":"15:00","hh":"17:00","lu":"Recepción del laboratorio","n":"Paso a cerrar a los de la base que pidieron hablar en persona."},
   {"k":"06","c":"so","h":"ca","t":"accion","e":"Molinos del Oeste SA","f":"2026-12-01","hd":"09:00","hh":"12:00","lu":"Comedor de planta","n":"Charla de aguinaldo: cobrarlo en Galicia y los beneficios de diciembre."},
   {"k":"07","c":"so","h":"ni","t":"accion","e":"Metalúrgica Dos Puentes SA","f":"2026-12-02","hd":"10:00","hh":"12:00","lu":"Oficina de RRHH","n":"Cierre de la base: los que pidieron que vayamos en persona."},
   {"k":"08","c":"le","h":"ni","t":"feria","e":"Frigorífico Las Tres Marías SA","f":"2026-12-03","hd":"09:00","hh":"13:00","lu":"Comedor del frigorífico","n":"Feria de fin de año. Llevar sorteo y folletería de Plus Gold."},
   {"k":"09","c":"le","h":"ca","t":"posicion","e":"Distribuidora Mayorista El Faro SA","f":"2026-12-03","hd":"14:00","hh":"16:00","lu":"Depósito, salida de camionetas"},
   {"k":"10","c":"so","h":"ca","t":"accion","e":"Automotores Llanura Verde SA","f":"2026-12-04","hd":"10:00","hh":"12:00","lu":"Concesionaria, salón de ventas","n":"La que Nicolas no pudo cubrir en noviembre: ahora va Camila."},
   {"k":"11","c":"so","h":"ni","t":"accion","e":"Colegio San Jerónimo SRL","f":"2026-12-09","hd":"09:00","hh":"11:00","lu":"Sala de profesores","n":"Reprogramada: ya terminaron las mesas de examen."},
   {"k":"12","c":"ma","du":"le","h":"ca","t":"feria","e":"Supermercados Vía Norte SA","f":"2026-12-10","hd":"09:00","hh":"13:00","lu":"Sucursal centro, playón","n":"Fiesta de fin de año del personal: stand con sorteo."},
   {"k":"13","c":"ma","du":"so","h":"ni","t":"feria","e":"Textiles Punta Mogotes SA","f":"2026-12-10","hd":"14:00","hh":"17:00","lu":"Comedor de planta","n":"Brindis de fin de año de la planta."},
   {"k":"14","c":"so","h":"ca","t":"accion","e":"Logística Ruta Azul SRL","f":"2026-12-11","hd":"09:00","hh":"11:00","lu":"Depósito de Pacheco","n":"Choferes del turno noche que no estaban la otra vez."},
   {"k":"15","c":"ni","o":"propia","du":"le","t":"posicion","e":"Centro Médico Los Tilos SRL","f":"2026-12-11","hd":"10:00","hh":"12:00","lu":"Sala de espera de guardia"},
   {"k":"16","c":"so","h":"ca","t":"feria","e":"Seguros del Litoral SA","f":"2026-12-14","hd":"09:00","hh":"13:00","lu":"Oficina central, SUM","n":"Feria de aguinaldo para todo el edificio."},
   {"k":"17","c":"le","h":"ca","t":"accion","e":"Transportes Cordillera SRL","f":"2026-12-15","hd":"09:00","hh":"11:00","lu":"Oficina administrativa","n":"Administrativos y logística (no los choferes)."},
   {"k":"18","c":"le","h":"ni","t":"accion","e":"Imprenta Offset Rivadavia SRL","f":"2026-12-16","hd":"09:00","hh":"11:00","lu":"Taller, entrada por el fondo"},
   {"k":"19","c":"so","h":"ni","t":"feria","e":"Metalúrgica Dos Puentes SA","f":"2026-12-17","hd":"11:00","hh":"15:00","lu":"Nave principal","n":"Brindis de fin de año: la feria va en el mismo brindis."},
   {"k":"20","c":"le","h":"ca","t":"posicion","e":"Laboratorio Bioquímico Austral SA","f":"2026-12-17","hd":"10:00","hh":"12:00","lu":"Recepción"},
   {"k":"21","c":"le","l":"ma","t":"accion","e":"Constructora Piedra Alta SA","f":"2026-12-18","hd":"09:00","hh":"11:00","lu":"Obrador de Pilar","n":"Quedó gente de la feria sin atender. Martin, mandá a quien tengas libre."},
   {"k":"22","c":"le","h":"ca","t":"accion","e":"Centro Médico Los Tilos SRL","f":"2026-12-18","hd":"15:00","hh":"17:00","lu":"Administración","n":"Personal administrativo y de facturación."},
   {"k":"23","c":"le","h":"ni","t":"accion","m":"virtual","e":"Distribuidora Mayorista El Faro SA","f":"2026-12-18","hd":"10:00","hh":"11:00","lu":"Videollamada","n":"Charla por Meet con administración: están en otra provincia."},
   {"k":"24","c":"so","h":"ni","t":"accion","e":"Logística Ruta Azul SRL","f":"2026-12-21","hd":"09:00","hh":"11:00","lu":"Depósito de Pacheco","n":"Antes de las vacaciones de los choferes: los que faltaban."},
   {"k":"25","c":"le","h":"ca","t":"posicion","e":"Frigorífico Las Tres Marías SA","f":"2026-12-21","hd":"09:00","hh":"12:00","lu":"Ingreso de personal"},
   {"k":"26","c":"so","h":"ca","t":"accion","e":"Panadería Industrial Trigo Pampa SRL","f":"2026-12-22","hd":"10:00","hh":"12:00","lu":"Oficina de RRHH","n":"Turno mañana. El de la tarde lo ve Nicolas en la feria."},
   {"k":"27","c":"so","h":"ni","t":"posicion","e":"Clínica Sierra Chica SA","f":"2026-12-22","hd":"15:00","hh":"17:00","lu":"Hall de ingreso","n":"Turno tarde (el de la mañana lo cubre Camila los miércoles)."},
   {"k":"28","c":"so","l":"ma","t":"feria","e":"Automotores Llanura Verde SA","f":"2026-12-22","hd":"10:00","hh":"13:00","lu":"Salón de ventas","n":"Evento de fin de año con clientes y empleados."},
   {"k":"29","c":"ni","o":"propia","du":"so","t":"accion","e":"Molinos del Oeste SA","f":"2026-12-29","hd":"09:00","hh":"11:00","lu":"Oficina de RRHH","n":"Cierre del año: llevo el resumen de altas."},
   {"k":"30","c":"ca","o":"propia","du":"le","t":"posicion","e":"Supermercados Vía Norte SA","f":"2026-12-29","hd":"10:00","hh":"13:00","lu":"Sucursal de la ruta","n":"Se lo ofrecí al encargado y quieren repetir."},
   {"k":"31","c":"so","h":"ni","t":"accion","m":"virtual","e":"Seguros del Litoral SA","f":"2027-01-04","hd":"10:00","hh":"11:00","lu":"Videollamada","n":"Por Meet: muchos están de vacaciones."},
   {"k":"32","c":"le","h":"ni","t":"accion","e":"Frigorífico Las Tres Marías SA","f":"2027-01-07","hd":"09:00","hh":"11:00","lu":"Comedor del frigorífico","n":"Ingresantes de temporada: arrancan en enero."},
   {"k":"33","c":"ma","du":"le","h":"ni","t":"posicion","e":"Constructora Piedra Alta SA","f":"2027-01-08","hd":"08:00","hh":"10:00","lu":"Obrador de Pilar","n":"Obra nueva: entran 60 personas."},
   {"k":"34","c":"le","h":"ni","t":"accion","e":"Laboratorio Bioquímico Austral SA","f":"2027-01-13","hd":"10:00","hh":"12:00","lu":"Recepción"},
   {"k":"35","c":"le","h":"ni","t":"accion","e":"Centro Médico Los Tilos SRL","f":"2027-01-14","hd":"14:00","hh":"16:00","lu":"Sala de espera de guardia"},
   {"k":"36","c":"le","l":"ma","t":"feria","e":"Imprenta Offset Rivadavia SRL","f":"2027-01-14","hd":"09:00","hh":"12:00","lu":"Taller","n":"Para cuando vuelva Camila de vacaciones."},
   {"k":"37","c":"so","h":"ca","t":"accion","e":"Clínica Sierra Chica SA","f":"2027-01-18","hd":"09:00","hh":"11:00","lu":"Hall de ingreso","n":"Vuelta de vacaciones: lo pendiente del turno noche."},
   {"k":"38","c":"so","h":"ca","t":"feria","e":"Molinos del Oeste SA","f":"2027-01-19","hd":"10:00","hh":"14:00","lu":"Comedor de planta","n":"Feria de inicio de año."},
   {"k":"39","c":"so","h":"ni","t":"accion","e":"Metalúrgica Dos Puentes SA","f":"2027-01-20","hd":"09:00","hh":"11:00","lu":"Oficina de RRHH"},
   {"k":"40","c":"so","h":"ca","t":"posicion","e":"Textiles Punta Mogotes SA","f":"2027-01-20","hd":"14:00","hh":"16:00","lu":"Comedor del turno mañana"},
   {"k":"41","c":"ma","du":"le","h":"ni","t":"feria","e":"Supermercados Vía Norte SA","f":"2027-01-21","hd":"09:00","hh":"13:00","lu":"Sucursal nueva","n":"Apertura de la segunda sucursal."},
   {"k":"42","c":"so","h":"ca","t":"accion","e":"Seguros del Litoral SA","f":"2027-01-21","hd":"10:00","hh":"12:00","lu":"Oficina central, piso 4","n":"Los ingresos de enero."},
   {"k":"43","c":"so","h":"ni","t":"accion","e":"Automotores Llanura Verde SA","f":"2027-01-22","hd":"10:00","hh":"12:00","lu":"Concesionaria, salón de ventas"},
   {"k":"44","c":"le","l":"ma","t":"accion","e":"Distribuidora Mayorista El Faro SA","f":"2027-01-22","hd":"09:00","hh":"12:00","lu":"Depósito","n":"Que la asigne Martin: no sé quién vuelve primero de vacaciones."},
   {"k":"45","c":"so","h":"ca","t":"datos","m":"virtual","e":"Clínica Sierra Chica SA","f":"2026-11-20","v":"2027-01-15","n":"Listado del turno noche. Llamar de 7 a 9, cuando salen."},
   {"k":"46","c":"le","h":"ni","t":"datos","m":"virtual","e":"Frigorífico Las Tres Marías SA","f":"2027-01-04","v":"2027-01-29","n":"Ingresantes de temporada (RRHH pasa la lista el 4 de enero)."}
  ]'::jsonb;
begin
  select id into v_so from public.profiles where es_prueba and lower(email) = 'pruebaoficial@bancogalicia.com.ar';
  select id into v_le from public.profiles where es_prueba and lower(email) = 'pruebaoficial2@bancogalicia.com.ar';
  select id into v_ni from public.profiles where es_prueba and lower(email) = 'pruebahunter@bancogalicia.com.ar';
  select id into v_ma from public.profiles where es_prueba and lower(email) = 'pruebalider@bancogalicia.com.ar';
  select id into v_ca from public.profiles where es_prueba and lower(email) = 'pruebahunter2@bancogalicia.com.ar';
  if v_so is null or v_le is null or v_ni is null or v_ma is null or v_ca is null then
    raise exception 'Faltan cuentas de prueba (Sofia / Leandro / Nicolas / Camila / Martin) marcadas como es_prueba';
  end if;
  ids := jsonb_build_object('so', v_so, 'le', v_le, 'ni', v_ni, 'ma', v_ma, 'ca', v_ca);

  delete from public.gestiones where serie_id::text like 'e2000000-0000-4000-8000-%';

  for it in select x from jsonb_array_elements(items) x loop
    v_crea  := (ids->>(it->>'c'))::uuid;
    v_hun   := case when it ? 'h' then (ids->>(it->>'h'))::uuid end;
    v_lid   := case when it ? 'l' then (ids->>(it->>'l'))::uuid end;
    v_due   := case when it ? 'du' then (ids->>(it->>'du'))::uuid end;
    v_serie := (sid || (it->>'k'))::uuid;
    v_hd    := (it->>'hd')::time;
    v_hh    := (it->>'hh')::time;
    n       := coalesce((it->>'rep')::int, 1);
    cada    := (it->>'cada')::int;
    if coalesce(it->>'o', '') = 'propia' then v_hun := v_crea; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_crea, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_crea::text, true);

    for i in 1..n loop
      d := (it->>'f')::date + coalesce(cada, 0) * (i - 1);
      -- Lo que ya pasó no se carga (una base de datos sí: ya está en curso).
      if (d < hoy and it->>'t' <> 'datos') or d = any(feriados) or extract(isodow from d) > 5 then
        continue;
      end if;
      if v_hun is not null and v_hd is not null and exists (
        select 1 from public.gestiones o
         where o.hunter_id = v_hun and o.fecha = d and o.estado <> 'cancelada'
           and o.hora_desde is not null and o.tipo <> 'datos'
           and o.hora_desde < public.ges_fin(v_hd, v_hh)
           and v_hd < public.ges_fin(o.hora_desde, o.hora_hasta)) then
        raise notice 'Salteada (pisa otro horario): % % %', it->>'k', it->>'e', d;
        salteadas := salteadas + 1;
        continue;
      end if;
      insert into public.gestiones(empresa, dueno_id, origen, hunter_id, lider_id, tipo, modalidad, estado,
                                   fecha, vence, hora_desde, hora_hasta, lugar, frecuencia, cada_dias, veces, vez, nota, serie_id)
      values (it->>'e', v_due, coalesce(it->>'o', 'derivada'), v_hun, v_lid, it->>'t', coalesce(it->>'m', 'presencial'), 'planificada',
              d, (it->>'v')::date, v_hd, v_hh, it->>'lu',
              case when n > 1 then 'repite' else 'unica' end,
              case when n > 1 then cada end, case when n > 1 then n end, case when n > 1 then i end,
              it->>'n', v_serie);
      cargadas := cargadas + 1;
    end loop;
  end loop;

  -- ══ La base del turno noche de la Clínica (Camila): contactos repartidos hasta enero
  perform set_config('request.jwt.claims', json_build_object('sub', v_so, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_so::text, true);
  select id into g from public.gestiones where serie_id = (sid || '45')::uuid;
  if g is not null then
    insert into public.gestion_prospectos(gestion_id, nombre, contacto, cuil, referencia, estado, paquete, motivo, proximo, fecha_alta) values
      (g,'Andrea Bustamante','11 5810-1001','27351234561','Enfermería','alta','plus',null,null,'2026-11-20'),
      (g,'Bruno Echeverría','11 5810-1002','20362345672','Camillero','alta','caja',null,null,'2026-11-20'),
      (g,'Cecilia Montiel','11 5810-1003',null,'Guardia','descartado',null,'ya_galicia',null,null),
      (g,'Diego Albornoz','11 5810-1004',null,'Enfermería','en_gestion',null,null,'2026-11-24',null),
      (g,'Elena Quintana','11 5810-1005',null,'Terapia intensiva','en_gestion',null,null,'2026-11-26',null),
      (g,'Facundo Roldán','facundo.roldan@correo.demo',null,'Mantenimiento','prospecto',null,null,'2026-11-30',null),
      (g,'Gabriela Soria','11 5810-1007',null,'Enfermería','en_gestion',null,null,'2026-12-01',null),
      (g,'Héctor Duarte','11 5810-1008',null,'Seguridad','en_gestion',null,null,'2026-12-03',null),
      (g,'Inés Palacios','11 5810-1009',null,'Neonatología','en_gestion',null,null,'2026-12-10',null),
      (g,'Javier Toledo','11 5810-1010',null,'Guardia','en_gestion',null,null,'2026-12-15',null),
      (g,'Laura Medina','laura.medina@correo.demo',null,'Laboratorio','prospecto',null,null,'2026-12-22',null),
      (g,'Matías Godoy','11 5810-1012',null,'Camillero','en_gestion',null,null,'2027-01-18',null),
      (g,'Nora Benítez','11 5810-1013',null,'Admisión','prospecto',null,null,'2027-01-19',null),
      (g,'Omar Ríos','11 5810-1014',null,'Guardia','a_contactar',null,null,null,null),
      (g,'Paola Herrera','11 5810-1015',null,'Enfermería','a_contactar',null,null,null,null),
      (g,'Ramón Vega','11 5810-1016',null,'Cocina','a_contactar',null,null,null,null);
  end if;

  -- ══ La base de ingresantes del Frigorífico (Nicolas): arranca el 4 de enero
  perform set_config('request.jwt.claims', json_build_object('sub', v_le, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_le::text, true);
  select id into g from public.gestiones where serie_id = (sid || '46')::uuid;
  if g is not null then
    insert into public.gestion_prospectos(gestion_id, nombre, contacto, referencia, estado) values
      (g,'Agustina Ledesma','11 5811-2001','Legajo 3101','a_contactar'),
      (g,'Braian Coronel','11 5811-2002','Legajo 3102','a_contactar'),
      (g,'Carla Funes','11 5811-2003','Legajo 3103','a_contactar'),
      (g,'Dylan Ojeda','11 5811-2004','Legajo 3104','a_contactar'),
      (g,'Evelyn Paz','evelyn.paz@correo.demo','Legajo 3105','a_contactar'),
      (g,'Gonzalo Cabrera','11 5811-2006','Legajo 3106','a_contactar'),
      (g,'Jazmín Arias','11 5811-2007','Legajo 3107','a_contactar'),
      (g,'Kevin Sánchez','11 5811-2008','Legajo 3108','a_contactar'),
      (g,'Luciana Ortiz','11 5811-2009','Legajo 3109','a_contactar'),
      (g,'Marcos Aguilera','11 5811-2010','Legajo 3110','a_contactar'),
      (g,'Nadia Ponce','11 5811-2011','Legajo 3111','a_contactar'),
      (g,'Pedro Villalba','11 5811-2012','Legajo 3112','a_contactar');
  end if;

  -- ══ Conversaciones (en la primera fecha de cada una) ══════════════════════
  for m in select x from jsonb_array_elements('[
      ["01","ca","¿Puedo quedarme hasta las 13? A esa hora sale el turno noche."],
      ["01","so","Sí, ya avisé en la guardia. Llevá también el flyer de Ambos."],
      ["08","ni","¿Cuánta gente esperan? Así calculo la folletería."],
      ["08","le","Unos 400, en dos turnos. El segundo entra a las 11."],
      ["12","ma","Camila: llevá el banner nuevo y el sorteo. Leandro ya habló con RRHH."]
    ]'::jsonb) x loop
    select id into g from public.gestiones where serie_id = (sid || (m->>0))::uuid order by fecha limit 1;
    continue when g is null;
    perform set_config('request.jwt.claims', json_build_object('sub', ids->>(m->>1), 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', ids->>(m->>1), true);
    perform public.gestion_mensaje_enviar(g, m->>2);
  end loop;

  -- ══ Camila avisa que no puede ir al Laboratorio (queda para que Martin la reasigne)
  perform set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ca::text, true);
  select id into g from public.gestiones where serie_id = (sid || '20')::uuid;
  if g is not null then
    perform public.gestion_no_puedo(g, 'Ese día tengo turno médico. ¿La puede cubrir Nicolas?');
  end if;

  -- Lo que asignó Martin queda como novedad para el hunter y para el oficial;
  -- el resto, ya visto.
  perform set_config('fg.marcar_vista', '1', true);
  update public.gestiones set visto_dueno = true, visto_hunter = true
   where serie_id::text like 'e2000000-0000-4000-8000-%'
     and serie_id not in ((sid||'12')::uuid, (sid||'13')::uuid, (sid||'33')::uuid, (sid||'41')::uuid);
  perform set_config('fg.marcar_vista', '', true);

  raise notice 'Listo: % fechas cargadas, % salteadas por horario, % personas en bases',
    cargadas, salteadas,
    (select count(*) from public.gestion_prospectos p join public.gestiones x on x.id = p.gestion_id
      where x.serie_id::text like 'e2000000-0000-4000-8000-%');
end $$;

-- Resumen por semana y por hunter
select to_char(date_trunc('week', g.fecha), 'DD/MM') as semana,
       coalesce(p.full_name, '(para que asigne el líder)') as hunter,
       count(*) as gestiones
  from public.gestiones g left join public.profiles p on p.id = g.hunter_id
 where g.serie_id::text like 'e2000000-0000-4000-8000-%' and g.tipo <> 'datos'
 group by 1, 2, date_trunc('week', g.fecha) order by date_trunc('week', g.fecha), 2;
