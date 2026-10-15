-- RLS: los chequeos que no dependen de la fila se evalúan UNA vez por consulta.
--
-- POR QUÉ: auth.uid(), is_active(), get_my_role() y gestiones_on() aparecían
-- "sueltos" en las policies, y Postgres los vuelve a calcular en CADA fila (cada
-- is_active()/get_my_role() es además una consulta a profiles). Medido el
-- 2026-10-15 sobre la base real: leer las 633 empresas o los 820 cambios del
-- padrón costaba 20-45 ms de servidor, casi todo en esos chequeos repetidos, y
-- crece con los datos. Envueltos en (select …) Postgres los calcula una sola vez
-- por consulta (InitPlan) y reusa el resultado. Es lo que recomienda Supabase
-- (aviso auth_rls_initplan del asesor de rendimiento).
--
-- QUÉ NO CAMBIA: la lógica. Cada policy se reescribe con ALTER POLICY (mismo
-- nombre, mismo comando, mismos roles) y la misma expresión, sólo con esas
-- llamadas envueltas. Las que dependen de la fila (puede_ver_gestion,
-- es_suplente_de, las subconsultas a profiles por user_id) quedan como estaban.
-- Generado desde pg_policies (la base viva), no a mano. Verificado antes y
-- después con los mismos perfiles (admin, VIP, Pro, Líder, Hunter, Asesor y una
-- cuenta inexistente): mismas filas visibles y mismos permisos de escritura.
--
-- Además: índices para las claves foráneas que el asesor marcó sin índice
-- (unindexed_foreign_keys). Sirven sobre todo al borrar un usuario (sus filas
-- quedan con el id en NULL y hay que encontrarlas) y a los filtros por usuario.
--
-- Idempotente: se puede correr varias veces.

alter policy "flags: admin escribe" on public.app_flags
  using (((select public.is_active()) AND ((select public.get_my_role()) = 'admin'::text)))
  with check (((select public.is_active()) AND ((select public.get_my_role()) = 'admin'::text) AND ((clave <> 'gestiones'::text) OR (valor = ANY (ARRAY['off'::text, 'prueba'::text, 'on'::text])))));

alter policy "flags: leer" on public.app_flags
  using ((select public.is_active()));

alter policy "asesores propios: borrar" on public.asesores_guardados
  using ((((select auth.uid()) = user_id) AND (select public.is_active())));

alter policy "asesores propios: crear" on public.asesores_guardados
  with check ((((select auth.uid()) = user_id) AND (select public.is_active())));

alter policy "asesores propios: modificar" on public.asesores_guardados
  using ((((select auth.uid()) = user_id) AND (select public.is_active())))
  with check ((((select auth.uid()) = user_id) AND (select public.is_active())));

alter policy "asesores propios: ver" on public.asesores_guardados
  using ((((select auth.uid()) = user_id) AND (select public.is_active())));

alter policy "flyer_logs: admin activo lee" on public.flyer_logs
  using ((((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())));

alter policy "flyer_logs: insertar propio" on public.flyer_logs
  with check (((user_id = (select auth.uid())) AND (select public.is_active())));

alter policy "flyer_versions: solo admin activo" on public.flyer_versions
  using ((((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())))
  with check ((((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())));

alter policy "prospectos: escribir" on public.gestion_prospectos
  using (((select public.is_active()) AND (select public.gestiones_on()) AND (EXISTS ( SELECT 1
   FROM gestiones g
  WHERE ((g.id = gestion_prospectos.gestion_id) AND ((g.hunter_id = (select auth.uid())) OR (g.creada_por = (select auth.uid())) OR ((select public.get_my_role()) = 'admin'::text)))))))
  with check (((select public.is_active()) AND (select public.gestiones_on()) AND (EXISTS ( SELECT 1
   FROM gestiones g
  WHERE ((g.id = gestion_prospectos.gestion_id) AND ((g.hunter_id = (select auth.uid())) OR (g.creada_por = (select auth.uid())) OR ((select public.get_my_role()) = 'admin'::text)))))));

alter policy "gestiones: borrar" on public.gestiones
  using (((select public.is_active()) AND (select public.gestiones_on()) AND ((creada_por = (select auth.uid())) OR ((select public.get_my_role()) = 'admin'::text))));

alter policy "gestiones: crear" on public.gestiones
  with check (((select public.is_active()) AND (select public.gestiones_on()) AND ((origen = 'propia'::text) OR (origen = 'derivada'::text))));

alter policy "gestiones: editar" on public.gestiones
  using (((select public.is_active()) AND (select public.gestiones_on()) AND ((hunter_id = (select auth.uid())) OR (creada_por = (select auth.uid())) OR ((select public.get_my_role()) = 'admin'::text))))
  with check (((select public.is_active()) AND (select public.gestiones_on()) AND ((hunter_id = (select auth.uid())) OR (creada_por = (select auth.uid())) OR ((select public.get_my_role()) = 'admin'::text))));

alter policy "gestiones: ver" on public.gestiones
  using (((select public.is_active()) AND (select public.gestiones_on()) AND puede_ver_gestion(hunter_id, dueno_id, creada_por)));

alter policy "admin lee padron de no-admins" on public.padron_empresas
  using (((select public.is_active()) AND ((select public.get_my_role()) = 'admin'::text) AND (COALESCE(( SELECT pr.role
   FROM profiles pr
  WHERE (pr.id = padron_empresas.user_id)), ''::text) <> 'admin'::text)));

alter policy "hunter lee todas las empresas" on public.padron_empresas
  using (((select public.is_active()) AND ((select public.get_my_role()) = 'hunter'::text)));

alter policy "padron propio: borrar" on public.padron_empresas
  using ((((select auth.uid()) = user_id) AND (select public.is_active()) AND (COALESCE((select public.get_my_role()), ''::text) <> 'hunter'::text)));

alter policy "padron propio: crear" on public.padron_empresas
  with check ((((select auth.uid()) = user_id) AND (select public.is_active()) AND (COALESCE((select public.get_my_role()), ''::text) <> 'hunter'::text)));

alter policy "padron propio: modificar" on public.padron_empresas
  using ((((select auth.uid()) = user_id) AND (select public.is_active()) AND (COALESCE((select public.get_my_role()), ''::text) <> 'hunter'::text)))
  with check ((((select auth.uid()) = user_id) AND (select public.is_active()) AND (COALESCE((select public.get_my_role()), ''::text) <> 'hunter'::text)));

alter policy "padron propio: ver" on public.padron_empresas
  using ((((select auth.uid()) = user_id) AND (select public.is_active())));

alter policy "padron_log: admin lee de no-admins" on public.padron_log
  using (((select public.is_active()) AND ((select public.get_my_role()) = 'admin'::text) AND (COALESCE(( SELECT pr.role
   FROM profiles pr
  WHERE (pr.id = padron_log.user_id)), ''::text) <> 'admin'::text)));

alter policy "padron_log: insertar propio" on public.padron_log
  with check (((user_id = (select auth.uid())) AND (select public.is_active())));

alter policy "padron_log: ver propio" on public.padron_log
  using (((user_id = (select auth.uid())) AND (select public.is_active())));

alter policy "mensajes: ver" on public.padron_propuesta_mensajes
  using (((select public.is_active()) AND (EXISTS ( SELECT 1
   FROM padron_propuestas p
  WHERE (p.id = padron_propuesta_mensajes.propuesta_id)))));

alter policy "propuestas: ver" on public.padron_propuestas
  using (((select public.is_active()) AND ((creada_por = (select auth.uid())) OR (dueno_id = (select auth.uid())) OR es_suplente_de(dueno_id))));

alter policy "profiles: admin activo edita" on public.profiles
  using ((((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())))
  with check ((((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())));

alter policy "profiles: admin activo ve todos" on public.profiles
  using ((((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())));

alter policy "profiles: editar propio" on public.profiles
  using (((id = (select auth.uid())) AND (select public.is_active())))
  with check ((id = (select auth.uid())));

alter policy "profiles: ver propio" on public.profiles
  using ((id = (select auth.uid())));

alter policy "promos: leer" on public.promos_galicia_cache
  using ((select public.is_active()));

alter policy "promos meta: leer" on public.promos_galicia_meta
  using ((select public.is_active()));

alter policy "flyers_admin_delete" on storage.objects
  using (((bucket_id = 'flyers'::text) AND ((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())));

alter policy "flyers_admin_insert" on storage.objects
  with check (((bucket_id = 'flyers'::text) AND ((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())));

alter policy "flyers_admin_update" on storage.objects
  using (((bucket_id = 'flyers'::text) AND ((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())))
  with check (((bucket_id = 'flyers'::text) AND ((select public.get_my_role()) = 'admin'::text) AND (select public.is_active())));

alter policy "flyers_select_auth" on storage.objects
  using (((bucket_id = 'flyers'::text) AND (select public.is_active())));

create index if not exists flyer_logs_user_idx              on public.flyer_logs(user_id);
create index if not exists flyer_versions_uploaded_by_idx   on public.flyer_versions(uploaded_by);
create index if not exists gestion_prospectos_creado_idx    on public.gestion_prospectos(creado_por);
create index if not exists padron_prop_mensajes_autor_idx   on public.padron_propuesta_mensajes(autor_id);
create index if not exists padron_propuestas_resuelta_idx   on public.padron_propuestas(resuelta_por);
create index if not exists profiles_suplente_idx            on public.profiles(suplente_id);

-- ── PARA VOLVER ATRÁS ─────────────────────────────────────────────────────────
-- Las mismas policies con las expresiones de antes (copiadas de pg_policies el
-- 2026-10-15). Los índices se pueden dejar: no cambian ningún resultado.
-- alter policy "flags: admin escribe" on public.app_flags using ((is_active() AND (get_my_role() = 'admin'::text))) with check ((is_active() AND (get_my_role() = 'admin'::text) AND ((clave <> 'gestiones'::text) OR (valor = ANY (ARRAY['off'::text, 'prueba'::text, 'on'::text])))));
-- alter policy "flags: leer" on public.app_flags using (is_active());
-- alter policy "asesores propios: borrar" on public.asesores_guardados using (((auth.uid() = user_id) AND is_active()));
-- alter policy "asesores propios: crear" on public.asesores_guardados with check (((auth.uid() = user_id) AND is_active()));
-- alter policy "asesores propios: modificar" on public.asesores_guardados using (((auth.uid() = user_id) AND is_active())) with check (((auth.uid() = user_id) AND is_active()));
-- alter policy "asesores propios: ver" on public.asesores_guardados using (((auth.uid() = user_id) AND is_active()));
-- alter policy "flyer_logs: admin activo lee" on public.flyer_logs using (((get_my_role() = 'admin'::text) AND is_active()));
-- alter policy "flyer_logs: insertar propio" on public.flyer_logs with check (((user_id = auth.uid()) AND is_active()));
-- alter policy "flyer_versions: solo admin activo" on public.flyer_versions using (((get_my_role() = 'admin'::text) AND is_active())) with check (((get_my_role() = 'admin'::text) AND is_active()));
-- alter policy "prospectos: escribir" on public.gestion_prospectos using ((is_active() AND gestiones_on() AND (EXISTS ( SELECT 1 FROM gestiones g WHERE ((g.id = gestion_prospectos.gestion_id) AND ((g.hunter_id = auth.uid()) OR (g.creada_por = auth.uid()) OR (get_my_role() = 'admin'::text))))))) with check ((is_active() AND gestiones_on() AND (EXISTS ( SELECT 1 FROM gestiones g WHERE ((g.id = gestion_prospectos.gestion_id) AND ((g.hunter_id = auth.uid()) OR (g.creada_por = auth.uid()) OR (get_my_role() = 'admin'::text)))))));
-- alter policy "gestiones: borrar" on public.gestiones using ((is_active() AND gestiones_on() AND ((creada_por = auth.uid()) OR (get_my_role() = 'admin'::text))));
-- alter policy "gestiones: crear" on public.gestiones with check ((is_active() AND gestiones_on() AND ((origen = 'propia'::text) OR (origen = 'derivada'::text))));
-- alter policy "gestiones: editar" on public.gestiones using ((is_active() AND gestiones_on() AND ((hunter_id = auth.uid()) OR (creada_por = auth.uid()) OR (get_my_role() = 'admin'::text)))) with check ((is_active() AND gestiones_on() AND ((hunter_id = auth.uid()) OR (creada_por = auth.uid()) OR (get_my_role() = 'admin'::text))));
-- alter policy "gestiones: ver" on public.gestiones using ((is_active() AND gestiones_on() AND puede_ver_gestion(hunter_id, dueno_id, creada_por)));
-- alter policy "admin lee padron de no-admins" on public.padron_empresas using ((is_active() AND (get_my_role() = 'admin'::text) AND (COALESCE(( SELECT pr.role FROM profiles pr WHERE (pr.id = padron_empresas.user_id)), ''::text) <> 'admin'::text)));
-- alter policy "hunter lee todas las empresas" on public.padron_empresas using ((is_active() AND (get_my_role() = 'hunter'::text)));
-- alter policy "padron propio: borrar" on public.padron_empresas using (((auth.uid() = user_id) AND is_active() AND (COALESCE(get_my_role(), ''::text) <> 'hunter'::text)));
-- alter policy "padron propio: crear" on public.padron_empresas with check (((auth.uid() = user_id) AND is_active() AND (COALESCE(get_my_role(), ''::text) <> 'hunter'::text)));
-- alter policy "padron propio: modificar" on public.padron_empresas using (((auth.uid() = user_id) AND is_active() AND (COALESCE(get_my_role(), ''::text) <> 'hunter'::text))) with check (((auth.uid() = user_id) AND is_active() AND (COALESCE(get_my_role(), ''::text) <> 'hunter'::text)));
-- alter policy "padron propio: ver" on public.padron_empresas using (((auth.uid() = user_id) AND is_active()));
-- alter policy "padron_log: admin lee de no-admins" on public.padron_log using ((is_active() AND (get_my_role() = 'admin'::text) AND (COALESCE(( SELECT pr.role FROM profiles pr WHERE (pr.id = padron_log.user_id)), ''::text) <> 'admin'::text)));
-- alter policy "padron_log: insertar propio" on public.padron_log with check (((user_id = auth.uid()) AND is_active()));
-- alter policy "padron_log: ver propio" on public.padron_log using (((user_id = auth.uid()) AND is_active()));
-- alter policy "mensajes: ver" on public.padron_propuesta_mensajes using ((is_active() AND (EXISTS ( SELECT 1 FROM padron_propuestas p WHERE (p.id = padron_propuesta_mensajes.propuesta_id)))));
-- alter policy "propuestas: ver" on public.padron_propuestas using ((is_active() AND ((creada_por = auth.uid()) OR (dueno_id = auth.uid()) OR es_suplente_de(dueno_id))));
-- alter policy "profiles: admin activo edita" on public.profiles using (((get_my_role() = 'admin'::text) AND is_active())) with check (((get_my_role() = 'admin'::text) AND is_active()));
-- alter policy "profiles: admin activo ve todos" on public.profiles using (((get_my_role() = 'admin'::text) AND is_active()));
-- alter policy "profiles: editar propio" on public.profiles using (((id = auth.uid()) AND is_active())) with check ((id = auth.uid()));
-- alter policy "profiles: ver propio" on public.profiles using ((id = auth.uid()));
-- alter policy "promos: leer" on public.promos_galicia_cache using (is_active());
-- alter policy "promos meta: leer" on public.promos_galicia_meta using (is_active());
-- alter policy "flyers_admin_delete" on storage.objects using (((bucket_id = 'flyers'::text) AND (get_my_role() = 'admin'::text) AND is_active()));
-- alter policy "flyers_admin_insert" on storage.objects with check (((bucket_id = 'flyers'::text) AND (get_my_role() = 'admin'::text) AND is_active()));
-- alter policy "flyers_admin_update" on storage.objects using (((bucket_id = 'flyers'::text) AND (get_my_role() = 'admin'::text) AND is_active())) with check (((bucket_id = 'flyers'::text) AND (get_my_role() = 'admin'::text) AND is_active()));
-- alter policy "flyers_select_auth" on storage.objects using (((bucket_id = 'flyers'::text) AND is_active()));
