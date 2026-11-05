// The agenda pasted from a spreadsheet: one row per line, its cells in any order. The date, the time,
// the hunter (by name) and the type if it comes are told by what they look like; of what is left, the
// first cell is the company and the second the place.
import { normalizeName } from "@/shared/domain/company-registry/index.ts";
import { isoDate, overlaps, timeRange } from "./formatting.ts";
import { takenText } from "./use-overlap-check.ts";
import { canForce, huntersOf, type Who } from "./who.ts";

const CELL_SEPARATOR = /\t|;|\s{2,}/;
const LINE_BREAK = /\r?\n/;
const WEEKDAY_BEFORE = /^[a-záéíóú]+\.?,?\s+(?=\d)/i;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const WRITTEN_DATE = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?$/;
const TIME_SPAN =
  /^(?:de )?(\d{1,2})(?:[:.](\d{2}))? ?(?:hs?\.?)? ?(?:-|–|a|al|hasta) ?(\d{1,2})(?:[:.](\d{2}))? ?(?:hs?\.?)?$/;
const ONE_TIME = /^(?:desde (?:las )?)?(\d{1,2})(?:([:.])(\d{2}))? ?(hs?\.?)?$/;
const TITLES_COMPANY = /empresa/i;
const TITLES_OTHERS = /fecha|d[ií]a|hunter/i;
const BLANKS = /\s+/g;
const TWO_DIGITS = 2;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const CENTURY = 2000;
const PLACE_MAX = 200;
const MIN_WORD = 3;

function twoDigits(value: number): string {
  return String(value).padStart(TWO_DIGITS, "0");
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);
  const isSame =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isSame ? isoDate(date) : null;
}

/** "21/10", "21/10/2026", "mar 3/11/26", "2026-10-21". Without a year, this one. */
export function dateOfCell(text: string): string | null {
  const clean = text.trim().replace(WEEKDAY_BEFORE, "");
  const iso = ISO_DATE.exec(clean);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const written = WRITTEN_DATE.exec(clean);
  if (!written) return null;
  const year = written[3] ?? "";
  const fullYear = year.length === TWO_DIGITS ? CENTURY + Number(year) : Number(year);
  return validDate(
    year ? fullYear : new Date().getFullYear(),
    Number(written[2]),
    Number(written[1]),
  );
}

function clock(hour: string | undefined, minutes: string | undefined): string | null {
  const hours = Number(hour);
  const rest = Number(minutes ?? 0);
  return hours < HOURS_PER_DAY && rest < MINUTES_PER_HOUR
    ? `${twoDigits(hours)}:${twoDigits(rest)}`
    : null;
}

/** "10 a 12", "10:00-12:30", "9hs". A lone number is not a time: it could be anything. */
export function timesOfCell(text: string): readonly [string, string | null] | null {
  const clean = normalizeName(text).replace(BLANKS, " ");
  const span = TIME_SPAN.exec(clean);
  if (span) {
    const from = clock(span[1], span[2]);
    const to = clock(span[3], span[4]);
    return from && to && to > from ? [from, to] : null;
  }
  const one = ONE_TIME.exec(clean);
  if (!one || !(one[2] ?? one[4])) return null;
  const from = clock(one[1], one[3]);
  return from ? [from, null] : null;
}

export function typeOfCell(text: string): string | null {
  const clean = normalizeName(text);
  if (clean === "posicion comercial" || clean === "posicion") return "posicion";
  if (clean === "accion") return "accion";
  return clean === "feria" ? "feria" : null;
}

/** The whole name, or words that match only one hunter ("Sofía"). */
export function hunterOfCell(who: Who, text: string, ids: readonly string[]): string | null {
  const clean = normalizeName(text);
  if (!clean) return null;
  const nameOfId = (id: string) => normalizeName(who.people[id]?.nombre);
  const exact = ids.filter((id) => nameOfId(id) === clean);
  if (exact.length === 1) return exact[0] ?? null;
  const words = clean.split(" ").filter((word) => word.length >= MIN_WORD);
  if (words.length === 0) return null;
  const matching = ids.filter((id) => {
    const name = ` ${nameOfId(id)} `;
    return words.every((word) => name.includes(` ${word} `));
  });
  return matching.length === 1 ? (matching[0] ?? null) : null;
}

export interface PastedLine {
  readonly fecha: string | null;
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  readonly hunter_id: string | null;
  readonly tipo: string;
  readonly companyText: string;
  readonly lugar: string | null;
  readonly ok: boolean;
  readonly problem: string;
  /** It overlaps, and it goes anyway. */
  readonly warning: string;
  /** It could not be asked: it is not that the company is not there. */
  readonly couldNotAsk: boolean;
  readonly empresa: string | null;
  readonly dueno_id: string | null;
}

function problemOf({
  fecha,
  companyText,
  hunter_id: hunter,
  hora_desde: from,
}: Pick<PastedLine, "fecha" | "companyText" | "hunter_id" | "hora_desde">): string {
  if (!fecha) return "sin fecha";
  if (!companyText) return "sin empresa";
  if (!hunter) return "no se reconoce el hunter";
  // Without a time nobody can take care that it does not overlap.
  return from ? "" : "sin horario";
}

interface CellsRead {
  fecha: string | null;
  hora_desde: string | null;
  hora_hasta: string | null;
  hunter_id: string | null;
  tipo: string;
  readonly others: string[];
}

function readCell(who: Who, ids: readonly string[], cell: string, read: CellsRead): void {
  const date = read.fecha ? null : dateOfCell(cell);
  if (date) {
    read.fecha = date;
    return;
  }
  const times = read.hora_desde ? null : timesOfCell(cell);
  if (times) {
    [read.hora_desde, read.hora_hasta] = times;
    return;
  }
  const type = typeOfCell(cell);
  if (type) {
    read.tipo = type;
    return;
  }
  const hunter = read.hunter_id ? null : hunterOfCell(who, cell, ids);
  if (hunter) read.hunter_id = hunter;
  else read.others.push(cell);
}

function readLine(who: Who, ids: readonly string[], line: string): PastedLine {
  const read: CellsRead = {
    fecha: null,
    hora_desde: null,
    hora_hasta: null,
    hunter_id: null,
    tipo: "posicion",
    others: [],
  };
  for (const cell of line.split(CELL_SEPARATOR)) {
    const clean = cell.trim();
    if (clean) readCell(who, ids, clean, read);
  }
  const { others, ...found } = read;
  const companyText = others[0] ?? "";
  const problem = problemOf({ ...found, companyText });
  return {
    ...found,
    companyText,
    lugar: others[1]?.slice(0, PLACE_MAX) ?? null,
    ok: !problem,
    problem,
    warning: "",
    couldNotAsk: false,
    empresa: null,
    dueno_id: null,
  };
}

function isTitles(line: string): boolean {
  return TITLES_COMPANY.test(line) && TITLES_OTHERS.test(line);
}

export function parsePastedAgenda(who: Who, text: string): PastedLine[] {
  const ids = huntersOf(who, true).map(({ id }) => id);
  return text
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line && !isTitles(line))
    .map((line) => readLine(who, ids, line));
}

export interface FoundCompany {
  readonly empresa: string;
  readonly dueno_id: string;
}

/** Null: it could not be asked. */
export type CompaniesByName = ReadonlyMap<string, readonly FoundCompany[] | null>;

/** Each company once, by its whole name. */
export function namesToLookFor(lines: readonly PastedLine[]): readonly string[] {
  const names = new Map<string, string>();
  for (const { ok, companyText } of lines) {
    if (ok) names.set(normalizeName(companyText), companyText);
  }
  return [...names.values()];
}

export const COULD_NOT_REVIEW = "No se pudo revisar la empresa. Probá de nuevo";

function withCompany(who: Who, line: PastedLine, found: CompaniesByName): PastedLine {
  if (!line.ok) return line;
  const companies = found.get(normalizeName(line.companyText));
  if (companies === null || companies === undefined) {
    return { ...line, ok: false, couldNotAsk: true, problem: COULD_NOT_REVIEW };
  }
  if (companies.length === 0) {
    return { ...line, ok: false, problem: "la empresa no está en la base" };
  }
  const mine = companies.find(({ dueno_id: owner }) => owner === who.me);
  const company = companies.length === 1 ? companies[0] : mine;
  if (!company) {
    return {
      ...line,
      ok: false,
      problem: `la tienen ${String(companies.length)} oficiales: cargala de a una`,
    };
  }
  return { ...line, empresa: company.empresa, dueno_id: company.dueno_id };
}

/** What has to be asked after knowing the companies: each hunter and day once. */
export function daysToAsk(
  lines: readonly PastedLine[],
): readonly { readonly hunter: string; readonly date: string }[] {
  const days = new Map<string, { readonly hunter: string; readonly date: string }>();
  for (const { ok, hunter_id: hunter, fecha } of lines) {
    if (ok && hunter && fecha) days.set(`${hunter}|${fecha}`, { hunter, date: fecha });
  }
  return [...days.values()];
}

export function withCompanies(
  who: Who,
  lines: readonly PastedLine[],
  found: CompaniesByName,
): PastedLine[] {
  return lines.map((line) => withCompany(who, line, found));
}

export interface TakenOnDay {
  readonly hora_desde: string | null;
  readonly hora_hasta: string | null;
  readonly empresa: string | null;
}

/** Whether it overlaps with what is on the agenda or with a line above. */
function overlapsOf(
  line: PastedLine,
  above: readonly PastedLine[],
  taken: readonly TakenOnDay[],
): string[] {
  const onAgenda = taken.filter((item) => overlaps(item, line)).map((item) => takenText(item));
  const onList = above
    .filter(
      (other) =>
        other.ok &&
        other.hunter_id === line.hunter_id &&
        other.fecha === line.fecha &&
        overlaps(other, line),
    )
    .map((other) => `${timeRange(other)} en ${other.empresa ?? ""} (de esta lista)`);
  return [...onAgenda, ...onList];
}

/** The leader of that hunter or the administrator can load it anyway; the others cannot. */
export function withOverlaps(
  who: Who,
  lines: readonly PastedLine[],
  takenOf: (hunter: string, date: string) => readonly TakenOnDay[],
): PastedLine[] {
  const done: PastedLine[] = [];
  for (const line of lines) {
    const { ok, hunter_id: hunter, fecha } = line;
    const crossing = ok && hunter && fecha ? overlapsOf(line, done, takenOf(hunter, fecha)) : [];
    if (crossing.length === 0) done.push(line);
    else if (canForce(who, hunter)) {
      done.push({ ...line, warning: `se pisa con ${crossing.join(", ")}` });
    } else {
      done.push({ ...line, ok: false, problem: `se pisa con ${crossing.join(", ")}` });
    }
  }
  return done;
}

export function readyLines(lines: readonly PastedLine[]): readonly PastedLine[] {
  return lines.filter(({ ok, dueno_id: owner }) => ok && owner);
}

export interface PasteSummary {
  readonly ready: number;
  readonly overlapping: number;
  readonly withProblems: number;
  readonly canTryAgain: boolean;
}

export function summaryOf(lines: readonly PastedLine[]): PasteSummary {
  return {
    ready: lines.filter(({ ok }) => ok).length,
    overlapping: lines.filter(({ ok, warning }) => ok && warning).length,
    withProblems: lines.filter(({ ok }) => !ok).length,
    canTryAgain: lines.some(({ couldNotAsk }) => couldNotAsk),
  };
}

/** What goes to the table, together, as the positions of the day. */
export function pastedRow(line: PastedLine) {
  return {
    empresa: line.empresa ?? "",
    dueno_id: line.dueno_id,
    hunter_id: line.hunter_id,
    origen: "derivada",
    tipo: line.tipo,
    modalidad: "presencial",
    frecuencia: "unica",
    fecha: line.fecha ?? "",
    hora_desde: line.hora_desde,
    hora_hasta: line.hora_hasta,
    lugar: line.lugar,
    estado: "planificada",
  };
}
