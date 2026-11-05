// How the values the database keeps read on screen. The keys are a contract with the base.

/** Each signup says which one: "caja" is the signup with no package. In the order of the screen. */
export const PACKAGES: Readonly<Record<string, string>> = {
  caja: "Sin paquete (Caja de Ahorro)",
  plus: "Plus",
  gold: "Plus Gold",
  platinum: "Eminent Platinum",
  black: "Eminent Black",
};

export const PACKAGES_SHORT: Readonly<Record<string, string>> = {
  caja: "Sin paquete",
  plus: "Plus",
  gold: "Plus Gold",
  platinum: "Eminent Platinum",
  black: "Eminent Black",
};

export const ACTION_TYPES: Readonly<Record<string, string>> = {
  accion: "Acción",
  feria: "Feria",
  posicion: "Posición comercial",
  datos: "Base de datos",
};

export const MODALITIES: Readonly<Record<string, string>> = {
  presencial: "Presencial",
  virtual: "Virtual",
};

export const FREQUENCIES: Readonly<Record<string, string>> = {
  unica: "Única",
  repite: "Se repite",
};

export const ACTION_STATES: Readonly<Record<string, string>> = {
  planificada: "Planificada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

export const DATA_LIST_STATES: Readonly<Record<string, string>> = {
  planificada: "En curso",
  realizada: "Terminada",
  cancelada: "Cancelada",
};

export const PERSON_STATES: Readonly<Record<string, string>> = {
  a_contactar: "A contactar",
  prospecto: "Prospecto",
  en_gestion: "En gestión",
  alta: "Alta",
  descartado: "Descartado",
};

/** The states in which a next contact is scheduled. */
export const OPEN_PERSON_STATES: ReadonlySet<string> = new Set([
  "a_contactar",
  "prospecto",
  "en_gestion",
]);

export const DISCARD_REASONS: Readonly<Record<string, string>> = {
  ya_galicia: "Ya cobra en Galicia",
  no_interesa: "No le interesa",
  no_contesta: "No contesta",
  no_califica: "No califica",
  otro: "Otro motivo",
};

/** The most a series is created with at once (the database admits up to 52). */
export const MAX_TIMES = 24;
/** People on a data list. */
export const MAX_PEOPLE_ON_LIST = 1000;

export function labelOf(labels: Readonly<Record<string, string>>, key: string | null): string {
  return key === null ? "" : (labels[key] ?? "");
}
