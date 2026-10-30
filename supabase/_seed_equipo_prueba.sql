-- Empresas INVENTADAS para las dos cuentas de prueba que hacen de oficial
-- (Sofia Merle y Leandro Peralta, los dos perfil Pro). Razones sociales, CUIT
-- (rango 30-91…, sin asignar) y oficiales son de fantasía; los CUIT no se pisan
-- con los de Prospect (30-90…). Sirven para armar flyers (traen cashback por
-- rubro, oficiales y configuración) y para derivarle acciones al hunter.
-- Se puede volver a correr: borra sólo estas empresas de esas dos cuentas y las
-- vuelve a cargar. No toca ninguna otra cuenta.
--   node supabase/_runsql.mjs supabase/_seed_equipo_prueba.sql
do $$
declare
  v_sofia uuid; v_leandro uuid;
  v_sofia_rows jsonb := '[
   {"empresa":"Molinos del Oeste SA","cuits":["30910001115"],"config":"BAU","rubro":{"opcion":0,"importe":"30000","importe2":"","txt":"Combustible"}},
   {"empresa":"Clínica Sierra Chica SA","cuits":["30910002111","30910002138"],"config":"Config 1","rubro":{"opcion":0,"importe":"24000","importe2":"30000","txt":"Ambos"}},
   {"empresa":"Logística Ruta Azul SRL","cuits":["30910003118"],"config":"BAU","rubro":{"opcion":0,"importe":"24000","importe2":"","txt":"Supermercado"}},
   {"empresa":"Textiles Punta Mogotes SA","cuits":["30910004114"],"config":"Config 2","rubro":{}},
   {"empresa":"Cooperativa Agraria San Vicente Ltda.","cuits":["30910005110"],"config":"Config 3","rubro":{"opcion":0,"importe":"40000","importe2":"","txt":"Combustible"}},
   {"empresa":"Automotores Llanura Verde SA","cuits":["30910006117","30910006125"],"config":"BAU","rubro":{"opcion":0,"importe":"15000","importe2":"","txt":"Supermercado"}},
   {"empresa":"Seguros del Litoral SA","cuits":["30910007113"],"config":"Config 4","rubro":{}},
   {"empresa":"Panadería Industrial Trigo Pampa SRL","cuits":["30910008110"],"config":"Config 1","rubro":{"opcion":0,"importe":"20000","importe2":"20000","txt":"Ambos"}},
   {"empresa":"Colegio San Jerónimo SRL","cuits":["30910009116"],"config":"Config 2","rubro":{}},
   {"empresa":"Metalúrgica Dos Puentes SA","cuits":["30910010112"],"config":"BAU","rubro":{"opcion":0,"importe":"24000","importe2":"","txt":"Combustible"}}
  ]'::jsonb;
  v_leandro_rows jsonb := '[
   {"empresa":"Supermercados Vía Norte SA","cuits":["30910020119","30910020127"],"config":"BAU","rubro":{"opcion":0,"importe":"30000","importe2":"","txt":"Supermercado"}},
   {"empresa":"Transportes Cordillera SRL","cuits":["30910021115"],"config":"Config 1","rubro":{"opcion":0,"importe":"30000","importe2":"","txt":"Combustible"}},
   {"empresa":"Laboratorio Bioquímico Austral SA","cuits":["30910022111"],"config":"Config 3","rubro":{"opcion":0,"importe":"20000","importe2":"24000","txt":"Ambos"}},
   {"empresa":"Constructora Piedra Alta SA","cuits":["30910023118"],"config":"Config 2","rubro":{}},
   {"empresa":"Frigorífico Las Tres Marías SA","cuits":["30910024114"],"config":"BAU","rubro":{"opcion":0,"importe":"24000","importe2":"","txt":"Combustible"}},
   {"empresa":"Centro Médico Los Tilos SRL","cuits":["30910025110"],"config":"Config 4","rubro":{"opcion":0,"importe":"20000","importe2":"","txt":"Supermercado"}},
   {"empresa":"Imprenta Offset Rivadavia SRL","cuits":["30910026117"],"config":"Config 1","rubro":{}},
   {"empresa":"Distribuidora Mayorista El Faro SA","cuits":["30910027113","30910027121"],"config":"BAU","rubro":{"opcion":0,"importe":"15000","importe2":"24000","txt":"Ambos"}}
  ]'::jsonb;
  -- Oficiales de fantasía que salen impresos en el flyer. El primero es la
  -- persona de la cuenta, así el flyer sale con sus datos.
  v_sofia_ases jsonb := '[{"nombre":"Sofia Merle","celular":"11 5700-1001","email":"pruebaoficial@bancogalicia.com.ar"},{"nombre":"Bruno Carrizo Elía","celular":"11 5700-1002","email":"bruno.carrizo@bancogalicia.com.ar"},{"nombre":"","celular":"","email":""},{"nombre":"","celular":"","email":""}]'::jsonb;
  v_leandro_ases jsonb := '[{"nombre":"Leandro Peralta","celular":"11 5700-2001","email":"pruebaoficial2@bancogalicia.com.ar"},{"nombre":"Delfina Ocaranza Rivas","celular":"11 5700-2002","email":"delfina.ocaranza@bancogalicia.com.ar"},{"nombre":"","celular":"","email":""},{"nombre":"","celular":"","email":""}]'::jsonb;
begin
  select id into v_sofia   from public.profiles where es_prueba and lower(email) = 'pruebaoficial@bancogalicia.com.ar';
  select id into v_leandro from public.profiles where es_prueba and lower(email) = 'pruebaoficial2@bancogalicia.com.ar';
  if v_sofia is null or v_leandro is null then
    raise exception 'No encontré las cuentas de prueba (Sofia Merle / Leandro Peralta) marcadas como es_prueba';
  end if;

  delete from public.padron_empresas pe
   where pe.user_id = v_sofia
     and lower(trim(pe.empresa)) in (select lower(trim(r->>'empresa')) from jsonb_array_elements(v_sofia_rows) r);
  delete from public.padron_empresas pe
   where pe.user_id = v_leandro
     and lower(trim(pe.empresa)) in (select lower(trim(r->>'empresa')) from jsonb_array_elements(v_leandro_rows) r);

  insert into public.padron_empresas (user_id, empresa, cuits, config, asesores, rubro)
  select v_sofia, r->>'empresa',
         coalesce((select array_agg(c) from jsonb_array_elements_text(r->'cuits') c), '{}'),
         coalesce(r->>'config', ''), v_sofia_ases, r->'rubro'
    from jsonb_array_elements(v_sofia_rows) r;

  insert into public.padron_empresas (user_id, empresa, cuits, config, asesores, rubro)
  select v_leandro, r->>'empresa',
         coalesce((select array_agg(c) from jsonb_array_elements_text(r->'cuits') c), '{}'),
         coalesce(r->>'config', ''), v_leandro_ases, r->'rubro'
    from jsonb_array_elements(v_leandro_rows) r;

  raise notice 'Empresas: Sofia % / Leandro %',
    (select count(*) from public.padron_empresas where user_id = v_sofia),
    (select count(*) from public.padron_empresas where user_id = v_leandro);
end $$;

select p.full_name, count(e.id) as empresas
  from public.profiles p left join public.padron_empresas e on e.user_id = p.id
 where lower(p.email) in ('pruebaoficial@bancogalicia.com.ar','pruebaoficial2@bancogalicia.com.ar')
 group by p.full_name order by 1;
