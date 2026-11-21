// The panel of the administrator has three pillars, each with its sheets (`_AP_GROUPS`). The list
// lives here, apart from the panel, because the search of screens offers each sheet before the code
// of the panel comes down: a sheet that is added here appears there too.
export type Pillar = "admin" | "data" | "config";

export type SheetId =
  | "dashboard"
  | "usuarios"
  | "registros"
  | "uso"
  | "facultades"
  | "auditoria"
  | "varios"
  | "asesores"
  | "padronotros"
  | "padronlog"
  | "subir"
  | "cashback"
  | "legales"
  | "opciones"
  | "vigiladas";

export const PILLARS: readonly (readonly [Pillar, string])[] = [
  ["admin", "Admin"],
  ["data", "Data"],
  ["config", "Config"],
];

export const SHEETS: Readonly<Record<Pillar, readonly (readonly [SheetId, string])[]>> = {
  admin: [
    ["dashboard", "Dashboard"],
    ["usuarios", "Usuarios"],
    ["registros", "Registros"],
    ["uso", "Uso"],
    ["facultades", "Facultades"],
    ["auditoria", "Auditoría"],
  ],
  data: [
    ["varios", "Mis empresas"],
    ["asesores", "Mis asesores"],
    ["padronotros", "Empresas por usuario"],
    ["padronlog", "Cambios en las empresas"],
  ],
  config: [
    ["subir", "Flyer"],
    ["cashback", "Cashback"],
    ["legales", "Legales"],
    ["opciones", "Opciones"],
    ["vigiladas", "Marcas vigiladas"],
  ],
};

/** A sheet that is not there is of the first pillar. */
export function pillarOf(sheet: string): Pillar {
  const found = PILLARS.find(([pillar]) => SHEETS[pillar].some(([id]) => id === sheet));
  return found?.[0] ?? "admin";
}

export function isSheet(value: string): value is SheetId {
  return PILLARS.some(([pillar]) => SHEETS[pillar].some(([id]) => id === value));
}
