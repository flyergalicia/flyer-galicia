-- Propuestas de cambio de oficiales, con aprobación del dueño (o su suplente).
--
-- El Hunter sólo busca y descarga: no puede escribir padron_empresas (011). Si
-- ve un oficial mal cargado, PROPONE un cambio —sólo de oficiales, nada de
-- cashback/rubro/CUIT/razón social— y ese cambio queda pendiente hasta que lo
-- apruebe el oficial dueño de la empresa, o la persona que ese oficial haya
-- puesto como suplente (por vacaciones, por ejemplo). Mientras está pendiente,
-- el flyer sigue saliendo con los datos de HOY: nunca se manda a un cliente
-- algo que nadie aprobó.
--
-- Por qué una tabla aparte y no un UPDATE directo del padrón:
--   1) padron_replace (003/007/008/009) reemplaza el padrón ENTERO del dueño en
--      cada guardado: no hay una fila con id estable a la que apuntar desde
--      afuera. La única clave lógica es (dueño, razón social normalizada).
--   2) El Hunter no puede escribir padron_empresas (011_rol_hunter.sql), y así
--      tiene que seguir.
--   3) El suplente tampoco: padron_replace es security invoker y filtra por
--      auth.uid() = el dueño, no por quién lo apruebe.
-- Por eso la propuesta se guarda acá y "aprobar"/"rechazar" son funciones
-- security definer que validan quién llama y tocan UNA sola fila del padrón
-- del dueño (no todo el padrón: no reaparece el problema de la última pestaña
-- que guarda pisando lo que cargó otra).
--
-- Idempotente: se puede correr varias veces.

-- ── 1) El suplente: a quién elige cada oficial para que apruebe en su lugar ──
alter table public.profiles add column if not exists suplente_id uuid references auth.users(id) on delete set null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_suplente_no_uno_mismo'
  ) then
    alter table public.profiles
      add constraint profiles_suplente_no_uno_mismo check (suplente_id is null or suplente_id <> id);
  end if;
end $$;
-- Se edita como cualquier otro dato propio: "profiles: editar propio" (006) ya
-- lo permite, y guard_profile_update (001) sólo frena role/status. Quién puede
-- ser elegido lo filtra el cliente con colegas_para_suplente() (punto 5).

-- ── 2) La tabla ──────────────────────────────────────────────────────────────
create table if not exists public.padron_propuestas (
  id                uuid primary key default gen_random_uuid(),
  empresa_key       text not null,                       -- lower(trim(empresa)): la clave lógica
  empresa           text not null default '',             -- razón social tal como está hoy
  dueno_id          uuid not null references auth.users(id) on delete cascade,
  creada_por        uuid not null references auth.users(id) on delete set null,
  creada_por_nombre text not null default '',             -- snapshot: sobrevive si se borra la cuenta
  asesores_antes    jsonb not null default '[]'::jsonb,   -- foto del servidor al proponer (no la manda el cliente)
  asesores          jsonb not null default '[]'::jsonb,   -- lo propuesto
  nota              text,
  estado            text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  resuelta_por       uuid references auth.users(id) on delete set null,
  resuelta_at        timestamptz,
  motivo            text,
  created_at        timestamptz not null default now()
);

create index if not exists padron_propuestas_dueno_idx on public.padron_propuestas(dueno_id, estado);
create index if not exists padron_propuestas_creada_idx on public.padron_propuestas(creada_por);

-- Una propuesta pendiente por empresa: si ya hay una abierta, la segunda la
-- rechaza la propia función (ver padron_propuesta_crear) con un mensaje claro,
-- en vez de pisarla en silencio.
drop index if exists padron_propuestas_pendiente_unica;
create unique index padron_propuestas_pendiente_unica
  on public.padron_propuestas(dueno_id, empresa_key) where (estado = 'pendiente');

alter table public.padron_propuestas enable row level security;

-- ── 3) Helper: "¿soy el suplente de este dueño?" (security definer, como
--    get_my_role()/is_active(), para no recursar sobre profiles desde la propia
--    policy de profiles ni desde ésta). ──────────────────────────────────────
create or replace function public.es_suplente_de(p_dueno uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
     where p.id = p_dueno and p.suplente_id = auth.uid()
  );
$$;
revoke all on function public.es_suplente_de(uuid) from public;
grant execute on function public.es_suplente_de(uuid) to authenticated;

-- ── 4) RLS: se lee (el que la creó, el dueño, o su suplente). Se ESCRIBE sólo
--    a través de las funciones de abajo: sin insert/update/delete directos. ──
drop policy if exists "propuestas: ver" on public.padron_propuestas;
create policy "propuestas: ver" on public.padron_propuestas
  for select to authenticated
  using (
    public.is_active() and (
      creada_por = auth.uid()
      or dueno_id = auth.uid()
      or public.es_suplente_de(dueno_id)
    )
  );

-- ── 5) Quién puede ser suplente: activos, que no sean hunter, y no uno mismo.
--    security definer porque un no-admin no puede leer profiles de otros. ──
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
   order by 2;
$$;
revoke all on function public.colegas_para_suplente() from public;
grant execute on function public.colegas_para_suplente() to authenticated;

-- ── 6) Crear una propuesta (el Hunter). La foto "antes" la toma el SERVIDOR
--    de la fila real del padrón del dueño, nunca la manda el cliente. ──────
create or replace function public.padron_propuesta_crear(
  p_empresa text, p_dueno uuid, p_asesores jsonb, p_nota text default null
)
returns public.padron_propuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key    text := lower(trim(coalesce(p_empresa, '')));
  v_row    public.padron_empresas;
  v_nombre text;
  v_out    public.padron_propuestas;
begin
  if not public.is_active() then
    raise exception 'Tu cuenta no está activa';
  end if;
  if v_key = '' then
    raise exception 'Falta indicar la empresa';
  end if;

  select pe.* into v_row
    from public.padron_empresas pe
   where pe.user_id = p_dueno and lower(trim(pe.empresa)) = v_key
   limit 1;
  if v_row.id is null then
    raise exception 'Esa empresa ya no está en la base de ese oficial';
  end if;

  if exists (
    select 1 from public.padron_propuestas pp
     where pp.dueno_id = p_dueno and pp.empresa_key = v_key and pp.estado = 'pendiente'
  ) then
    raise exception 'Ya hay una propuesta pendiente para esta empresa';
  end if;

  select coalesce(nullif(trim(full_name), ''), email, '') into v_nombre
    from public.profiles where id = auth.uid();

  insert into public.padron_propuestas
    (empresa_key, empresa, dueno_id, creada_por, creada_por_nombre, asesores_antes, asesores, nota)
  values
    (v_key, v_row.empresa, p_dueno, auth.uid(), coalesce(v_nombre, ''), v_row.asesores, coalesce(p_asesores, '[]'::jsonb), p_nota)
  returning * into v_out;

  return v_out;
end;
$$;
revoke all on function public.padron_propuesta_crear(text, uuid, jsonb, text) from public;
grant execute on function public.padron_propuesta_crear(text, uuid, jsonb, text) to authenticated;

-- ── 7) Aprobar (el dueño o su suplente): UNA fila del padrón del dueño, con
--    registro en padron_log (misma forma que ya sabe pintar el cliente:
--    cambios.asesores = {antes, despues}). ──────────────────────────────────
create or replace function public.padron_propuesta_aprobar(p_id uuid)
returns public.padron_propuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p       public.padron_propuestas;
  v_row     public.padron_empresas;
  v_usuario text;
  v_total   integer;
begin
  if not public.is_active() then
    raise exception 'Tu cuenta no está activa';
  end if;

  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then
    raise exception 'Esa propuesta no existe';
  end if;
  if v_p.estado <> 'pendiente' then
    raise exception 'Esa propuesta ya se resolvió';
  end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés aprobar esta propuesta';
  end if;

  select pe.* into v_row
    from public.padron_empresas pe
   where pe.user_id = v_p.dueno_id and lower(trim(pe.empresa)) = v_p.empresa_key
   limit 1;

  -- La empresa pudo haberse borrado entre que se propuso y se revisó: no hay
  -- nada para actualizar. Se cierra como rechazada, con el motivo.
  if v_row.id is null then
    update public.padron_propuestas
       set estado = 'rechazada', resuelta_por = auth.uid(), resuelta_at = now(),
           motivo = 'La empresa ya no está en la base'
     where id = p_id
     returning * into v_p;
    return v_p;
  end if;

  update public.padron_empresas set asesores = v_p.asesores where id = v_row.id;

  select coalesce(nullif(trim(full_name), ''), email, '') into v_usuario
    from public.profiles where id = v_p.dueno_id;
  select count(*) into v_total from public.padron_empresas where user_id = v_p.dueno_id;

  insert into public.padron_log (user_id, usuario, accion, empresa, cambios, total)
  values (
    v_p.dueno_id, coalesce(v_usuario, ''), 'modificacion', v_row.empresa,
    jsonb_build_object('asesores', jsonb_build_object('antes', v_p.asesores_antes, 'despues', v_p.asesores)),
    v_total
  );

  update public.padron_propuestas
     set estado = 'aprobada', resuelta_por = auth.uid(), resuelta_at = now()
   where id = p_id
   returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_aprobar(uuid) from public;
grant execute on function public.padron_propuesta_aprobar(uuid) to authenticated;

-- ── 8) Rechazar (el dueño o su suplente), con motivo opcional ───────────────
create or replace function public.padron_propuesta_rechazar(p_id uuid, p_motivo text default null)
returns public.padron_propuestas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.padron_propuestas;
begin
  if not public.is_active() then
    raise exception 'Tu cuenta no está activa';
  end if;

  select * into v_p from public.padron_propuestas where id = p_id for update;
  if v_p.id is null then
    raise exception 'Esa propuesta no existe';
  end if;
  if v_p.estado <> 'pendiente' then
    raise exception 'Esa propuesta ya se resolvió';
  end if;
  if not (v_p.dueno_id = auth.uid() or public.es_suplente_de(v_p.dueno_id)) then
    raise exception 'No podés rechazar esta propuesta';
  end if;

  update public.padron_propuestas
     set estado = 'rechazada', resuelta_por = auth.uid(), resuelta_at = now(), motivo = p_motivo
   where id = p_id
   returning * into v_p;
  return v_p;
end;
$$;
revoke all on function public.padron_propuesta_rechazar(uuid, text) from public;
grant execute on function public.padron_propuesta_rechazar(uuid, text) to authenticated;
