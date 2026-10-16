-- Dos defensas de la Edge Function auth-admin:
--
--   1) LÍMITE POR IP en las acciones públicas (register, request_reset). Sin esto,
--      alguien sin cuenta podía disparar altas y mails de aviso sin tope. El límite
--      por cuenta del reset (1 cada 15 min) no frena a quien prueba muchos mails.
--   2) AUDITORÍA: quién (admin) hizo qué sobre qué cuenta. Antes un admin podía
--      cambiar una clave o borrar un usuario sin dejar rastro.
--
-- Las dos tablas son de uso EXCLUSIVO de la Edge Function (service_role). Los
-- navegadores no las tocan, salvo el admin que puede LEER la auditoría.
-- Idempotente.

-- ── 1) Límite por IP ────────────────────────────────────────────────────────
create table if not exists public.auth_rate_limit (
  clave   text primary key,          -- "<acción>|<ip>|<inicio de ventana en epoch>"
  n       integer not null default 0,
  ventana timestamptz not null
);
alter table public.auth_rate_limit enable row level security;   -- sin policies = nadie
revoke all on public.auth_rate_limit from anon, authenticated;

-- Cuenta un intento y dice si todavía entra en el tope (true = adelante).
-- Ventana fija: p_segundos de ancho. Atómica (un solo INSERT ... ON CONFLICT).
create or replace function public.rate_limit_hit(p_clave text, p_max integer, p_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ini timestamptz;
  v_n   integer;
begin
  if coalesce(p_segundos, 0) < 1 or coalesce(p_max, 0) < 1 then return true; end if;
  v_ini := to_timestamp(floor(extract(epoch from now()) / p_segundos) * p_segundos);
  insert into public.auth_rate_limit as r (clave, n, ventana)
  values (p_clave || '|' || extract(epoch from v_ini)::bigint, 1, v_ini)
  on conflict (clave) do update set n = r.n + 1
  returning r.n into v_n;
  -- Limpieza de ventanas viejas, de vez en cuando (no hace falta un cron).
  if random() < 0.02 then
    delete from public.auth_rate_limit where ventana < now() - interval '2 days';
  end if;
  return v_n <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ── 2) Auditoría ────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  actor_id       uuid,          -- quién lo hizo (null = visitante sin sesión)
  actor_email    text,
  accion         text not null,
  objetivo_id    uuid,          -- sobre quién (sin FK: sobrevive al borrado del usuario)
  objetivo_email text,
  detalle        jsonb          -- datos útiles (rol, estado, ip...). NUNCA claves.
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc, id desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

drop policy if exists "audit_log: admin lee" on public.audit_log;
create policy "audit_log: admin lee" on public.audit_log
  for select to authenticated
  using ((select public.get_my_role()) = 'admin' and (select public.is_active()));
-- Sin policies de INSERT/UPDATE/DELETE: sólo la Edge Function (service_role,
-- que se salta RLS) escribe, y nadie puede alterar ni borrar un registro.

-- ── PARA VOLVER ATRÁS ───────────────────────────────────────────────────────
-- drop function public.rate_limit_hit(text, integer, integer);
-- drop table public.auth_rate_limit;  drop table public.audit_log;
