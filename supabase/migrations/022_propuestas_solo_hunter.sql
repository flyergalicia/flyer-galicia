-- Dos controles que faltaban DENTRO de las funciones (la pantalla los esconde, pero
-- una función expuesta a "authenticated" se puede llamar sin pasar por la pantalla):
--
--   1) padron_propuesta_crear: sólo un Hunter (o un admin, que puede ver la app
--      "como Hunter") puede proponer cambios de oficiales. Antes alcanzaba con
--      tener la cuenta activa: cualquier asesor podía mandarle propuestas a otro.
--   2) colegas_para_suplente: devolvía nombres de todos los activos sin comprobar
--      que quien pregunta esté activo.
--
-- Cuerpo de padron_propuesta_crear = el de 013_propuestas_conversacion.sql, más el
-- control de rol. Idempotente.

create or replace function public.padron_propuesta_crear(
  p_empresa text, p_dueno uuid, p_asesores jsonb, p_nota text default null
)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_empresa, '')));
  v_row public.padron_empresas;
  v_out public.padron_propuestas;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if coalesce(public.get_my_role(), '') not in ('hunter', 'admin') then
    raise exception 'Sólo un Hunter puede proponer cambios de oficiales';
  end if;
  if v_key = '' then raise exception 'Falta indicar la empresa'; end if;

  select pe.* into v_row from public.padron_empresas pe
   where pe.user_id = p_dueno and lower(trim(pe.empresa)) = v_key limit 1;
  if v_row.id is null then raise exception 'Esa empresa ya no está en la base de ese oficial'; end if;

  if exists (select 1 from public.padron_propuestas pp
              where pp.dueno_id = p_dueno and pp.empresa_key = v_key and pp.estado in ('pendiente','consulta')) then
    raise exception 'Ya hay una propuesta abierta para esta empresa';
  end if;

  insert into public.padron_propuestas
    (empresa_key, empresa, dueno_id, creada_por, creada_por_nombre, asesores_antes, asesores, nota)
  values
    (v_key, v_row.empresa, p_dueno, auth.uid(), public._prop_mi_nombre(), v_row.asesores, coalesce(p_asesores, '[]'::jsonb), p_nota)
  returning * into v_out;

  if coalesce(trim(p_nota), '') <> '' then
    insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
    values (v_out.id, auth.uid(), v_out.creada_por_nombre, 'hunter', 'nota', trim(p_nota));
  end if;
  return v_out;
end;
$$;

revoke all on function public.padron_propuesta_crear(text, uuid, jsonb, text) from public, anon;
grant execute on function public.padron_propuesta_crear(text, uuid, jsonb, text) to authenticated;

create or replace function public.colegas_para_suplente()
returns table(id uuid, nombre text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email, 'Sin nombre') as nombre
    from public.profiles p
   where p.status = 'active'
     and p.role <> 'hunter'
     and p.id <> auth.uid()
     and public.is_active()
   order by 2;
$$;
revoke all on function public.colegas_para_suplente() from public, anon;
grant execute on function public.colegas_para_suplente() to authenticated;
