// The sheets library is served from the site itself, as a file of its own that the browser checks
// against this hash. If somebody changes the file by hand, the build says so: a new version goes in
// a new file with its own hash.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const SHEET_LIBRARY_FILE = "web/src/shared/lib/vendor/xlsx-0.20.3.full.min.js";
export const SHEET_LIBRARY_INTEGRITY =
  "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";

export function integrityOf(content: Uint8Array): string {
  return `sha384-${createHash("sha384").update(content).digest("base64")}`;
}

/** What goes in the page, once the file has been checked. */
export function verifiedSheetLibraryIntegrity(read: () => Uint8Array = readLibrary): string {
  const found = integrityOf(read());
  if (found !== SHEET_LIBRARY_INTEGRITY) {
    throw new Error(`${SHEET_LIBRARY_FILE} does not match its hash: ${found}`);
  }
  return found;
}

function readLibrary(): Uint8Array {
  return readFileSync(SHEET_LIBRARY_FILE);
}
