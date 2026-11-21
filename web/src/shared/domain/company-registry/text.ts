// How the names and numbers of the companies are compared and written. The razón social is the key
// of a company (docs/adr/0001), so this is what says that two names are the same one.
import { rememberedText } from "../promotions/text.ts";

const ACCENTS = /[̀-ͯ]/g;
const BLANKS = /\s+/g;
const NOT_ALPHANUMERIC = /[^a-z0-9]/g;
const NOT_DIGIT = /\D/g;
const TAX_ID_SEPARATORS = /[,;/|\n\r]+/;
const TAX_ID_LENGTH = 11;
const TAX_ID_BODY_END = 10;

function written(value: unknown): string {
  return String(value);
}

export function asText(value: unknown): string {
  return value == null ? "" : written(value);
}

const normalize = rememberedText((text) =>
  text.normalize("NFD").replace(ACCENTS, "").toLowerCase().replace(BLANKS, " ").trim(),
);

/** Without accents, capitals or extra blanks: searching normalizes each row on each key. */
export function normalizeName(value: unknown): string {
  return normalize(asText(value));
}

/** What a column of a sheet is called once its accents, signs and blanks are gone. */
export function columnKey(value: unknown): string {
  return normalizeName(value).replace(NOT_ALPHANUMERIC, "");
}

export function digitsOf(value: unknown): string {
  return asText(value).replace(NOT_DIGIT, "");
}

/** "30-71234567-8, 30709876543" becomes the two of them, with digits only. */
export function parseTaxIds(value: unknown): string[] {
  return asText(value).split(TAX_ID_SEPARATORS).map(digitsOf).filter(Boolean);
}

export function formatTaxId(value: unknown): string {
  const digits = asText(value);
  return digits.length === TAX_ID_LENGTH
    ? `${digits.slice(0, 2)}-${digits.slice(2, TAX_ID_BODY_END)}-${digits.slice(TAX_ID_BODY_END)}`
    : digits;
}
