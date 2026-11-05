// The list of actions: what it filters by, what goes first and what each row says.
import { digitsOf, normalizeName } from "@/shared/domain/company-registry/index.ts";
import type { ListedAction, UnreadMessages } from "../api/rows.ts";
import { dateLabel, timeRange } from "./formatting.ts";
import { ACTION_TYPES, ACTION_STATES, labelOf, MODALITIES } from "./labels.ts";
import { taxIdList } from "./tax-ids.ts";
import { huntersOf, nameOf, type Who } from "./who.ts";

/** How many rows it paints. */
export const MAX_ROWS = 300;
/** What the hunter filter says for what is nobody's yet. */
export const NO_HUNTER = "__sin";
const MIN_TAX_ID_SEARCH = 4;

export interface ListFilters {
  readonly search: string;
  readonly state: string;
  readonly hunter: string;
  readonly type: string;
  readonly from: string;
  readonly until: string;
}

export const NO_FILTERS: ListFilters = {
  search: "",
  state: "",
  hunter: "",
  type: "",
  from: "",
  until: "",
};

export function hasFilters(filters: ListFilters): boolean {
  return Object.values(filters).some(Boolean);
}

export type UnreadByAction = ReadonlyMap<string, UnreadMessages>;

export function isNewForHunter({ me }: Who, action: ListedAction): boolean {
  return action.hunter_id === me && !action.visto_hunter;
}

export function isNewForOwner({ me }: Who, action: ListedAction): boolean {
  return action.dueno_id === me && !action.visto_dueno;
}

export function isNew(who: Who, action: ListedAction): boolean {
  return isNewForHunter(who, action) || isNewForOwner(who, action);
}

/** What asks for attention goes first: novelties and messages not read. */
export function asksForAttention(who: Who, action: ListedAction, unread: UnreadByAction): boolean {
  return isNew(who, action) || unread.has(action.id);
}

function matchesHunter({ hunter_id: id }: ListedAction, hunter: string): boolean {
  if (hunter === NO_HUNTER) return !id;
  return !hunter || id === hunter;
}

/** By date: a data list is taken by the span it covers. */
function matchesDates({ tipo, vence, fecha }: ListedAction, { from, until }: ListFilters): boolean {
  const end = tipo === "datos" && vence ? vence : fecha;
  if (from && !(end >= from)) return false;
  return !until || fecha <= until;
}

function matchesState(
  { estado, hunter_id: hunter, no_puede_at: cannot, tipo }: ListedAction,
  state: string,
) {
  if (state === "por_asignar") return !hunter && estado === "planificada";
  if (state === "no_puede") return Boolean(cannot) && estado === "planificada";
  if (state === "datos") return tipo === "datos";
  return !state || estado === state;
}

function matchesText(who: Who, action: ListedAction, search: string): boolean {
  const text = normalizeName(search);
  if (!text) return true;
  const { empresa, hunter_id: hunter, dueno_id: owner, cuit } = action;
  const names = [empresa, nameOf(who, hunter), nameOf(who, owner)];
  if (names.some((name) => normalizeName(name).includes(text))) return true;
  const digits = digitsOf(search);
  return digits.length >= MIN_TAX_ID_SEARCH && taxIdList(cuit).some((id) => id.includes(digits));
}

export function filterActions(
  who: Who,
  actions: readonly ListedAction[],
  filters: ListFilters,
  unread: UnreadByAction,
): readonly ListedAction[] {
  const shown = actions.filter(
    (action) =>
      matchesHunter(action, filters.hunter) &&
      (!filters.type || action.tipo === filters.type) &&
      matchesDates(action, filters) &&
      matchesState(action, filters.state) &&
      matchesText(who, action, filters.search),
  );
  const attention = (action: ListedAction) => (asksForAttention(who, action, unread) ? 1 : 0);
  return shown.toSorted((a, b) => attention(b) - attention(a));
}

export interface Choice {
  readonly value: string;
  readonly label: string;
}

const choicesOf = (labels: Readonly<Record<string, string>>): Choice[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

export function stateChoices(role: string): readonly Choice[] {
  return [
    { value: "", label: "Todos los estados" },
    ...choicesOf(ACTION_STATES),
    { value: "datos", label: "Bases de datos" },
    ...(role === "hunter"
      ? []
      : [
          { value: "por_asignar", label: "Por asignar" },
          { value: "no_puede", label: "Pidieron que se la pasen a otro" },
        ]),
  ];
}

export const TYPE_CHOICES: readonly Choice[] = [
  { value: "", label: "Todos los tipos" },
  ...choicesOf(ACTION_TYPES),
];

export function hunterFilterIds(who: Who, actions: readonly ListedAction[]): readonly string[] {
  const team = huntersOf(who, who.role === "lider" && !who.isAdmin).map(({ id }) => id);
  const others = actions.flatMap(({ hunter_id: id }) => (id && !team.includes(id) ? [id] : []));
  return [...new Set([...team, ...others])];
}

export function repetitionText({
  frecuencia,
  cada_dias: every,
  veces: times,
  vez: time,
}: Pick<ListedAction, "frecuencia" | "cada_dias" | "veces" | "vez">): string {
  if (frecuencia !== "repite") return "";
  const days = `Cada ${every ? String(every) : "?"} días`;
  if (times) return `${days} · vez ${String(time ?? 1)} de ${String(times)}`;
  return time && time > 1 ? `${days} · vez ${String(time)}` : days;
}

type When = Pick<
  ListedAction,
  | "tipo"
  | "modalidad"
  | "fecha"
  | "vence"
  | "hora_desde"
  | "hora_hasta"
  | "lugar"
  | "frecuencia"
  | "cada_dias"
  | "veces"
  | "vez"
>;

/** Type, day and time on one line. A data list has no time: it goes from / until. */
export function whenText(action: When): string {
  const { tipo, fecha, vence, modalidad, lugar } = action;
  if (tipo === "datos") {
    const until = vence ? ` hasta el ${dateLabel(vence)}` : "";
    return `${labelOf(ACTION_TYPES, tipo)} · desde el ${dateLabel(fecha)}${until}`;
  }
  const time = timeRange(action);
  const parts = [
    `${labelOf(ACTION_TYPES, tipo)} ${labelOf(MODALITIES, modalidad).toLowerCase()} · ${dateLabel(fecha)}${time ? ` ${time}` : ""}`,
    lugar ?? "",
    repetitionText(action),
  ];
  return parts.filter(Boolean).join(" · ");
}
