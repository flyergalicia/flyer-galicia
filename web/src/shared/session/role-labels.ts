export const ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: "Admin",
  vip: "VIP",
  pro: "Pro",
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
