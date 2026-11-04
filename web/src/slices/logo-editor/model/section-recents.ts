// "Copiadas hace poco": what was copied last, kept in this browser. If it cannot be read or written,
// there is simply nothing to offer.
import type { CopiedSection } from "./editor-state.ts";

const KEY = "fg_ins_rec";
const HOW_MANY = 5;

function isSection(value: unknown): value is CopiedSection {
  if (typeof value !== "object" || value === null) return false;
  const [address, height]: unknown[] = [Reflect.get(value, "u"), Reflect.get(value, "sh")];
  return (
    typeof address === "string" && Boolean(address) && typeof height === "number" && height > 0
  );
}

export function recentSections(): readonly CopiedSection[] {
  try {
    const read: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(read) ? read.filter(isSection) : [];
  } catch {
    return [];
  }
}

export function rememberSection(section: CopiedSection): void {
  const others = recentSections().filter(
    ({ u, sy, sh }) => !(u === section.u && sy === section.sy && sh === section.sh),
  );
  try {
    localStorage.setItem(KEY, JSON.stringify([section, ...others].slice(0, HOW_MANY)));
  } catch {
    // Without storage there is nothing to remember.
  }
}
