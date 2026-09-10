-- Arregla el hallazgo crítico de la auditoría del 2026-09-09: request_reset
-- pisaba la contraseña real de cualquier cuenta con solo saber el mail, sin
-- probar que quien pedía el cambio era el dueño de esa casilla.
--
-- ANTES: la Edge Function auth-admin llamaba a
-- admin.auth.admin.updateUserById() en el momento del pedido. La cuenta
-- quedaba en estado reset_pending (bloqueada para entrar a la app), pero la
-- clave real ya había sido reemplazada en Supabase Auth en ese instante.
--
-- AHORA: el pedido de nueva clave se guarda acá, sin tocar Auth todavía.
-- Recién cuando un admin lo aprueba (acción approve_reset de la Edge
-- Function) se aplica la clave de verdad. Rechazar (acción deny_reset) borra
-- el pedido y reactiva la cuenta con la clave que ya tenía.
--
-- Idempotente: se puede correr varias veces.

create table if not exists public.pending_password_resets (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  new_password text not null,
  requested_at timestamptz not null default now()
);

-- Nadie accede a esto por la API pública: sólo la Edge Function (con
-- service_role, que bypassa RLS) la lee o escribe. RLS habilitada sin
-- políticas = deny-all para los roles anon/authenticated.
alter table public.pending_password_resets enable row level security;

-- Marca de tiempo del último pedido de reset, para el rate-limit (no repetir
-- el pedido antes de 15 minutos) sin necesidad de filtrar si el mail existe.
alter table public.profiles add column if not exists last_reset_request_at timestamptz;
