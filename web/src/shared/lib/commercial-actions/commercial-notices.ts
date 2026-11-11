// What is new on Gestiones for this person, by series: a series of three dates is one notice. As a
// hunter, what was forwarded and not opened; as the owner, what a hunter registered or completed; for
// everybody, messages not read; and for a leader, what was sent to assign.
import type { CommercialPeople } from "./people-query.ts";

export type CommercialNoticeKind =
  | "derivada"
  | "completada"
  | "registro"
  | "mensaje"
  | "por_asignar";

export interface CommercialNotice {
  /** With the kind, what tells whether it was told already. */
  readonly key: string;
  readonly empresa: string;
  readonly kind: CommercialNoticeKind;
  readonly who: string | null;
  readonly cannotAttend?: boolean;
}

export interface NewActionRow {
  readonly serie_id: string | null;
  readonly empresa: string;
  readonly origen: string;
  readonly creada_por: string | null;
  readonly hunter_id: string | null;
  readonly dueno_id: string | null;
  readonly visto_hunter: boolean;
  readonly visto_dueno: boolean;
}

export interface UnreadMessagesRow {
  readonly gestion_id: string;
  readonly empresa: string;
  readonly n: number;
  readonly ultimo_at: string;
  readonly ultimo_autor: string | null;
  readonly no_puedo?: boolean;
}

export interface ToAssignRow {
  readonly serie_id: string | null;
  readonly empresa: string;
  readonly creada_por: string | null;
}

export interface NoticeSources {
  readonly newActions: readonly NewActionRow[];
  readonly messages: readonly UnreadMessagesRow[];
  readonly toAssign: readonly ToAssignRow[];
}

function ofActions(rows: readonly NewActionRow[], me: string): CommercialNotice[] {
  const seen = new Set<string>();
  const once = (mark: string) => !seen.has(mark) && Boolean(seen.add(mark));
  return rows.flatMap((row) => {
    const { serie_id: series, empresa, hunter_id: hunter, creada_por: creator, origen } = row;
    const found: CommercialNotice[] = [];
    if (hunter === me && !row.visto_hunter && once(`h${String(series)}`)) {
      found.push({ key: String(series), empresa, kind: "derivada", who: creator });
    }
    if (row.dueno_id === me && !row.visto_dueno && once(`d${String(series)}`)) {
      const kind = origen === "derivada" ? "completada" : "registro";
      found.push({ key: String(series), empresa, kind, who: hunter });
    }
    return found;
  });
}

function ofToAssign(rows: readonly ToAssignRow[]): CommercialNotice[] {
  const seen = new Set<string | null>();
  return rows.flatMap(({ serie_id: series, empresa, creada_por: who }) => {
    if (seen.has(series)) return [];
    seen.add(series);
    return [{ key: String(series), empresa, kind: "por_asignar" as const, who }];
  });
}

export function noticesOf(sources: NoticeSources, me: string): readonly CommercialNotice[] {
  return [
    ...ofActions(sources.newActions, me),
    // A new message on the same action warns again: its key has the time of the last one.
    ...sources.messages.map((message): CommercialNotice => ({
      key: `${message.gestion_id}|${message.ultimo_at}`,
      empresa: message.empresa,
      kind: "mensaje",
      who: message.ultimo_autor,
      cannotAttend: Boolean(message.no_puedo),
    })),
    ...ofToAssign(sources.toAssign),
  ];
}

const LISTED = 3;

function listOf(notices: readonly CommercialNotice[]): string {
  const names = notices.slice(0, LISTED).map(({ empresa }) => empresa);
  return `${names.join(", ")}${notices.length > LISTED ? "…" : ""}`;
}

function forwardedPart(notices: readonly CommercialNotice[], people: CommercialPeople) {
  const [first] = notices;
  if (!first) return [];
  if (notices.length > 1) {
    return [`Te derivaron ${String(notices.length)} acciones nuevas: ${listOf(notices)}`];
  }
  const who = people[first.who ?? ""]?.nombre ?? "Un hunter";
  return [`${who} te derivó una acción en ${first.empresa}`];
}

function ownedPart(notices: readonly CommercialNotice[], people: CommercialPeople) {
  const [first] = notices;
  if (!first) return [];
  if (notices.length > 1) {
    const count = String(notices.length);
    return [`Hay novedades en ${count} acciones de tus empresas: ${listOf(notices)}`];
  }
  const who = people[first.who ?? ""]?.nombre ?? "Un hunter";
  const what =
    first.kind === "completada"
      ? " completó la acción que derivaste en "
      : " registró una acción en ";
  return [`${who}${what}${first.empresa}`];
}

function messagesPart(notices: readonly CommercialNotice[], people: CommercialPeople) {
  const [first] = notices;
  if (!first) return [];
  if (notices.length > 1) {
    return [`Tenés mensajes nuevos en ${String(notices.length)} acciones: ${listOf(notices)}`];
  }
  const who = people[first.who ?? ""]?.nombre ?? "Alguien";
  const what = first.cannotAttend ? " avisó que no puede ir a " : " te escribió sobre ";
  return [`${who}${what}${first.empresa}`];
}

function toAssignPart(notices: readonly CommercialNotice[]) {
  const [first] = notices;
  if (!first) return [];
  if (notices.length === 1) return [`Hay una acción para asignar en ${first.empresa}`];
  return [`Hay ${String(notices.length)} acciones para asignar: ${listOf(notices)}`];
}

export function noticeText(notices: readonly CommercialNotice[], people: CommercialPeople): string {
  const of = (...kinds: readonly CommercialNoticeKind[]) =>
    notices.filter(({ kind }) => kinds.includes(kind));
  const parts = [
    ...forwardedPart(of("derivada"), people),
    ...ownedPart(of("completada", "registro"), people),
    ...messagesPart(of("mensaje"), people),
    ...toAssignPart(of("por_asignar")),
  ];
  if (parts.length === 0) return "";
  return `${parts.join(". ")}. ${notices.length === 1 ? "Está" : "Están"} en Gestiones.`;
}
