// What each profile can do (the "facultades"), as a pure function of what is known about it. Whether
// a flyer option is on the list of the current tab (_canOpt, _facOpts) belongs to the flyer-editor.

const OPTION_PREFIX = "opcion_";
const DEFAULT_OPTIONS = [1, 2, 3];

/** The profiles the administrator decides on. An administrator is not one of them. */
export const MANAGED_ROLES = ["asesor", "vip", "pro", "hunter", "lider"] as const;

export const PERMISSION_KEYS = [
  "padron_buscar",
  "pegar_oficial",
  "notas",
  "asesores_guardados",
  "promos_buscar",
  "guardar_trabajo",
  "oficiales_sede",
  "benchmark",
  "estudio",
  "tutorial_auto",
  "proponer_oficiales",
  "gestiones",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number] | `${typeof OPTION_PREFIX}${number}`;
export type PermissionMatrix = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

function onlyThese(...keys: readonly string[]): Readonly<Record<string, boolean>> {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

const ROLE_DEFAULTS: PermissionMatrix = {
  asesor: {},
  vip: onlyThese("notas", "asesores_guardados"),
  pro: onlyThese("notas", "asesores_guardados"),
  hunter: {},
  lider: onlyThese("notas", "gestiones"),
};

/** Hunters find a company and download its flyer: only this, plus which flyers they see. */
const HUNTER_ALLOWED: ReadonlySet<string> = new Set([
  "promos_buscar",
  "notas",
  "tutorial_auto",
  "proponer_oficiales",
  "asesores_guardados",
  "gestiones",
]);

/** Leaders only look at the dashboard of their team. */
const LEADER_ALLOWED: ReadonlySet<string> = new Set(["notas", "tutorial_auto", "gestiones"]);

/**
 * An option is a permission of its own, and everybody starts with the first one, except hunters
 * and leaders: nobody gives them a flyer by accident.
 */
export function defaultPermission(role: string, key: string): boolean {
  if (key.startsWith(OPTION_PREFIX)) {
    return role !== "hunter" && role !== "lider" && key === `${OPTION_PREFIX}1`;
  }
  return Boolean(ROLE_DEFAULTS[role]?.[key]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionsNamedIn(saved: Readonly<Record<string, unknown>>): number[] {
  const names = Object.values(saved).flatMap((role) => (isRecord(role) ? Object.keys(role) : []));
  return names
    .filter((name) => name.startsWith(OPTION_PREFIX))
    .map((name) => Number(name.slice(OPTION_PREFIX.length)))
    .filter((option) => Number.isInteger(option));
}

/**
 * What is saved over the defaults, so that a permission added later starts with a sane value even
 * if the file does not have it. `options` are the flyer options that get a row: by default, the
 * first three and any other the file names, because one that is not named has the default.
 */
export function mergePermissions(saved: unknown, options?: readonly number[]): PermissionMatrix {
  const savedRoles = isRecord(saved) ? saved : {};
  const allOptions = options ?? [...DEFAULT_OPTIONS, ...optionsNamedIn(savedRoles)];
  const keys = [...PERMISSION_KEYS, ...allOptions.map((option) => `${OPTION_PREFIX}${option}`)];
  return Object.fromEntries(
    MANAGED_ROLES.map((role) => {
      const savedRole = savedRoles[role];
      const got = isRecord(savedRole) ? savedRole : {};
      return [
        role,
        Object.fromEntries(
          keys.map((key) => [
            key,
            got[key] === undefined ? defaultPermission(role, key) : Boolean(got[key]),
          ]),
        ),
      ];
    }),
  );
}

/** `_facultades.json` keeps the matrix under `roles`. */
export function savedRolesIn(file: unknown): unknown {
  return isRecord(file) ? (file.roles ?? null) : null;
}

export interface PermissionSubject {
  readonly role: string;
  readonly isAdmin: boolean;
  /** Column `profiles.facultades`: what administrators turned off for themselves. */
  readonly ownPermissions: unknown;
  /** The profile an administrator is looking at the app as, in the preview. */
  readonly simulatedRole: string | null;
  /** Null until the file arrives: until then, nobody but an administrator can do anything. */
  readonly matrix: PermissionMatrix | null;
}

/** The simulated one wins, so that the preview is faithful. */
export function effectiveRole({ role, simulatedRole }: PermissionSubject): string {
  return simulatedRole ?? role;
}

export function isHunter(subject: PermissionSubject): boolean {
  return effectiveRole(subject) === "hunter";
}

export function isLeader(subject: PermissionSubject): boolean {
  return effectiveRole(subject) === "lider";
}

/** False during the preview: it has to show what that profile sees. */
export function isAdminNow({ isAdmin, simulatedRole }: PermissionSubject): boolean {
  return isAdmin && !simulatedRole;
}

function adminAllows(ownPermissions: unknown, key: string): boolean {
  if (!isRecord(ownPermissions)) return true;
  const own = ownPermissions[key];
  return own === undefined || own === null ? true : Boolean(own);
}

export function can(subject: PermissionSubject, key: PermissionKey): boolean {
  const { isAdmin, matrix, ownPermissions, role, simulatedRole } = subject;
  if (isHunter(subject) && !key.startsWith(OPTION_PREFIX) && !HUNTER_ALLOWED.has(key)) return false;
  if (isLeader(subject) && !LEADER_ALLOWED.has(key)) return false;
  if (simulatedRole) return Boolean(matrix?.[simulatedRole]?.[key]);
  if (isAdmin) return adminAllows(ownPermissions, key);
  return Boolean(matrix?.[role]?.[key]);
}
