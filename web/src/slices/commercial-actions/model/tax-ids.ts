// CUIT of a company and CUIL of a person, and what can be done with a person's contact.
import { digitsOf, formatTaxId } from "@/shared/domain/company-registry/index.ts";

const CUIL_LENGTH = 11;
const CUIL_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const CUIL_MODULE = 11;
const CUIL_PREFIX = /^(20|23|24|27|30|33|34)/;
const SEPARATORS = /[,;\s]+/;
const ONLY_NUMBER = /^[\d\s.-]+$/;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_DIAL = /[^\d+]/g;
const MIN_PHONE_DIGITS = 6;
const REFERENCE_MAX = 120;

export function hasCuilPrefix(digits: string): boolean {
  return CUIL_PREFIX.test(digits);
}

export function isValidCuil(value: string | null | undefined): boolean {
  const digits = digitsOf(value);
  if (digits.length !== CUIL_LENGTH || !hasCuilPrefix(digits)) return false;
  const sum = CUIL_WEIGHTS.reduce(
    (total, weight, index) => total + Number(digits[index]) * weight,
    0,
  );
  const rest = CUIL_MODULE - (sum % CUIL_MODULE);
  const check = rest === CUIL_MODULE ? 0 : rest === CUIL_MODULE - 1 ? 9 : rest;
  return check === Number(digits[CUIL_LENGTH - 1]);
}

export function formatCuil(value: string | null | undefined): string {
  return formatTaxId(digitsOf(value));
}

/** The database keeps the digits separated by commas; a company of the list brings an array. */
export function taxIdList(value: string | readonly string[] | null | undefined): string[] {
  const parts = typeof value === "string" ? value.split(SEPARATORS) : (value ?? []);
  return parts.map((part) => digitsOf(part)).filter(Boolean);
}

export function taxIdText(value: string | readonly string[] | null | undefined): string {
  const list = taxIdList(value);
  return list.length > 0 ? `CUIT ${list.map((id) => formatCuil(id)).join(" · ")}` : "";
}

export type CuilOrReference =
  | { readonly cuil?: undefined; readonly referencia?: undefined; readonly error?: undefined }
  | { readonly cuil: string; readonly referencia?: undefined; readonly error?: undefined }
  | { readonly referencia: string; readonly cuil?: undefined; readonly error?: undefined }
  | { readonly error: string; readonly cuil?: undefined; readonly referencia?: undefined };

/**
 * One single field: a valid CUIL is kept as a CUIL, 11 digits that are not one are warned about, and
 * anything else (file number, sector, ID) is a reference.
 */
export function readCuilOrReference(text: string): CuilOrReference {
  const value = text.trim();
  if (!value) return {};
  const digits = digitsOf(value);
  if (ONLY_NUMBER.test(value) && digits.length === CUIL_LENGTH) {
    return isValidCuil(digits)
      ? { cuil: digits }
      : { error: "Ese CUIL no es válido. Revisalo, o escribí otra cosa como referencia." };
  }
  return { referencia: value.slice(0, REFERENCE_MAX) };
}

export function cuilOrReferenceText({
  cuil,
  referencia,
}: {
  readonly cuil: string | null;
  readonly referencia: string | null;
}): string {
  return cuil ? formatCuil(cuil) : (referencia ?? "");
}

/** A phone or a mail gives a link to call or write from the phone. */
export function contactLink(contact: string): string | null {
  if (MAIL.test(contact)) return `mailto:${contact}`;
  const dial = contact.replace(NOT_DIAL, "");
  return digitsOf(dial).length >= MIN_PHONE_DIGITS ? `tel:${dial}` : null;
}
