import {
  type Backend,
  type Database,
  isTransientStatus,
  type User,
} from "@/shared/supabase/index.ts";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export const PROFILE_COLUMNS =
  "role,full_name,nombre_asesor,celular_asesor,email_asesor,status,facultades,es_prueba,lider_id,flyer_fav";

export type Profile = Pick<
  ProfileRow,
  | "role"
  | "full_name"
  | "nombre_asesor"
  | "celular_asesor"
  | "email_asesor"
  | "status"
  | "facultades"
  | "es_prueba"
  | "lider_id"
  | "flyer_fav"
>;

export type RejectionReason = "not-enabled" | "unverifiable" | "pending" | "inactive";

export const REJECTION_MESSAGES: Readonly<Record<RejectionReason, string>> = {
  "not-enabled": "Tu cuenta no está habilitada. Contactá al administrador.",
  unverifiable: "No se pudo verificar tu cuenta. Volvé a ingresar.",
  pending: "Tu cuenta está pendiente de aprobación del administrador.",
  inactive: "Cuenta inactiva. Contactá al administrador.",
};

const NO_ROWS = "PGRST116";

/** What went wrong reading the profile, for TanStack Query to tell from having read it. */
export class ProfileReadError extends Error {
  readonly isTransient: boolean;
  readonly code: string | null;

  constructor(message: string, isTransient: boolean, code: string | null) {
    super(message);
    this.isTransient = isTransient;
    this.code = code;
  }
}

export async function readProfile(db: Backend["db"], userId: string): Promise<Profile | null> {
  let answer;
  try {
    answer = await db.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).single();
  } catch (cause) {
    throw new ProfileReadError(String(cause), true, null);
  }
  const { data, error, status } = answer;
  if (error) throw new ProfileReadError(error.message, isTransientStatus(status), error.code);
  return data;
}

/** A pending change of password enters as usual: anyone who knows the mail could ask for one. */
export function rejectionOf(profile: Profile | null): RejectionReason | null {
  if (profile?.status === "active" || profile?.status === "reset_pending") return null;
  return profile?.status === "pending" ? "pending" : "inactive";
}

export function rejectionOfError(error: ProfileReadError): RejectionReason | null {
  if (error.isTransient) return null;
  return error.code === NO_ROWS ? "not-enabled" : "unverifiable";
}

export function displayNameOf(profile: Profile, user: User): string {
  return profile.full_name || profile.email_asesor || user.email || "";
}

/** The columns one entry writes: `email_asesor` only if the profile has none. */
export function entryUpdate(
  profile: Profile,
  user: User,
  now: Date,
): { last_login: string; email_asesor?: string } {
  const needsEmail = !profile.email_asesor && Boolean(user.email) && profile.role !== "admin";
  return {
    last_login: now.toISOString(),
    ...(needsEmail && user.email ? { email_asesor: user.email } : {}),
  };
}
