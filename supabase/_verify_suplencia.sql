-- Verificación de 032_suplencia_y_demo.sql:
--   node supabase/_runsql.mjs supabase/_verify_suplencia.sql
--
-- Simula sesiones con cuentas que ya existen y TERMINA SIEMPRE EN ERROR a
-- propósito: así todo lo que toca (suplente puesto, pedido creado) se deshace.
-- El resultado viene en el mensaje del error: una línea por chequeo, OK o REVISAR.
-- Si falta alguna cuenta para simular (no hay hunter real, no hay dos oficiales
-- activos), ese chequeo sale como "SIN DATOS".

do $$
declare
  v_admin   text := current_user;
  v_out     text := '';
  v_hunter  uuid;
  v_prueba  uuid;
  v_dueno   uuid;
  v_supl    uuid;
  v_emp     text;
  v_n       integer;
  v_m       integer;
  v_prop    public.padron_propuestas;
  v_err     text;
begin
  -- Cuentas para simular
  select id into v_hunter from public.profiles
   where role = 'hunter' and status = 'active' and not es_prueba limit 1;
  select id into v_prueba from public.profiles where es_prueba and status = 'active' limit 1;
  select p.id into v_dueno from public.profiles p
   where p.status = 'active' and p.role <> 'hunter' and not p.es_prueba
     and exists (select 1 from public.padron_empresas pe where pe.user_id = p.id)
   limit 1;
  -- el suplente no es admin: el admin ya lee la base de los no-admin y el
  -- chequeo "no lee directo" daría mal
  select id into v_supl from public.profiles
   where status = 'active' and role not in ('hunter','admin') and not es_prueba
     and id <> coalesce(v_dueno, gen_random_uuid())
   limit 1;

  -- 1) Hunter real: no ve ninguna empresa de una cuenta de prueba
  if v_hunter is null then
    v_out := v_out || E'\nSIN DATOS  hunter real no ve empresas de prueba (no hay hunter activo)';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_hunter, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.padron_empresas where user_id = any(public.ids_prueba());
    select count(*) into v_m from public.padron_empresas;
    perform set_config('role', v_admin, true);
    v_out := v_out || E'\n' || case when v_n = 0 and v_m > 0 then 'OK       ' else 'REVISAR  ' end
             || 'hunter real: ' || v_m || ' empresas, ' || v_n || ' de prueba';
  end if;

  -- 2) Cuenta de prueba como hunter: sólo ve las de prueba
  if v_prueba is null then
    v_out := v_out || E'\nSIN DATOS  prueba como hunter (no hay cuenta de prueba)';
  else
    perform set_config('request.jwt.claims', '', true); -- sin sesión simulada: el trigger deja cambiar el rol
    update public.profiles set role = 'hunter' where id = v_prueba;
    perform set_config('request.jwt.claims', json_build_object('sub', v_prueba, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.padron_empresas where not (user_id = any(public.ids_prueba()));
    select count(*) into v_m from public.padron_empresas;
    perform set_config('role', v_admin, true);
    v_out := v_out || E'\n' || case when v_n = 0 then 'OK       ' else 'REVISAR  ' end
             || 'prueba como hunter: ' || v_m || ' empresas, ' || v_n || ' reales';
  end if;

  -- 3) Suplencia: con suplente ve la base del dueño; sin suplente, nada
  if v_dueno is null or v_supl is null then
    v_out := v_out || E'\nSIN DATOS  suplencia (hacen falta dos oficiales activos, uno con empresas)';
  else
    perform set_config('request.jwt.claims', '', true);
    update public.profiles set suplente_id = v_supl where id = v_dueno;
    select count(*) into v_m from public.padron_empresas where user_id = v_dueno;
    -- una empresa sin pedido abierto (si no, proponer falla con razón)
    select pe.empresa into v_emp from public.padron_empresas pe
     where pe.user_id = v_dueno
       and not exists (select 1 from public.padron_propuestas pp
                        where pp.dueno_id = v_dueno and pp.empresa_key = lower(trim(pe.empresa))
                          and pp.estado in ('pendiente','consulta'))
     limit 1;

    perform set_config('request.jwt.claims', json_build_object('sub', v_supl, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.padron_suplencias() s where s.user_id = v_dueno;
    perform set_config('role', v_admin, true);
    v_out := v_out || E'\n' || case when v_n = v_m and v_m > 0 then 'OK       ' else 'REVISAR  ' end
             || 'suplente ve la base del dueño: ' || v_n || ' de ' || v_m;

    -- El suplente sigue sin leer la tabla directo (no hay policy nueva)
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.padron_empresas where user_id = v_dueno;
    perform set_config('role', v_admin, true);
    v_out := v_out || E'\n' || case when v_n = 0 then 'OK       ' else 'REVISAR  ' end
             || 'suplente no lee padron_empresas del dueño directo: ' || v_n;

    -- Pide un cambio y no lo puede aprobar él mismo
    perform set_config('role', 'authenticated', true);
    v_prop := public.padron_suplencia_proponer(v_emp, v_dueno, null, 'Config 1', null, null);
    v_err := null;
    begin
      perform public.padron_propuesta_aprobar(v_prop.id, null);
    exception when others then v_err := sqlerrm;
    end;
    perform set_config('role', v_admin, true);
    v_out := v_out || E'\n' || case when v_prop.origen = 'suplente' and v_prop.config_antes is not null then 'OK       ' else 'REVISAR  ' end
             || 'pedido del suplente creado (origen ' || coalesce(v_prop.origen, '?') || ')';
    v_out := v_out || E'\n' || case when v_err is not null then 'OK       ' else 'REVISAR  ' end
             || 'el suplente no aprueba su propio pedido' || coalesce(' (' || v_err || ')', '');

    -- El dueño sí lo aprueba y se aplica el cashback
    perform set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_prop := public.padron_propuesta_aprobar(v_prop.id, null);
    perform set_config('role', v_admin, true);
    select count(*) into v_n from public.padron_empresas
     where user_id = v_dueno and lower(trim(empresa)) = lower(trim(v_emp)) and config = 'Config 1';
    v_out := v_out || E'\n' || case when v_prop.estado = 'aprobada' and v_n = 1 then 'OK       ' else 'REVISAR  ' end
             || 'el dueño aprueba y se guarda el cashback';

    -- Sin suplente: ya no ve nada
    perform set_config('request.jwt.claims', '', true);
    update public.profiles set suplente_id = null where id = v_dueno;
    perform set_config('request.jwt.claims', json_build_object('sub', v_supl, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into v_n from public.padron_suplencias();
    perform set_config('role', v_admin, true);
    v_out := v_out || E'\n' || case when v_n = 0 then 'OK       ' else 'REVISAR  ' end
             || 'al sacar el suplente deja de ver: ' || v_n;
  end if;

  raise exception 'RESULTADO (todo se deshizo):%', v_out;
end $$;
