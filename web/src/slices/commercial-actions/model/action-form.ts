// The form common to registering, forwarding, assigning and editing, as data: what it starts with,
// what it reads when saved and what is missing. A data list has no time, place, modality nor
// repetition: it has "desde", "trabajarla hasta" and, when it is created, its list of people.
import { digitsOf } from "@/shared/domain/company-registry/index.ts";
import type { ActionRow, NewAction } from "../api/rows.ts";
import { addDays, dateLabel, timeOf, today } from "./formatting.ts";
import { ACTION_TYPES, MAX_TIMES } from "./labels.ts";

export type FormMode = "registrar" | "derivar" | "editar";

/** What the hunter field says for "Que la asigne el líder". */
export const TO_LEADER = "__lider";
const MAX_INTEGER = 1_000_000;
const MIN_TIMES = 2;
const MAX_DAYS = 365;

export interface ActionFormState {
  readonly tipo: string;
  readonly modalidad: string;
  readonly frecuencia: string;
  readonly fecha: string;
  readonly vence: string;
  readonly desde: string;
  readonly hasta: string;
  readonly lugar: string;
  readonly nota: string;
  readonly hunter: string;
  readonly lider: string;
  readonly estado: string;
  readonly dotacion: string;
  readonly asistentes: string;
  readonly cadaDias: string;
  readonly veces: string;
  readonly personas: string;
}

export type ActionFormDefaults = Partial<ActionRow>;

function textOf(value: number | string | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function initialForm(action: ActionFormDefaults = {}): ActionFormState {
  return {
    tipo: action.tipo ?? "accion",
    modalidad: action.modalidad ?? "presencial",
    frecuencia: action.frecuencia === "repite" ? "repite" : "unica",
    fecha: action.fecha ?? today(),
    vence: action.vence ?? "",
    desde: timeOf(action.hora_desde),
    hasta: timeOf(action.hora_hasta),
    lugar: action.lugar ?? "",
    nota: action.nota ?? "",
    hunter: action.hunter_id ?? "",
    lider: "",
    estado: action.estado ?? "realizada",
    dotacion: textOf(action.dotacion),
    asistentes: textOf(action.asistentes),
    cadaDias: textOf(action.cada_dias),
    veces: textOf(action.veces),
    personas: "",
  };
}

/** The types each window offers. */
export function typesFor(mode: FormMode, tipo: string): Readonly<Record<string, string>> {
  const { datos, ...others } = ACTION_TYPES;
  if (mode === "editar" && tipo === "datos") return { datos: datos ?? "" };
  return mode === "derivar" ? ACTION_TYPES : others;
}

function integerOf(text: string): number | null {
  const digits = digitsOf(text);
  return digits === "" ? null : Math.min(MAX_INTEGER, Number(digits));
}

export interface ActionFormValues {
  readonly tipo: string;
  readonly modalidad: string;
  readonly frecuencia: string;
  readonly fecha: string;
  readonly nota: string | null;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  readonly lugar: string | null;
  readonly vence: string | null;
  readonly estado: string;
  readonly cada_dias: number | null;
  /** Undefined in a series already built: the number of times is not touched. */
  readonly veces?: number | null;
  readonly vez?: number | null;
  readonly hunter_id?: string | null;
  readonly lider_id?: string | null;
  readonly dotacion?: number | null;
  readonly asistentes?: number | null;
}

function repetitionOf(form: ActionFormState, isDataList: boolean, hasTimes: boolean) {
  if (isDataList || form.frecuencia !== "repite") {
    return {
      frecuencia: isDataList ? "unica" : form.frecuencia,
      cada_dias: null,
      veces: null,
      vez: null,
    };
  }
  return {
    frecuencia: "repite",
    cada_dias: integerOf(form.cadaDias),
    ...(hasTimes ? { veces: integerOf(form.veces) } : {}),
  };
}

function scheduleOf(form: ActionFormState, isDataList: boolean) {
  if (isDataList) {
    return {
      modalidad: "virtual",
      hora_desde: null,
      hora_hasta: null,
      lugar: null,
      vence: form.vence || null,
    };
  }
  return {
    modalidad: form.modalidad,
    hora_desde: form.desde || null,
    hora_hasta: form.hasta || null,
    lugar: form.lugar.trim() || null,
    vence: null,
  };
}

function modeValues(form: ActionFormState, mode: FormMode) {
  if (mode === "derivar") {
    const isToLeader = form.hunter === TO_LEADER;
    return {
      estado: "planificada",
      hunter_id: isToLeader ? null : form.hunter,
      ...(isToLeader ? { lider_id: form.lider || null } : {}),
    };
  }
  return {
    estado: form.estado || "realizada",
    dotacion: integerOf(form.dotacion),
    asistentes: integerOf(form.asistentes),
  };
}

/** What the database gets. `hasTimes`: the field of the number of times is there. */
export function readForm(form: ActionFormState, mode: FormMode, hasTimes = true): ActionFormValues {
  const isDataList = form.tipo === "datos";
  return {
    tipo: form.tipo,
    fecha: form.fecha || today(),
    nota: form.nota.trim() || null,
    ...scheduleOf(form, isDataList),
    ...repetitionOf(form, isDataList, hasTimes),
    ...modeValues(form, mode),
  };
}

/** Null if it is right. */
export function repetitionProblem({
  frecuencia,
  cada_dias: every,
  veces: times,
}: {
  readonly frecuencia: string;
  readonly cada_dias: number | null;
  readonly veces?: number | null | undefined;
}): string | null {
  if (frecuencia !== "repite") return null;
  if (!(every !== null && every >= 1 && every <= MAX_DAYS)) {
    return "Indicá cada cuántos días se repite (de 1 a 365).";
  }
  if (times !== null && times !== undefined && !(times >= MIN_TIMES && times <= MAX_TIMES)) {
    return `La cantidad de veces va de 2 a ${String(MAX_TIMES)} (o dejala vacía si no sabés).`;
  }
  return null;
}

/**
 * What is missing to forward or assign. So nobody steps on the agenda of a hunter, with a hunter
 * chosen the time is compulsory.
 */
export function assignmentProblem(values: ActionFormValues): string | null {
  const { hunter_id: hunter, lider_id: leader, tipo, hora_desde: from, vence, fecha } = values;
  if (!hunter && !leader) return "Elegí el hunter (o que la asigne el líder).";
  if (tipo !== "datos" && hunter && !from) {
    return "Poné el horario: así nadie le pisa la agenda al hunter. (Mañana y Tarde lo completan de un toque.)";
  }
  if (tipo === "datos" && vence && vence < fecha) {
    return '"Trabajarla hasta" tiene que ser después de "Desde".';
  }
  return null;
}

export type DatedAction = NewAction & { readonly fecha: string };

/** With the number of times known, the other dates of a series, already planned. */
export function restOfSeries(saved: ActionRow): readonly DatedAction[] {
  const { frecuencia, veces: times, cada_dias: every, fecha, origen } = saved;
  if (frecuencia !== "repite" || !times || times < MIN_TIMES) return [];
  return Array.from({ length: times - 1 }, (_, index): DatedAction => {
    const turn = index + 1;
    return {
      empresa: saved.empresa,
      tipo: saved.tipo,
      modalidad: saved.modalidad,
      frecuencia: "repite",
      cada_dias: every,
      veces: times,
      vez: turn + 1,
      serie_id: saved.serie_id,
      fecha: addDays(fecha, turn * (every ?? 0)),
      estado: "planificada",
      dotacion: saved.dotacion,
      nota: saved.nota,
      origen,
      hora_desde: saved.hora_desde ?? null,
      hora_hasta: saved.hora_hasta ?? null,
      lugar: saved.lugar ?? null,
      dueno_id: saved.dueno_id,
      ...(origen === "derivada"
        ? {
            hunter_id: saved.hunter_id,
            ...(saved.hunter_id ? {} : { lider_id: saved.lider_id }),
          }
        : {}),
    };
  });
}

/** An endless series: when one is completed, the next one is offered, this many days ahead. */
export function daysToNextDate(action: ActionRow): number | null {
  const { frecuencia, veces: times, cada_dias: every, estado } = action;
  return frecuencia === "repite" && !times && estado === "realizada" ? every : null;
}

export interface NextDate {
  readonly action: DatedAction;
  /** Whose agenda it goes on. */
  readonly hunter: string | null;
}

const DEFAULT_EVERY_DAYS = 30;

/** The next date of a repeated action, with the same data. Its people start at zero. */
export function nextDateOf(action: ActionRow, me: string): NextDate {
  const every = action.cada_dias ?? DEFAULT_EVERY_DAYS;
  const isForwarded = action.origen === "derivada" && action.creada_por === me;
  return {
    hunter: isForwarded ? action.hunter_id : me,
    action: {
      empresa: action.empresa,
      tipo: action.tipo,
      modalidad: action.modalidad,
      frecuencia: "repite",
      cada_dias: every,
      veces: null,
      vez: (action.vez ?? 1) + 1,
      serie_id: action.serie_id,
      fecha: addDays(action.fecha, every),
      estado: "planificada",
      dotacion: action.dotacion,
      nota: `Repetición de la del ${dateLabel(action.fecha)}`,
      hora_desde: action.hora_desde ?? null,
      hora_hasta: action.hora_hasta ?? null,
      lugar: action.lugar ?? null,
      dueno_id: action.dueno_id,
      origen: isForwarded ? "derivada" : "propia",
      ...(isForwarded ? { hunter_id: action.hunter_id } : {}),
    },
  };
}
