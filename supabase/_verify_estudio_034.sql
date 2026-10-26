-- Verificación de 034_estudio_consulta_compartir.sql:
--   node supabase/_runsql.mjs supabase/_verify_estudio_034.sql
--
-- Simula sesiones con cuentas que ya existen y TERMINA SIEMPRE EN ERROR a
-- propósito: así el diseño de prueba, la pregunta, la respuesta y la copia
-- compartida se deshacen. El resultado viene en el mensaje del error: una
-- línea por chequeo, OK o REVISAR (SIN DATOS si falta una cuenta para simular).

do $$
declare
  v_yo     text := current_user;
  v_out    text := '';
  v_admin  uuid;
  v_autor  uuid;
  v_otro   uuid;
  v_id     uuid;
  v_est    text;
  v_n      integer;
  v_r      jsonb;
  v_err    text;
begin
  select id into v_admin from public.profiles where role = 'admin' and status = 'active' limit 1;
  select id into v_autor from public.profiles where status = 'active' and role not in ('admin','hunter','lider') limit 1;
  select id into v_otro from public.profiles
   where status = 'active' and role not in ('admin','hunter','lider') and id <> coalesce(v_autor, gen_random_uuid()) limit 1;
  if v_admin is null or v_autor is null or v_otro is null then
    raise exception 'SIN DATOS: hace falta un admin y dos cuentas activas que no sean hunter/líder';
  end if;

  -- 1) El autor crea un diseño pedido (como desde la app: pasa por RLS y guardia)
  perform set_config('request.jwt.claims', json_build_object('sub', v_autor, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.flyer_disenos (nombre, opcion, estado, tipo, datos, compartido_por)
  values ('PRUEBA 034', 1, 'pedido', 'diseno', '{"v":1,"cambios":[]}'::jsonb, 'falsificado')
  returning id into v_id;
  select compartido_por into v_est from public.flyer_disenos where id = v_id;
  v_out := v_out || E'\n' || case when v_est = '' then 'OK' else 'REVISAR' end || ' alta: no se puede falsear "compartido"';

  -- 2) El autor no puede pasarlo a consulta por su cuenta
  begin
    update public.flyer_disenos set estado = 'consulta' where id = v_id;
    v_out := v_out || E'\nREVISAR el autor pasó su diseño a consulta';
  exception when others then
    v_out := v_out || E'\nOK el autor no puede pasarlo a consulta';
  end;

  -- 3) El autor no puede preguntar ni compartir
  begin
    perform public.flyer_diseno_consultar(v_id, 'hola');
    v_out := v_out || E'\nREVISAR un no admin pudo preguntar';
  exception when others then v_out := v_out || E'\nOK un no admin no puede preguntar'; end;
  begin
    perform public.flyer_diseno_compartir(v_id, array[v_otro]);
    v_out := v_out || E'\nREVISAR un no admin pudo compartir';
  exception when others then v_out := v_out || E'\nOK un no admin no puede compartir'; end;

  -- 4) El admin pregunta
  perform set_config('role', v_yo, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.flyer_diseno_consultar(v_id, '¿Seguro?');
  select estado into v_est from public.flyer_disenos where id = v_id;
  select count(*) into v_n from public.flyer_diseno_mensajes where diseno_id = v_id;
  v_out := v_out || E'\n' || case when v_est = 'consulta' and v_n = 1 then 'OK' else 'REVISAR' end || ' el admin pregunta: ' || v_est || ' / ' || v_n || ' mensaje(s)';

  -- 5) Otra persona no ve el hilo; el autor sí, guarda cambios en consulta y responde
  perform set_config('role', v_yo, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.flyer_diseno_mensajes where diseno_id = v_id;
  v_out := v_out || E'\n' || case when v_n = 0 then 'OK' else 'REVISAR' end || ' otra persona no ve la pregunta';
  begin
    perform public.flyer_diseno_responder(v_id, 'yo no soy');
    v_out := v_out || E'\nREVISAR otra persona pudo responder';
  exception when others then v_out := v_out || E'\nOK otra persona no puede responder'; end;

  perform set_config('role', v_yo, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_autor, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.flyer_diseno_mensajes where diseno_id = v_id;
  v_out := v_out || E'\n' || case when v_n = 1 then 'OK' else 'REVISAR' end || ' el autor ve la pregunta';
  begin
    update public.flyer_disenos set nombre = 'PRUEBA 034 b' where id = v_id;
    get diagnostics v_n = row_count;
    v_out := v_out || E'\n' || case when v_n = 1 then 'OK' else 'REVISAR' end || ' el autor guarda cambios estando en consulta';
  exception when others then get stacked diagnostics v_err = message_text; v_out := v_out || E'\nREVISAR guardar en consulta: ' || v_err; end;
  perform public.flyer_diseno_responder(v_id, 'Sí');
  select estado into v_est from public.flyer_disenos where id = v_id;
  v_out := v_out || E'\n' || case when v_est = 'pedido' then 'OK' else 'REVISAR' end || ' responder lo vuelve a pedido: ' || v_est;

  -- 6) El admin comparte con otra persona (y con el autor: se saltea)
  perform set_config('role', v_yo, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_r := public.flyer_diseno_compartir(v_id, array[v_otro, v_autor]);
  v_out := v_out || E'\n' || case when jsonb_array_length(v_r->'nuevos') = 1 and jsonb_array_length(v_r->'salteados') = 1 then 'OK' else 'REVISAR' end || ' compartir: ' || v_r::text;
  v_r := public.flyer_diseno_compartir(v_id, array[v_otro]);
  v_out := v_out || E'\n' || case when jsonb_array_length(v_r->'actualizados') = 1 then 'OK' else 'REVISAR' end || ' volver a compartir reemplaza la copia';

  -- 7) La otra persona ve su copia como propia y no puede cambiar "compartido"
  perform set_config('role', v_yo, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_otro, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_n from public.flyer_disenos where compartido_de = v_id and user_id = v_otro and estado = 'privado' and compartido_por <> '';
  v_out := v_out || E'\n' || case when v_n = 1 then 'OK' else 'REVISAR' end || ' la otra persona ve 1 copia privada';
  update public.flyer_disenos set compartido_por = 'yo' where compartido_de = v_id;
  select count(*) into v_n from public.flyer_disenos where compartido_de = v_id and compartido_por = 'yo';
  v_out := v_out || E'\n' || case when v_n = 0 then 'OK' else 'REVISAR' end || ' no puede falsear "compartido" en su copia';
  select count(*) into v_n from public.flyer_disenos where id = v_id;
  v_out := v_out || E'\n' || case when v_n = 0 then 'OK' else 'REVISAR' end || ' no ve el original del autor';

  perform set_config('role', v_yo, true);
  raise exception 'RESULTADO (se deshace todo):%', v_out;
end $$;
