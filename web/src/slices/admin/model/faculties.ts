// Admin → Facultades: a row per permission, the flyers grouped under their tab, and a column per
// profile plus "Vos" (the administrator's own account). It works on a copy until it is saved.
import {
  FLYER_TABS,
  type FlyerOption,
  type FlyerTab,
  optionLabel,
  optionsOfTab,
} from "@/shared/domain/flyer-options.ts";
import { orderTabs } from "@/shared/domain/screen-titles.ts";
import {
  adminAllows,
  MANAGED_ROLES,
  mergePermissions,
  type PermissionMatrix,
  permissionApplies,
} from "@/shared/session/index.ts";

export const ROLE_COLUMNS: readonly (readonly [(typeof MANAGED_ROLES)[number], string])[] = [
  ["asesor", "Asesor"],
  ["vip", "VIP"],
  ["pro", "Pro"],
  ["hunter", "Hunter"],
  ["lider", "Líder"],
];

/** The column of the administrator, by the name the driver and the screen give it. */
export const OWN_COLUMN = "me";

export interface FacultyRow {
  readonly key: string;
  readonly name: string;
  /** The rows of flyers go folded under their tab. */
  readonly tab: FlyerTab | null;
  /** The name of the tab when it is not the main one: it is said on the row. */
  readonly otherTab: string;
}

const BEFORE_FLYERS: readonly (readonly [string, string])[] = [
  ["padron_buscar", "Base de datos: mis empresas"],
  ["pegar_oficial", "Pegar datos del oficial"],
];

const AFTER_FLYERS: readonly (readonly [string, string])[] = [
  ["notas", "Bloc de notas"],
  ["asesores_guardados", "Base de datos: mis asesores"],
  ["promos_buscar", "Buscador de promociones"],
  ["guardar_trabajo", "Guardar historial y borrador"],
  ["oficiales_sede", "Oficiales por sede"],
  ["benchmark", "Benchmark (competencia)"],
  ["estudio", "Estudio (diseños de flyer)"],
  ["tutorial_auto", "Tutorial al primer ingreso"],
  ["proponer_oficiales", "Proponer cambios de oficiales"],
  ["gestiones", "Gestiones comerciales"],
];

const plain = ([key, name]: readonly [string, string]): FacultyRow => ({
  key,
  name,
  tab: null,
  otherTab: "",
});

/** The tabs of the flyer editor in the order of the header, as the administrator left it. */
export function tabsInOrder(order: readonly string[] | null): FlyerTab[] {
  const ids: readonly string[] = FLYER_TABS;
  return orderTabs(ids, order).filter((id): id is FlyerTab => FLYER_TABS.some((tab) => tab === id));
}

export function facultyRows(
  options: readonly FlyerOption[],
  order: readonly string[] | null,
  tabName: (tab: FlyerTab) => string,
): readonly FacultyRow[] {
  const flyers = tabsInOrder(order).flatMap((tab) => {
    const otherTab = tab === "flyer" ? "" : tabName(tab);
    return optionsOfTab(options, tab).map((option) => ({
      key: `opcion_${String(option)}`,
      name: `Ver «${optionLabel(options, option)}» (opción ${String(option)}${otherTab ? `, solapa ${otherTab}` : ""})`,
      tab,
      otherTab,
    }));
  });
  return [...BEFORE_FLYERS.map(plain), ...flyers, ...AFTER_FLYERS.map(plain)];
}

export interface FacultyMatrix {
  readonly roles: PermissionMatrix;
  /** The column "Vos": every key, so that what is saved reads whole. */
  readonly own: Readonly<Record<string, boolean>>;
}

export function facultyMatrix(
  saved: unknown,
  options: readonly FlyerOption[],
  ownPermissions: unknown,
): FacultyMatrix {
  const numbers = options.map(({ n }) => n);
  const roles = mergePermissions(saved, numbers);
  const keys = Object.keys(roles.asesor ?? {});
  return {
    roles,
    own: Object.fromEntries(keys.map((key) => [key, adminAllows(ownPermissions, key)])),
  };
}

/** The automatic tutorial never runs for the administrator: there is nothing to decide. */
export function ownApplies(key: string): boolean {
  return key !== "tutorial_auto";
}

export function roleApplies(role: string, key: string): boolean {
  return permissionApplies(role, key);
}

export function isTicked(matrix: FacultyMatrix, column: string, key: string): boolean {
  if (column === OWN_COLUMN) return Boolean(matrix.own[key]);
  return Boolean(matrix.roles[column]?.[key]);
}

export function tick(
  matrix: FacultyMatrix,
  column: string,
  key: string,
  on: boolean,
): FacultyMatrix {
  if (column === OWN_COLUMN) return { ...matrix, own: { ...matrix.own, [key]: on } };
  return {
    ...matrix,
    roles: { ...matrix.roles, [column]: { ...matrix.roles[column], [key]: on } },
  };
}

/**
 * The administrator cannot leave himself without any flyer: there would be nothing to build.
 * True when unticking that key would do it.
 */
export function leavesNoFlyer(
  matrix: FacultyMatrix,
  key: string,
  options: readonly FlyerOption[],
): boolean {
  if (!key.startsWith("opcion_")) return false;
  return !options.some(
    ({ n }) => `opcion_${String(n)}` !== key && matrix.own[`opcion_${String(n)}`],
  );
}

/** "1/2": how many of the flyers of a tab that column has. */
export function groupCount(
  matrix: FacultyMatrix,
  column: string,
  tab: FlyerTab,
  options: readonly FlyerOption[],
): string {
  const ofTab = optionsOfTab(options, tab);
  const on = ofTab.filter((option) => isTicked(matrix, column, `opcion_${String(option)}`));
  return `${String(on.length)}/${String(ofTab.length)}`;
}
