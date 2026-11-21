// The text of the catalog. Galicia keeps some titles with HTML entities, and brands are compared
// without accents, capitals or punctuation. Each text is worked out once: Validar compares every
// brand with thousands of promotions, and the filters of the table read every row on each key.

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&aacute;": "á",
  "&eacute;": "é",
  "&iacute;": "í",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&ntilde;": "ñ",
  "&Ntilde;": "Ñ",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const MEMORY_LIMIT = 50_000;
const ACCENTS = /[̀-ͯ]/g;
const APOSTROPHES = /['’´]/g;
const NOT_ALPHANUMERIC = /[^a-z0-9]+/g;
const WORD_START = /(^|[\s(/-])([a-záéíóúñ])/g;

export type MaybeText = string | null | undefined;

/** A text function that works out each text once, up to a ceiling of memory. */
export function rememberedText(
  compute: (text: string) => string,
  limit: number = MEMORY_LIMIT,
): (text: string) => string {
  const memory = new Map<string, string>();
  return (text) => {
    const known = memory.get(text);
    if (known !== undefined) return known;
    if (memory.size >= limit) memory.clear();
    const value = compute(text);
    memory.set(text, value);
    return value;
  };
}

export function decodeEntities(text: MaybeText): string {
  let decoded = text ?? "";
  // Every entity starts with &: without one there is nothing to change.
  if (!decoded.includes("&")) return decoded;
  for (const [entity, character] of Object.entries(ENTITIES)) {
    decoded = decoded.split(entity).join(character);
  }
  return decoded;
}

const normalized = rememberedText((text) =>
  decodeEntities(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENTS, "")
    // Without leaving a space: mcdonald's is mcdonalds.
    .replace(APOSTROPHES, "")
    .replace(NOT_ALPHANUMERIC, " ")
    .trim(),
);

/** Lower case, no accents, no punctuation, words separated by one space. */
export function normalizeText(text: MaybeText): string {
  return normalized(text ?? "");
}

/** The same without spaces: Galicia writes "SushiClub" what a flyer writes "Sushi Club". */
export function normalizeWithoutSpaces(text: MaybeText): string {
  return normalizeText(text).replaceAll(" ", "");
}

export const lowerCased = rememberedText((text) => text.toLowerCase());

/** Galicia sends everything in capitals: on a list of 300 options that reads badly. */
export function titleCase(text: MaybeText): string {
  return (text ?? "")
    .toLowerCase()
    .replace(WORD_START, (_match, before: string, letter: string) => before + letter.toUpperCase());
}

/** dd/mm/aaaa, and a dash when there is no date. */
export function formatDate(iso: MaybeText): string {
  if (!iso) return "-";
  const parts = iso.slice(0, 10).split("-");
  return parts.length === 3 ? `${String(parts[2])}/${String(parts[1])}/${String(parts[0])}` : iso;
}
