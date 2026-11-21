// People pasted from a spreadsheet: one per line, cells in any order. Each cell is taken for what it
// looks like: a package, 11 digits that start like a CUIL, a mail or a number of 10 digits or more
// are a contact, the first cell with letters is the name and any other text (or a short number) is a
// reference. If the first line has titles, they settle the doubts.
import { digitsOf, normalizeName } from "@/shared/domain/company-registry/index.ts";
import { MAX_PEOPLE_ON_LIST } from "./labels.ts";
import { packageOf } from "./packages.ts";
import { hasCuilPrefix, isValidCuil } from "./tax-ids.ts";

const LINES = /\r?\n/;
const TAB = "\t";
const LOOSE_COLUMNS = /;|\s{2,}/;
const NUMBER_CELL = /^[\d\s.\-+()/]+$/;
const LETTERS = /[a-záéíóúñ]/i;
const BLANKS = /\s+/g;
const TEXT_MAX = 120;
const CUIL_LENGTH = 11;
const MIN_PHONE_DIGITS = 10;
const MIN_TITLES = 2;

const NAME_TITLE = /^(nombre|apellido|nombre y apellido|apellido y nombre|empleado|persona)$/;
const CONTACT_TITLE = /tel|cel|mail|correo|contacto|whats/;
const CUIL_TITLE = /^(cuil|cuit)/;
const REFERENCE_TITLE = /ref|legajo|sector|dni|dato|area/;
const PACKAGE_TITLE = /paquete/;

type Column = "nombre" | "contacto" | "cuil" | "ref" | "paq";
type CellKind = "contacto" | "cuil" | "ref" | "texto";
type Columns = readonly (Column | null)[];

export interface PastedPerson {
  readonly nombre: string | null;
  readonly contacto: string | null;
  readonly cuil: string | null;
  readonly referencia: string | null;
  readonly paquete: string | null;
  readonly ok: boolean;
  readonly motivo: string;
}

interface PersonDraft {
  nombre: string | null;
  contacto: string | null;
  cuil: string | null;
  referencia: string | null;
  paquete: string | null;
}

function columnOfTitle(cell: string): Column | null {
  const title = normalizeName(cell);
  if (NAME_TITLE.test(title)) return "nombre";
  if (CONTACT_TITLE.test(title)) return "contacto";
  if (CUIL_TITLE.test(title)) return "cuil";
  if (REFERENCE_TITLE.test(title)) return "ref";
  return PACKAGE_TITLE.test(title) ? "paq" : null;
}

function titleRow(cells: readonly string[]): Columns | null {
  const columns = cells.map((cell) => columnOfTitle(cell));
  const named = columns.filter(Boolean).length;
  return columns.includes("nombre") && named >= MIN_TITLES ? columns : null;
}

function kindOfCell(cell: string): CellKind {
  if (cell.includes("@")) return "contacto";
  const digits = digitsOf(cell);
  if (!NUMBER_CELL.test(cell) || !digits) return "texto";
  if (digits.length === CUIL_LENGTH && hasCuilPrefix(digits)) return "cuil";
  return digits.length >= MIN_PHONE_DIGITS ? "contacto" : "ref";
}

interface Cell {
  readonly text: string;
  readonly column: Column | null;
  readonly kind: CellKind;
  readonly hasLetters: boolean;
  readonly withPackage: boolean;
  /** There are titles and the cell of the name is empty: another column does not become the name. */
  readonly nameIsMissing: boolean;
}

const short = (text: string) => text.slice(0, TEXT_MAX);
const nameFrom = (text: string) => text.replaceAll(BLANKS, " ").slice(0, TEXT_MAX);

/** Each one takes the cell if it can: they go in the order in which they are tried. */
const PLACERS: readonly ((person: PersonDraft, cell: Cell) => boolean)[] = [
  (person, { text, kind, column, nameIsMissing }) => {
    if (!nameIsMissing || kind !== "texto" || (column !== "cuil" && column !== "ref")) return false;
    person.referencia ??= short(text);
    return true;
  },
  (person, { text, withPackage }) => {
    const found = withPackage && !person.paquete ? packageOf(text) : null;
    if (found) person.paquete = found;
    return Boolean(found);
  },
  (person, { text, column, kind }) => {
    if (column !== "contacto" || person.contacto) return false;
    if (kind === "texto" && !text.includes("@")) return false;
    person.contacto = short(text);
    return true;
  },
  (person, { text, column, kind }) => {
    if (column !== "ref" || person.referencia || kind === "cuil") return false;
    person.referencia = short(text);
    return true;
  },
  (person, { text, column, kind, hasLetters }) => {
    if (column !== "nombre" || person.nombre || kind !== "texto" || !hasLetters) return false;
    person.nombre = nameFrom(text);
    return true;
  },
  (person, { text, kind }) => {
    if (kind !== "cuil" || person.cuil) return false;
    person.cuil = digitsOf(text);
    return true;
  },
  (person, { text, kind }) => {
    if (kind !== "contacto" || person.contacto) return false;
    person.contacto = short(text);
    return true;
  },
  (person, { text, kind, hasLetters }) => {
    if (kind !== "texto" || person.nombre || !hasLetters) return false;
    person.nombre = nameFrom(text);
    return true;
  },
  (person, { text }) => {
    person.referencia ??= short(text);
    return true;
  },
];

function cellsOf(line: string): string[] {
  const parts = line.includes(TAB) ? line.split(TAB) : line.split(LOOSE_COLUMNS);
  return parts.map((part) => part.trim());
}

function personOf(cells: readonly string[], columns: Columns | null, withPackage: boolean) {
  const person: PersonDraft = {
    nombre: null,
    contacto: null,
    cuil: null,
    referencia: null,
    paquete: null,
  };
  const nameAt = columns?.indexOf("nombre") ?? -1;
  const nameIsMissing = nameAt >= 0 && !cells[nameAt];
  cells.forEach((text, index) => {
    if (!text) return;
    const cell: Cell = {
      text,
      column: columns?.[index] ?? null,
      kind: kindOfCell(text),
      hasLetters: LETTERS.test(text),
      withPackage,
      nameIsMissing,
    };
    PLACERS.some((place) => place(person, cell));
  });
  return person;
}

function problemOf(person: PersonDraft, seen: ReadonlySet<string>): string {
  if (!person.nombre) return "sin nombre";
  if (person.cuil && !isValidCuil(person.cuil)) return "CUIL inválido";
  return person.cuil && seen.has(person.cuil) ? "ya está en la lista" : "";
}

/** `withPackage`: it also reads the package. `already`: who is there, not to repeat a CUIL. */
export function parsePeople(
  text: string,
  withPackage: boolean,
  already: readonly { readonly cuil: string | null }[],
): PastedPerson[] {
  const seen = new Set(already.flatMap(({ cuil }) => (cuil ? [cuil] : [])));
  let columns: Columns | null = null;
  const people: PastedPerson[] = [];
  for (const line of text.split(LINES)) {
    if (!line.trim()) continue;
    const cells = cellsOf(line);
    const titles: Columns | null = !columns && people.length === 0 ? titleRow(cells) : null;
    if (titles) {
      columns = titles;
      continue;
    }
    const person = personOf(cells, columns, withPackage);
    const motivo = problemOf(person, seen);
    if (person.cuil) seen.add(person.cuil);
    people.push({ ...person, ok: !motivo, motivo });
  }
  return people;
}

export function peopleReady(text: string): PastedPerson[] {
  return parsePeople(text, false, [])
    .filter(({ ok }) => ok)
    .slice(0, MAX_PEOPLE_ON_LIST);
}
