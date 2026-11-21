// What is checked before bothering the server, and what its refusals mean, in Spanish.
import type { AuthFailure } from "@/shared/supabase/index.ts";

const BANK_MAIL = /^[^@\s]+@bancogalicia\.com\.ar$/i;
const MIN_PASSWORD = 8;

export const NO_CONNECTION = "No se pudo conectar. Revisá tu conexión y probá de nuevo.";

export function loginProblem(email: string, password: string): string | null {
  return email && password ? null : "Completá el mail y la contraseña.";
}

export function forgotProblem(email: string, password: string, repeat: string): string | null {
  if (!email) return "Ingresá tu email.";
  if (password.length < MIN_PASSWORD) return "La contraseña debe tener al menos 8 caracteres.";
  return password === repeat ? null : "Las contraseñas no coinciden.";
}

export function registerProblem(name: string, email: string, password: string): string | null {
  if (!name || !email || !password) return "Completá todos los campos.";
  // The function of the server asks for it again: this is to say so before sending anything.
  if (!BANK_MAIL.test(email)) return "Sólo se aceptan mails @bancogalicia.com.ar.";
  return password.length < MIN_PASSWORD ? "La contraseña debe tener al menos 8 caracteres." : null;
}

export function passwordChangeProblem(
  current: string,
  password: string,
  repeat: string,
): string | null {
  if (!current) return "Ingresá tu contraseña actual.";
  if (password.length < MIN_PASSWORD)
    return "La nueva contraseña debe tener al menos 8 caracteres.";
  if (password !== repeat) return "Las contraseñas nuevas no coinciden.";
  return password === current ? "La nueva contraseña debe ser distinta de la actual." : null;
}

/** Supabase answers in English. What is not recognized goes with a general text. */
export function loginFailureMessage({ message, status }: Pick<AuthFailure, "message" | "status">) {
  if (/invalid login credentials|invalid_grant|invalid email or password/i.test(message)) {
    return "Mail o contraseña incorrectos.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Tu cuenta todavía no está confirmada. Avisale al administrador.";
  }
  if (status === 429 || /rate limit|too many|security purposes/i.test(message)) {
    return "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
  }
  if (/banned|disabled/i.test(message)) {
    return "Tu cuenta está deshabilitada. Contactá al administrador.";
  }
  if (!status || /fetch|network/i.test(message)) return NO_CONNECTION;
  return "No se pudo ingresar. Probá de nuevo en un momento.";
}
