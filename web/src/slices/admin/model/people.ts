// How a person is drawn in the lists of the panel: their initials over a color of their own.
const AVATAR_COLORS = [
  "#c62828",
  "#1565c0",
  "#2e7d32",
  "#6a1b9a",
  "#e65100",
  "#00695c",
  "#4527a0",
  "#283593",
] as const;
const HASH_SIZE = 65_536;
const HASH_FACTOR = 31;

/** Always the same color for the same text: `_avatarColor`, unit by unit as it counts them. */
export function avatarColor(text: string): string {
  let hash = 0;
  for (let at = 0; at < text.length; at += 1) {
    hash = (hash * HASH_FACTOR + text.charCodeAt(at)) % HASH_SIZE;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/** Who wrote each log, by id: a person deleted since reads as "Usuario". */
export type PeopleNames = ReadonlyMap<string, string>;

export function peopleNames(
  rows: readonly {
    readonly id: string;
    readonly full_name: string | null;
    readonly email_asesor: string | null;
  }[],
): PeopleNames {
  return new Map(rows.map((row) => [row.id, row.full_name || row.email_asesor || "Usuario"]));
}
