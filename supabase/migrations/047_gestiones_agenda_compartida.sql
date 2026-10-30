-- 047: la agenda de los hunters se ve de a una semana, y arreglo de un permiso.
--  1) es_lider_de quedó sin permiso para las cuentas con sesión en la 019 (ahí
--     sólo la llamaban funciones "security definer", donde no hace falta). La 045
--     es la primera que la pone DENTRO de una policy ("gestiones: editar"), y las
--     policies se evalúan con los permisos de quien consulta: sin este permiso,
--     un líder que edita algo de su equipo se come un "permission denied".
--     Hoy no se nota porque no hay ningún líder activo. Es seguro darlo: igual
--     que get_my_role o puede_ver_gestion, sólo responde sobre quien llama.
--  2) gestiones_ocupacion: los horarios ocupados de los hunters en un rango de
--     fechas, con la empresa TAPADA cuando la acción no es de quien pregunta.
--     Es lo mismo que ya contestan gestiones_dia (un día, sin empresa) y
--     gestiones_ocupado (un hunter, un día, con la empresa tapada), pero de a una
--     semana, para que el oficial vea en la grilla dónde tiene lugar cada hunter
--     sin enterarse de qué hace con los demás (criterio de la 030).
-- Idempotente.

grant execute on function public.es_lider_de(uuid) to authenticated;

-- Horarios ocupados de los hunters entre dos fechas. La empresa sólo sale si
-- quien pregunta puede ver esa gestión; si no, viene null y la pantalla muestra
-- "Ocupado". Mismos frenos de rol que gestiones_dia (046): no le contesta a un
-- hunter, y al líder sólo le da los de su equipo.
create or replace function public.gestiones_ocupacion(p_desde date, p_hasta date)
returns table(id uuid, hunter_id uuid, fecha date, hora_desde time, hora_hasta time, tipo text, empresa text)
language sql
security definer
stable
set search_path = public
as $$
  select g.id, g.hunter_id, g.fecha, g.hora_desde, g.hora_hasta, g.tipo,
         case when public.puede_ver_gestion(g.hunter_id, g.dueno_id, g.creada_por) or g.lider_id = auth.uid() then g.empresa end
    from public.gestiones g
   where public.is_active() and public.gestiones_on()
     and coalesce(public.get_my_role(), '') <> 'hunter'
     and (public.get_my_role() is distinct from 'lider' or public.es_lider_de(g.hunter_id))
     and p_desde is not null and p_hasta is not null
     and p_hasta >= p_desde and p_hasta - p_desde <= 45
     and g.fecha between p_desde and p_hasta
     and g.estado <> 'cancelada' and g.hunter_id is not null
     and g.hora_desde is not null and g.tipo <> 'datos'
   order by g.fecha, g.hora_desde;
$$;
revoke all on function public.gestiones_ocupacion(date, date) from public, anon;
grant execute on function public.gestiones_ocupacion(date, date) to authenticated;
