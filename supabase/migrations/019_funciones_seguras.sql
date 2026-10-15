-- Funciones de la base: cada una puede ejecutarla sólo quien la necesita, y todas
-- con el search_path fijo. Cierra los avisos de seguridad del asesor de Supabase
-- (function_search_path_mutable y anon_security_definer_function_executable).
--
-- POR QUÉ: Supabase le da EXECUTE a `anon` (un visitante sin sesión) sobre toda
-- función nueva de public, y las migraciones anteriores sólo le sacaban PUBLIC
-- (`revoke … from public`), que no alcanza: `anon` conserva su propio permiso y
-- por eso cualquiera podía llamar por /rest/v1/rpc a 20 funciones SECURITY
-- DEFINER. Todas chequean auth.uid()/is_active() adentro y no filtraban nada (se
-- probó), pero no tienen por qué estar expuestas. Y 6 funciones no tenían fijado
-- el search_path, que es lo que evita que un objeto con el mismo nombre en otro
-- esquema sea el que se ejecute.
--
-- QUÉ CAMBIA, por grupo:
--  1) search_path = public en las 6 que no lo tenían (get_my_role, handle_new_user,
--     update_updated_at, padron_rubro_norm / asesores_norm / cuits_norm). Ninguna
--     usa nada fuera de public y de las funciones internas de Postgres: hace lo mismo.
--  2) Funciones que sólo ejecutan los TRIGGERS (guardia de profiles, gestiones,
--     prospectos, alta de cuenta, updated_at): sin EXECUTE para nadie salvo el
--     dueño y service_role. Un trigger no chequea EXECUTE al dispararse (sólo al
--     crearlo), así que siguen andando; se verificó disparándolos bajo cada rol.
--  3) Auxiliares internas que sólo llaman otras funciones del servidor
--     (_prop_mi_nombre, es_lider_de): ídem.
--  4) El resto (las que llama la app o usan las reglas de permisos): se les saca
--     `anon` y PUBLIC y quedan para usuarios logueados, como estaban para ellos.
--  5) Las 4 reglas de asesores_guardados estaban abiertas a "public" (incluye
--     anon) y llamaban a is_active(): pasan a `authenticated`. Un visitante sigue
--     viendo 0 filas, sin errores.
--  6) Funciones nuevas: que `anon` no las reciba por defecto (si alguna vez hace
--     falta una pública, se le da el permiso a mano en su migración).
--
-- Lo que sigue apareciendo como aviso INFO/WARN a propósito: las funciones que
-- llama la app con sesión (padron_propuesta_*, gestiones_*, colegas_para_suplente,
-- prueba_cambiar_rol…) y los auxiliares de las reglas de permisos (is_active,
-- get_my_role, gestiones_on, puede_ver_gestion, es_suplente_de) son ejecutables por
-- `authenticated` porque tienen que serlo; todas validan la sesión adentro.
--
-- Idempotente: se puede correr varias veces.

-- 1) search_path fijo
alter function public.update_updated_at()           set search_path = public;
alter function public.handle_new_user()             set search_path = public;
alter function public.get_my_role()                 set search_path = public;
alter function public.padron_rubro_norm(jsonb)      set search_path = public;
alter function public.padron_asesores_norm(jsonb)   set search_path = public;
alter function public.padron_cuits_norm(jsonb)      set search_path = public;

-- 2) sólo las ejecutan los triggers
revoke execute on function public.guard_profile_update()    from public, anon, authenticated;
revoke execute on function public.gestiones_antes()         from public, anon, authenticated;
revoke execute on function public.gestion_prospectos_antes() from public, anon, authenticated;
revoke execute on function public.handle_new_user()         from public, anon, authenticated;
revoke execute on function public.update_updated_at()       from public, anon, authenticated;

-- 3) auxiliares que sólo llaman otras funciones del servidor
revoke execute on function public._prop_mi_nombre()         from public, anon, authenticated;
revoke execute on function public.es_lider_de(uuid)         from public, anon, authenticated;

-- 4) usuarios logueados sí, visitantes no
revoke execute on function public.is_active()               from public, anon;
revoke execute on function public.get_my_role()             from public, anon;
revoke execute on function public.gestiones_on()            from public, anon;
revoke execute on function public.puede_ver_gestion(uuid, uuid, uuid) from public, anon;
revoke execute on function public.es_suplente_de(uuid)      from public, anon;
revoke execute on function public.colegas_para_suplente()   from public, anon;
revoke execute on function public.gestion_marcar_vista(uuid) from public, anon;
revoke execute on function public.gestiones_personas()      from public, anon;
revoke execute on function public.prueba_cambiar_rol(text)  from public, anon;
revoke execute on function public.padron_propuesta_aprobar(uuid, text)   from public, anon;
revoke execute on function public.padron_propuesta_consultar(uuid, text) from public, anon;
revoke execute on function public.padron_propuesta_crear(text, uuid, jsonb, text) from public, anon;
revoke execute on function public.padron_propuesta_rechazar(uuid, text)  from public, anon;
revoke execute on function public.padron_propuesta_responder(uuid, text, jsonb) from public, anon;
revoke execute on function public.asesores_replace(jsonb)   from public, anon;
revoke execute on function public.gestiones_lista(integer, boolean) from public, anon;
revoke execute on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) from public, anon;
revoke execute on function public.padron_replace(jsonb)     from public, anon;
revoke execute on function public.padron_rubro_norm(jsonb)    from public, anon;
revoke execute on function public.padron_asesores_norm(jsonb) from public, anon;
revoke execute on function public.padron_cuits_norm(jsonb)    from public, anon;

grant execute on function public.is_active()               to authenticated;
grant execute on function public.get_my_role()             to authenticated;
grant execute on function public.gestiones_on()            to authenticated;
grant execute on function public.puede_ver_gestion(uuid, uuid, uuid) to authenticated;
grant execute on function public.es_suplente_de(uuid)      to authenticated;
grant execute on function public.colegas_para_suplente()   to authenticated;
grant execute on function public.gestion_marcar_vista(uuid) to authenticated;
grant execute on function public.gestiones_personas()      to authenticated;
grant execute on function public.prueba_cambiar_rol(text)  to authenticated;
grant execute on function public.padron_propuesta_aprobar(uuid, text)   to authenticated;
grant execute on function public.padron_propuesta_consultar(uuid, text) to authenticated;
grant execute on function public.padron_propuesta_crear(text, uuid, jsonb, text) to authenticated;
grant execute on function public.padron_propuesta_rechazar(uuid, text)  to authenticated;
grant execute on function public.padron_propuesta_responder(uuid, text, jsonb) to authenticated;
grant execute on function public.asesores_replace(jsonb)   to authenticated;
grant execute on function public.gestiones_lista(integer, boolean) to authenticated;
grant execute on function public.gestiones_tablero(date, date, text, uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.padron_replace(jsonb)     to authenticated;
grant execute on function public.padron_rubro_norm(jsonb)    to authenticated;
grant execute on function public.padron_asesores_norm(jsonb) to authenticated;
grant execute on function public.padron_cuits_norm(jsonb)    to authenticated;

-- 5) las reglas de asesores_guardados: sólo para usuarios logueados
alter policy "asesores propios: ver"      on public.asesores_guardados to authenticated;
alter policy "asesores propios: crear"    on public.asesores_guardados to authenticated;
alter policy "asesores propios: modificar" on public.asesores_guardados to authenticated;
alter policy "asesores propios: borrar"   on public.asesores_guardados to authenticated;

-- 6) funciones futuras: sin EXECUTE para `anon` por defecto
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ── PARA VOLVER ATRÁS ─────────────────────────────────────────────────────────
-- (el search_path fijo se puede dejar: no cambia ningún resultado)
-- grant execute on all functions in schema public to anon, authenticated;   -- vuelve al estado de antes
-- alter policy "asesores propios: ver"       on public.asesores_guardados to public;
-- alter policy "asesores propios: crear"     on public.asesores_guardados to public;
-- alter policy "asesores propios: modificar" on public.asesores_guardados to public;
-- alter policy "asesores propios: borrar"    on public.asesores_guardados to public;
-- alter default privileges for role postgres in schema public grant execute on functions to anon;
