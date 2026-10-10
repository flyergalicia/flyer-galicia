-- Lista de gestiones con sus totales (prospectos y altas) ya contados, para no
-- bajar los prospectos de cada una sólo para mostrar dos números por renglón.
-- security INVOKER: corre con la RLS de quien pregunta (ve sólo lo que puede).
-- Idempotente.
create or replace function public.gestiones_lista(p_limit integer default 300)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(x.j order by x.fecha desc, x.created_at desc), '[]'::jsonb)
    from (
      select g.fecha, g.created_at,
             to_jsonb(g) || jsonb_build_object(
               'n_pros',  (select count(*) from public.gestion_prospectos p where p.gestion_id = g.id),
               'n_altas', (select count(*) from public.gestion_prospectos p where p.gestion_id = g.id and p.estado = 'alta')
             ) as j
        from public.gestiones g
       order by g.fecha desc, g.created_at desc
       limit least(greatest(coalesce(p_limit, 300), 1), 2000)
    ) x;
$$;
revoke all on function public.gestiones_lista(integer) from public;
grant execute on function public.gestiones_lista(integer) to authenticated;
