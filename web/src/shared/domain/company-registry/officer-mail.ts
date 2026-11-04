// The mail of the bank, deduced from a name when nobody wrote one.
const ACCENTS = /[̀-ͯ]/g;
const NOT_ALPHANUMERIC = /[^a-z0-9]/g;
const DOTS = /\./g;
const PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "le",
  "di",
  "da",
  "dos",
  "do",
  "van",
  "von",
  "mac",
  "mc",
  "san",
  "santa",
]);
const MAIL_DOMAIN = "bancogalicia.com.ar";

function slug(text: string): string {
  return text.normalize("NFD").replace(ACCENTS, "").toLowerCase().replace(NOT_ALPHANUMERIC, "");
}

function lastName(words: readonly string[]): string {
  const parts: string[] = [];
  for (const word of words.toReversed()) {
    const clean = slug(word);
    if (parts.length > 0 && !PARTICLES.has(clean)) break;
    parts.unshift(clean);
  }
  return parts.join("");
}

/** "Ana María De Santis" is ana.desantis@…; initials do not count; a lone word gives nothing. */
export function mailFromName(name: string): string {
  const [first = "", ...others] = name.trim().split(/\s+/).filter(Boolean);
  const firstSlug = slug(first);
  const rest = others.filter((word) => word.replace(DOTS, "").length > 1);
  if (!firstSlug || rest.length === 0) return "";
  const last = lastName(rest);
  return last ? `${firstSlug}.${last}@${MAIL_DOMAIN}` : "";
}
