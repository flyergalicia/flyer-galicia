/** The names on screen. The keys are data (`profiles.role`): "vip" and "pro" are what they were. */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: "Admin",
  vip: "Payroll",
  pro: "Payroll 2",
  asesor: "Asesor",
  hunter: "Hunter",
  lider: "Líder",
};

export type RoleTone = "blue" | "purple" | "gold" | "teal" | "violet" | "navy";

const ROLE_TONES: Readonly<Record<string, RoleTone>> = {
  admin: "blue",
  vip: "gold",
  pro: "teal",
  asesor: "purple",
  hunter: "violet",
  lider: "navy",
};

/** A profile nobody knows reads as what it was: empty. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** The color of the role of a person: one that is not known looks like an advisor. */
export function roleTone(role: string): RoleTone {
  return ROLE_TONES[role] ?? "purple";
}
