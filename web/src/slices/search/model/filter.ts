// How the search finds (`_cmdFiltrar`). Nothing written: the recent ones and then everything, by group.
// Writing: every word has to appear, and first what starts the same in the title. If nothing does (a
// typing slip), the letters in order inside the title ("prmo" is Promociones).
import { normalize, type SearchEntry } from "./entry.ts";

export const RECENT_GROUP = "Recientes";

export interface ResultRow {
  readonly entry: SearchEntry;
  /** The group it goes under, with nothing written; null in a search, where each one says its own. */
  readonly group: string | null;
}

interface Indexed {
  readonly entry: SearchEntry;
  /** The title, as it is compared. */
  readonly title: string;
  /** Everything it is found with. */
  readonly words: string;
  readonly order: number;
}

interface Hit {
  readonly entry: SearchEntry;
  readonly points: number;
  readonly order: number;
}

function indexed(entries: readonly SearchEntry[]): Indexed[] {
  return entries.map((entry, order) => ({
    entry,
    title: normalize(entry.title),
    words: normalize(`${entry.title} ${entry.group} ${entry.keywords ?? ""}`),
    order,
  }));
}

function grouped(entries: readonly SearchEntry[], recent: readonly string[]): ResultRow[] {
  const first = recent.flatMap((id) =>
    entries.filter((entry) => entry.id === id).map((entry) => ({ entry, group: RECENT_GROUP })),
  );
  const rest = entries
    .filter((entry) => !recent.includes(entry.id))
    .map((entry) => ({ entry, group: entry.group }));
  return [...first, ...rest];
}

/** The whole text at the start of the title goes first; at the start of a word, next. */
function pointsOf(title: string, text: string): number {
  const at = title.indexOf(text);
  if (at === 0) return title === text ? 120 : 100;
  if (at > 0) return title.charAt(at - 1) === " " ? 80 : 60;
  return 30;
}

function byWords(list: readonly Indexed[], text: string): Hit[] {
  const words = text.split(/\s+/);
  return list
    .filter((item) => words.every((word) => item.words.includes(word)))
    .map(({ entry, title, order }) => ({ entry, points: pointsOf(title, text), order }));
}

function hasLettersInOrder(title: string, letters: string): boolean {
  let found = 0;
  for (const letter of title) {
    if (found < letters.length && letter === letters.charAt(found)) found += 1;
  }
  return found === letters.length;
}

/** The shorter the title, the closer. */
function byLetters(list: readonly Indexed[], text: string): Hit[] {
  const letters = text.replace(/\s+/g, "");
  return list
    .filter(({ title }) => hasLettersInOrder(title, letters))
    .map(({ entry, title, order }) => ({ entry, points: -title.length, order }));
}

export function searchRows(
  entries: readonly SearchEntry[],
  typed: string,
  recent: readonly string[],
): readonly ResultRow[] {
  const text = normalize(typed).trim();
  if (!text) return grouped(entries, recent);
  const list = indexed(entries);
  const hits = byWords(list, text);
  const found = hits.length > 0 ? hits : byLetters(list, text);
  return found
    .toSorted((one, other) => other.points - one.points || one.order - other.order)
    .map(({ entry }) => ({ entry, group: null }));
}

export interface TitleParts {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

/** What was written, marked in the title; only where the letters of both line up one to one. */
export function titleParts(title: string, typed: string): TitleParts {
  const text = normalize(typed).trim();
  const plain = normalize(title);
  const at = text ? plain.indexOf(text) : -1;
  if (at < 0 || plain.length !== title.length) return { before: title, match: "", after: "" };
  return {
    before: title.slice(0, at),
    match: title.slice(at, at + text.length),
    after: title.slice(at + text.length),
  };
}
