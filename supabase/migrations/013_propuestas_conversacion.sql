-- Conversación sobre las propuestas de cambio de oficiales (012).
--
-- El oficial dueño (o su suplente) ya no sólo aprueba o rechaza: puede
-- REPREGUNTAR ("¿seguro que el celular es ese?") y dejar un COMENTARIO al
-- aprobar o rechazar. El hunter contesta y, si hace falta, corrige los
-- oficiales que propuso; la propuesta vuelve a quedar pendiente.
--
-- 1) Estado nuevo 'consulta' (esperando respuesta del hunter).
-- 2) Tabla padron_propuesta_mensajes: el hilo. Append-only, se escribe SÓLO
--    por las funciones de abajo (security definer), se lee con la misma regla
--    que la propuesta (el que la creó, el dueño o su suplente).
-- 3) Funciones nuevas: consultar (dueño/suplente) y responder (hunter).
-- 4) aprobar recibe un comentario opcional; rechazar deja su motivo en el hilo.
-- 5) Arreglos:
--    · creada_por era NOT NULL con ON DELETE SET NULL: borrar la cuenta de un
--      hunter fallaba. Pasa a nullable.
--    · aprobar registraba en padron_log como "antes" la foto de cuando se
--      propuso, no lo que había al aprobar: si el dueño editó la empresa en el
--      medio, el registro mentía. Ahora registra lo que había de verdad.
--
-- Idempotente: se puede correr varias veces.

-- ── 1) Estado 'consulta' ──────────────────────────────────────────────────
alter table public.padron_propuestas alter column creada_por drop not null;

do $$
declare
  v_con record;
begin
  -- Mismo cuidado que en 011: la variable del loop NO se llama como el alias
  -- de la tabla, o plpgsql tira "record is not assigned yet".
  for v_con in
    select c.conname
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public' and rel.relname = 'padron_propuestas'
       and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%estado%'
  loop
    execute format('alter table public.padron_propuestas drop constraint %I', v_con.conname);
  end loop;
  alter table public.padron_propuestas
    add constraint padron_propuestas_estado_check
    check (estado in ('pendiente','consulta','aprobada','rechazada'));
end $$;

-- Una sola propuesta ABIERTA por empresa: abierta = pendiente o en consulta.
drop index if exists padron_propuestas_pendiente_unica;
create unique index padron_propuestas_pendiente_unica
  on public.padron_propuestas(dueno_id, empresa_key) where (estado in ('pendiente','consulta'));

-- ── 2) El hilo ────────────────────────────────────────────────────────────
create table if not exists public.padron_propuesta_mensajes (
  id           uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null references public.padron_propuestas(id) on delete cascade,
  autor_id     uuid references auth.users(id) on delete set null,
  autor_nombre text not null default '',
  rol          text not null check (rol in ('hunter','dueno','suplente')),
  tipo         text not null check (tipo in ('nota','consulta','respuesta','aprobacion','rechazo')),
  texto        text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists padron_propuesta_mensajes_idx on public.padron_propuesta_mensajes(propuesta_id, created_at);
alter table public.padron_propuesta_mensajes enable row level security;

-- Se lee si se puede leer la propuesta (el subselect pasa por la RLS de
-- padron_propuestas: creador, dueño o suplente). Sin escritura directa.
drop policy if exists "mensajes: ver" on public.padron_propuesta_mensajes;
create policy "mensajes: ver" on public.padron_propuesta_mensajes
  for select to authenticated
  using (public.is_active() and exists (
    select 1 from public.padron_propuestas p where p.id = propuesta_id
  ));

-- La nota con la que se creó cada propuesta pasa a ser el primer mensaje.
insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto, created_at)
select p.id, p.creada_por, p.creada_por_nombre, 'hunter', 'nota', p.nota, p.created_at
  from public.padron_propuestas p
 where coalesce(trim(p.nota), '') <> ''
   and not exists (select 1 from public.padron_propuesta_mensajes m where m.propuesta_id = p.id and m.tipo = 'nota');

-- Nombre visible de quien llama (snapshot para el hilo).
create or replace function public._prop_mi_nombre()
returns text language sql security definer stable set search_path = public as $$
  select coalesce(nullif(trim(full_name), ''), email, '') from public.profiles where id = auth.uid();
$$;
revoke all on function public._prop_mi_nombre() from public;

-- ── 3a) Crear: igual que en 012, pero "abierta" incluye 'consulta' y la nota
--     queda también como primer mensaje del hilo. ───────────────────────────
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
revoke all on function public.padron_propuesta_crear(text, uuid, jsonb, text) from public;
grant execute on function public.padron_propuesta_crear(text, uuid, jsonb, text) to authenticated;

-- ── 3b) Repreguntar (dueño o suplente): pendiente → consulta ───────────────
create or replace function public.padron_propuesta_consultar(p_id uuid, p_texto text)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_p public.padron_propuestas;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribí la consulta'; end if;
  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then raise exception 'Esa propuesta no existe'; end if;
  if v_p.estado <> 'pendiente' then raise exception 'Esa propuesta no está esperando tu revisión'; end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés consultar sobre esta propuesta';
  end if;

  insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(),
          case when v_p.dueno_id = auth.uid() then 'dueno' else 'suplente' end, 'consulta', trim(p_texto));

  update public.padron_propuestas set estado = 'consulta' where id = p_id returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_consultar(uuid, text) from public;
grant execute on function public.padron_propuesta_consultar(uuid, text) to authenticated;

-- ── 3c) Responder (sólo el que la creó): consulta → pendiente. Si manda
--     oficiales, reemplazan a los propuestos. ──────────────────────────────
create or replace function public.padron_propuesta_responder(p_id uuid, p_texto text, p_asesores jsonb default null)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_p public.padron_propuestas;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  if coalesce(trim(p_texto), '') = '' and p_asesores is null then raise exception 'Escribí una respuesta'; end if;
  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then raise exception 'Esa propuesta no existe'; end if;
  if v_p.creada_por is distinct from auth.uid() then raise exception 'Sólo quien la propuso puede responder'; end if;
  if v_p.estado <> 'consulta' then raise exception 'Esa propuesta no tiene una consulta abierta'; end if;

  insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(), 'hunter', 'respuesta',
          coalesce(nullif(trim(p_texto), ''), 'Corregí los oficiales propuestos.'));

  update public.padron_propuestas
     set estado = 'pendiente', asesores = coalesce(p_asesores, asesores)
   where id = p_id returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_responder(uuid, text, jsonb) from public;
grant execute on function public.padron_propuesta_responder(uuid, text, jsonb) to authenticated;

-- ── 4a) Aprobar con comentario. Se borra la firma vieja (uuid): si no, quedan
--     dos sobrecargas y rpc('padron_propuesta_aprobar',{p_id}) falla por
--     ambigüedad. ─────────────────────────────────────────────────────────
drop function if exists public.padron_propuesta_aprobar(uuid);
create or replace function public.padron_propuesta_aprobar(p_id uuid, p_comentario text default null)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_p       public.padron_propuestas;
  v_row     public.padron_empresas;
  v_usuario text;
  v_total   integer;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then raise exception 'Esa propuesta no existe'; end if;
  if v_p.estado not in ('pendiente','consulta') then raise exception 'Esa propuesta ya se resolvió'; end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés aprobar esta propuesta';
  end if;

  select pe.* into v_row from public.padron_empresas pe
   where pe.user_id = v_p.dueno_id and lower(trim(pe.empresa)) = v_p.empresa_key limit 1;

  if v_row.id is null then
    update public.padron_propuestas
       set estado = 'rechazada', resuelta_por = auth.uid(), resuelta_at = now(),
           motivo = 'La empresa ya no está en la base'
     where id = p_id returning * into v_p;
    return v_p;
  end if;

  update public.padron_empresas set asesores = v_p.asesores where id = v_row.id;

  select coalesce(nullif(trim(full_name), ''), email, '') into v_usuario from public.profiles where id = v_p.dueno_id;
  select count(*) into v_total from public.padron_empresas where user_id = v_p.dueno_id;
  -- "antes" = lo que había AL APROBAR (v_row), no la foto de cuando se propuso.
  insert into public.padron_log (user_id, usuario, accion, empresa, cambios, total)
  values (v_p.dueno_id, coalesce(v_usuario, ''), 'modificacion', v_row.empresa,
          jsonb_build_object('asesores', jsonb_build_object('antes', v_row.asesores, 'despues', v_p.asesores)),
          v_total);

  insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(),
          case when v_p.dueno_id = auth.uid() then 'dueno' else 'suplente' end, 'aprobacion',
          coalesce(nullif(trim(p_comentario), ''), ''));

  update public.padron_propuestas
     set estado = 'aprobada', resuelta_por = auth.uid(), resuelta_at = now()
   where id = p_id returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_aprobar(uuid, text) from public;
grant execute on function public.padron_propuesta_aprobar(uuid, text) to authenticated;

-- ── 4b) Rechazar: el motivo queda también en el hilo ───────────────────────
create or replace function public.padron_propuesta_rechazar(p_id uuid, p_motivo text default null)
returns public.padron_propuestas
language plpgsql security definer set search_path = public
as $$
declare
  v_p public.padron_propuestas;
begin
  if not public.is_active() then raise exception 'Tu cuenta no está activa'; end if;
  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then raise exception 'Esa propuesta no existe'; end if;
  if v_p.estado not in ('pendiente','consulta') then raise exception 'Esa propuesta ya se resolvió'; end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés rechazar esta propuesta';
  end if;

  insert into public.padron_propuesta_mensajes (propuesta_id, autor_id, autor_nombre, rol, tipo, texto)
  values (p_id, auth.uid(), public._prop_mi_nombre(),
          case when v_p.dueno_id = auth.uid() then 'dueno' else 'suplente' end, 'rechazo',
          coalesce(nullif(trim(p_motivo), ''), ''));

  update public.padron_propuestas
     set estado = 'rechazada', resuelta_por = auth.uid(), resuelta_at = now(), motivo = p_motivo
   where id = p_id returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_rechazar(uuid, text) from public;
grant execute on function public.padron_propuesta_rechazar(uuid, text) to authenticated;
