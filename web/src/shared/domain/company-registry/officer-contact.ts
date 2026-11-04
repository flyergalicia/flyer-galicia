// The data of an officer out of a pasted text: a message, a signature, loose data. It never changes
// a digit of a phone: what it takes out is put back and has to give the original (invariant 13).
import { digitsOf, normalizeName } from "./text.ts";

const MAIL_DOMAIN = "bancogalicia.com.ar";
const THREE_DIGIT_AREAS = new Set(
  "220 221 223 230 236 237 249 260 261 263 264 266 280 291 297 299 341 342 343 345 348 351 353 358 362 364 370 376 379 380 381 383 385 387 388".split(
    " ",
  ),
);
const LETTERS = "A-Za-zÁÉÍÓÚÑáéíóúñ";
const INSIDE_A_PHONE = /^[ \t.\-()/]{0,3}$/;
const A_LETTER = new RegExp(`[${LETTERS}]`);
const MAX_PHONE_DIGITS = 15;
const MIN_LOOKS_LIKE_PHONE = 7;
const PHONE_LENGTH = 10;
const BEFORE_A_PHONE = 18;
const LABEL_POINTS = 10;
const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MOBILE_LABEL = /(cel|celular|m[oó]vil|whatsapp|wsp|\bm\s*[.:])\s*[^\d]{0,3}$/i;
const LANDLINE_LABEL =
  /(tel[eé]fono|\btel\b|\bt\s*[.:]|l[ií]nea|conmutador|interno|\bint\b|fax)\s*[^\d]{0,3}$/i;
const ROLES = "nombre|asesor|asesora|oficial|ejecutivo|ejecutiva|contacto|referente|responsable";
const ROLE_PREFIX = new RegExp(
  `^(el|la|su|mi|nuestro|nuestra)?\\s*(${ROLES})\\s*(es|seria|sería)?\\s*[:\\-]?\\s*`,
  "i",
);
const STARTS_WITH_ROLE = new RegExp(`^(el|la|su)?\\s*(${ROLES})`, "i");
const NOT_A_NAME_WORDS = new Set(
  "me te se nos es son era fue un una unos unas con para por que al en su sus mi tu este esta esto eso hola buenas buenos gracias saludos abrazo cualquier cosa avisas aviso paso pasa dejo adjunto escribio pidiendo pide necesito flyer reunion cliente empresa banco galicia negocios empresas sucursal interno senior junior gerente ok dale ahi aca alli mail email correo cel celular tel telefono telefonos movil whatsapp wsp cuit cuil dni int fax sa srl sas sociedad anonima s datos contacto nombre asesor asesora oficial ejecutivo ejecutiva".split(
    " ",
  ),
);
const PARTICLES = new Set("de del la las los le di da do van von mac mc san santa y".split(" "));
const NAME_WORD = new RegExp(`^[${LETTERS}'’]+\\.?$`);
const INITIAL = new RegExp(`^[${LETTERS}]\\.$`);
const MIN_NAME_WORDS = 2;
const MAX_NAME_WORDS = 5;
const MIN_MAIL_PIECE = 2;
const MAIL_PIECE_POINTS = 10;
const WORD_COST = 2;
const FIRST_LINES = 3;
const ROLE_POINTS = 5;

export interface PastedContact {
  nombre: string;
  celular: string;
  email: string;
  readonly avisos: string[];
  readonly ignorado: string[];
}

interface TakenOut {
  readonly position: number;
  readonly digits: string;
  readonly label: string;
  /** How many digits it replaces when it goes back: "15" without an area was turned into "11". */
  readonly replaces: number;
}

interface PhoneParts {
  readonly area: string;
  readonly number: string;
  readonly digits: string;
  readonly original: string;
  readonly takenOut: readonly TakenOut[];
}

function cutFromStart(
  state: { digits: string; takenOut: TakenOut[] },
  count: number,
  label: string,
) {
  state.takenOut.push({ position: 0, digits: state.digits.slice(0, count), label, replaces: 0 });
  state.digits = state.digits.slice(count);
}

/** Separates the dialing prefixes. The real number stays as it is. */
function splitPhone(original: string): PhoneParts | null {
  const state: { digits: string; takenOut: TakenOut[] } = { digits: original, takenOut: [] };
  if (state.digits.startsWith("0054")) cutFromStart(state, 4, "+54");
  else if (state.digits.startsWith("54") && state.digits.length > PHONE_LENGTH) {
    cutFromStart(state, 2, "+54");
  }
  if (state.digits.startsWith("0")) cutFromStart(state, 1, "0");
  if (state.digits.length === 11 && state.digits.startsWith("9")) cutFromStart(state, 1, "9");
  takeOutFifteen(state);
  const { digits, takenOut } = state;
  if (digits.length !== PHONE_LENGTH) return null;
  const areaLength = areaLengthOf(digits);
  return {
    area: digits.slice(0, areaLength),
    number: digits.slice(areaLength),
    digits,
    original,
    takenOut,
  };
}

/**
 * The "15" goes after the area code. And "15 3617-9603", without an area, means the 11: no real
 * area code starts with 1 other than that one.
 */
function takeOutFifteen(state: { digits: string; takenOut: TakenOut[] }): void {
  if (state.digits.length === 12) {
    const match = /^(\d{2,4})15(\d{6,8})$/.exec(state.digits);
    if (match) {
      const [, area = "", rest = ""] = match;
      state.takenOut.push({ position: area.length, digits: "15", label: "15", replaces: 0 });
      state.digits = area + rest;
    }
  }
  if (state.digits.length === PHONE_LENGTH && state.digits.startsWith("15")) {
    state.takenOut.push({ position: 0, digits: "15", label: "15", replaces: 2 });
    state.digits = `11${state.digits.slice(2)}`;
  }
}

function areaLengthOf(digits: string): number {
  if (digits.startsWith("11")) return 2;
  return THREE_DIGIT_AREAS.has(digits.slice(0, 3)) ? 3 : 4;
}

/** The guarantee: what was taken out, back in its place, gives exactly the original. */
function givesTheOriginal({ digits, original, takenOut }: PhoneParts): boolean {
  const rebuilt = takenOut.reduceRight(
    (text, { position, digits: part, replaces }) =>
      text.slice(0, position) + part + text.slice(position + replaces),
    digits,
  );
  return rebuilt === original;
}

function writePhone({ area, number }: PhoneParts): string {
  return `${area} ${number.slice(0, -4)}-${number.slice(-4)}`;
}

interface Candidate {
  readonly raw: string;
  readonly start: number;
  readonly phone: PhoneParts;
}

interface DigitGroup {
  readonly digits: string;
  readonly start: number;
  readonly end: number;
  /** Stuck to letters it is a code (EMREN050215), not a phone. */
  readonly glued: boolean;
}

function coverUp(text: string, pattern: RegExp, what: string, ignored: string[]): string {
  return text.replace(pattern, (match) => {
    if (!ignored.includes(what)) ignored.push(what);
    return " ".repeat(match.length);
  });
}

function digitGroups(text: string): DigitGroup[] {
  return [...text.matchAll(/\d+/g)].map((match) => ({
    digits: match[0],
    start: match.index,
    end: match.index + match[0].length,
    glued: A_LETTER.test(text.charAt(match.index - 1) || " "),
  }));
}

interface PhoneSearch {
  readonly source: string;
  readonly covered: string;
  readonly candidates: Candidate[];
  readonly seen: Set<string>;
  invalid: string;
}

/** A group and the ones that follow it: each combination is checked as a real phone. */
function tryFromGroup(groups: readonly DigitGroup[], first: number, search: PhoneSearch): void {
  const start = groups[first]?.start ?? 0;
  const before = search.source.charAt(start - 1);
  const shownFrom = before === "+" || before === "(" ? start - 1 : start;
  let digits = "";
  for (let next = first; next < groups.length; next += 1) {
    const group = groups[next];
    if (!group) break;
    if (next > first) {
      const between = search.covered.slice(groups[next - 1]?.end ?? 0, group.start);
      if (group.glued || !INSIDE_A_PHONE.test(between)) break;
    }
    digits += group.digits;
    if (digits.length > MAX_PHONE_DIGITS) break;
    notePhone(digits, search.source.slice(shownFrom, group.end).trim(), start, search);
  }
}

function notePhone(digits: string, raw: string, start: number, search: PhoneSearch): void {
  const phone = splitPhone(digits);
  if (phone && givesTheOriginal(phone)) {
    if (search.seen.has(phone.digits)) return;
    search.seen.add(phone.digits);
    search.candidates.push({ raw, start, phone });
  } else if (
    digits.length >= MIN_LOOKS_LIKE_PHONE &&
    digits.length > digitsOf(search.invalid).length
  ) {
    search.invalid = raw;
  }
}

/** By groups of digits, not with a greedy pattern: that one glued a code to the next phone. */
function phoneCandidates(source: string) {
  const ignored: string[] = [];
  // A tax id has to be covered: "30-71234567-8" gives ten digits that would pass as a phone.
  let covered = coverUp(source, /\b\d{2}\s?-\s?\d{8}\s?-\s?\d\b/g, "un CUIT", ignored);
  covered = coverUp(covered, /(?:cuit|cuil)\s*[:.]?\s*\d[\d.\- ]{8,}\d/gi, "un CUIT", ignored);
  covered = coverUp(covered, /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "una fecha", ignored);
  const groups = digitGroups(covered);
  const search: PhoneSearch = { source, covered, candidates: [], seen: new Set(), invalid: "" };
  for (const [position, group] of groups.entries()) {
    if (!group.glued) tryFromGroup(groups, position, search);
  }
  return { candidates: search.candidates, ignored, invalid: search.invalid };
}

function readMail(text: string, contact: PastedContact): void {
  const mails = (text.match(MAIL) ?? []).map((mail) => mail.toLowerCase());
  const ofTheBank = mails.filter((mail) => mail.endsWith(`@${MAIL_DOMAIN}`));
  const [first] = ofTheBank;
  if (first !== undefined) {
    contact.email = first;
    const others = mails.filter((mail) => mail !== first);
    if (others.length > 0)
      contact.ignorado.push(`${String(others.length)} mail(s) ajenos a Galicia`);
    if (ofTheBank.length > 1) {
      contact.avisos.push(`hay ${String(ofTheBank.length)} mails de Galicia, tomé el primero`);
    }
    return;
  }
  const [other] = mails;
  if (other !== undefined) {
    contact.email = other;
    contact.avisos.push(`el mail no termina en @${MAIL_DOMAIN} — revisalo`);
  }
}

function labelPoints(text: string, start: number): number {
  const before = text.slice(Math.max(0, start - BEFORE_A_PHONE), start);
  return (
    (MOBILE_LABEL.test(before) ? LABEL_POINTS : 0) -
    (LANDLINE_LABEL.test(before) ? LABEL_POINTS : 0)
  );
}

function readPhone(text: string, contact: PastedContact): void {
  const { candidates, ignored, invalid } = phoneCandidates(text);
  contact.ignorado.push(...ignored);
  const sorted = candidates.toSorted(
    (one, other) => labelPoints(text, other.start) - labelPoints(text, one.start),
  );
  const [best, ...rest] = sorted;
  if (best) {
    contact.celular = writePhone(best.phone);
    for (const { raw } of rest) contact.ignorado.push(`otro número (${raw})`);
  } else if (invalid) {
    contact.avisos.push(`"${invalid}" no parece un celular argentino`);
  }
}

function isNameWord(word: string): boolean {
  return NAME_WORD.test(word);
}

function isParticle(word: string): boolean {
  return PARTICLES.has(normalizeName(word));
}

function isPhraseWord(word: string): boolean {
  const key = normalizeName(word).replaceAll(".", "");
  return NOT_A_NAME_WORDS.has(key) && !PARTICLES.has(key);
}

function nameByMail(words: readonly string[], email: string): string {
  const pieces = normalizeName(email.split("@")[0])
    .split(/[._\-0-9]+/)
    .filter((piece) => piece.length > MIN_MAIL_PIECE);
  if (pieces.length === 0) return "";
  let best: { readonly text: string; readonly points: number } | null = null;
  for (const [start, word] of words.entries()) {
    if (!isNameWord(word) || isPhraseWord(word)) continue;
    for (
      let count = MIN_NAME_WORDS;
      count <= MAX_NAME_WORDS && start + count <= words.length;
      count += 1
    ) {
      const window = words.slice(start, start + count);
      if (!window.every(isNameWord) || window.some(isPhraseWord)) break;
      if (window.every(isParticle)) continue;
      const joined = normalizeName(window.join("")).replace(/[^a-z]/g, "");
      const hits = pieces.filter((piece) => joined.includes(piece)).length;
      if (hits === 0) continue;
      const points = hits * MAIL_PIECE_POINTS - count * WORD_COST;
      if (!best || points > best.points) best = { text: window.join(" "), points };
    }
  }
  return best?.text ?? "";
}

function withoutRole(line: string): string {
  return line
    .replace(new RegExp(`^[^${LETTERS}]+`), "")
    .replace(ROLE_PREFIX, "")
    .trim();
}

function nameByLines(text: string): string {
  const lines = text
    .split(/[\n\r;|,]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  let best: { readonly text: string; readonly points: number } | null = null;
  for (const [position, line] of lines.entries()) {
    const clean = withoutRole(line);
    const words = clean.split(/\s+/).filter(Boolean);
    const fits = words.length >= MIN_NAME_WORDS && words.length <= MAX_NAME_WORDS;
    if (!fits || !words.every(isNameWord) || words.some(isPhraseWord) || words.every(isParticle)) {
      continue;
    }
    const points =
      Math.max(0, FIRST_LINES - position) + (STARTS_WITH_ROLE.test(line) ? ROLE_POINTS : 0);
    if (!best || points > best.points) best = { text: clean, points };
  }
  return best?.text ?? "";
}

function titleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) =>
      INITIAL.test(word)
        ? `${word.charAt(0).toUpperCase()}.`
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function readName(text: string, contact: PastedContact): void {
  // Codes mix letters and digits ("EMREN050215"): they go whole, or the letters pass as a surname.
  const clean = text
    .replace(new RegExp(`[${LETTERS}]*\\d[\\d${LETTERS}]*`, "g"), " ")
    .replace(/\d+/g, " ");
  const words = clean.split(new RegExp(`[^${LETTERS}'’.]+`)).filter(Boolean);
  // The mail is a clue to find the name in the text, not a requirement.
  const byMail = contact.email ? nameByMail(words, contact.email) : "";
  const byLines = byMail ? "" : nameByLines(clean);
  const found = byMail || byLines;
  if (!found) return;
  contact.nombre = titleCase(found);
  contact.avisos.push(byMail ? "ubicado por el mail" : "deducido del texto — verificalo");
}

export function parseContact(text: string): PastedContact {
  const contact: PastedContact = { nombre: "", celular: "", email: "", avisos: [], ignorado: [] };
  readMail(text, contact);
  const withoutMails = text.replace(MAIL, " ");
  readPhone(withoutMails, contact);
  readName(withoutMails, contact);
  return contact;
}
