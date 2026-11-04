// What changed in the officers of a company, as the proposals and the change log tell it.
import { asText } from "./text.ts";

export type OfficerChange = readonly [label: string, detail: string];

type Fields = "nombre" | "celular" | "email";

const ALL_CHANGED = 3;
const NOTHING = "—";

function value(officer: unknown, key: Fields): string {
  const found: unknown =
    typeof officer === "object" && officer !== null ? Reflect.get(officer, key) : null;
  return asText(found).trim();
}

function isEmpty(officer: unknown): boolean {
  return !value(officer, "nombre") && !value(officer, "celular") && !value(officer, "email");
}

function nameOf(officer: unknown): string {
  return (
    value(officer, "nombre") || value(officer, "email") || value(officer, "celular") || "sin nombre"
  );
}

function fieldChange(before: unknown, after: unknown, key: Fields, word: string): string[] {
  const one = value(before, key);
  const other = value(after, key);
  return one === other ? [] : [`${word} ${one || NOTHING} → ${other || NOTHING}`];
}

function changeOf(before: unknown, after: unknown): OfficerChange | null {
  if (isEmpty(before) && isEmpty(after)) return null;
  if (isEmpty(before)) return ["Oficial agregado", nameOf(after)];
  if (isEmpty(after)) return ["Oficial quitado", nameOf(before)];
  const contactChanged =
    value(before, "celular") !== value(after, "celular") ||
    value(before, "email") !== value(after, "email");
  // Another name and another contact: it is another person, not a correction.
  if (value(before, "nombre") !== value(after, "nombre") && contactChanged) {
    return ["Oficial reemplazado", `${nameOf(before)} → ${nameOf(after)}`];
  }
  const changes = [
    ...fieldChange(before, after, "nombre", "nombre"),
    ...fieldChange(before, after, "celular", "celular"),
    ...fieldChange(before, after, "email", "mail"),
  ];
  if (changes.length === 0) return null;
  const who = changes.length === ALL_CHANGED ? after : before;
  return ["Oficial", `${nameOf(who)} · ${changes.join(" · ")}`];
}

export function officerChanges(before: unknown, after: unknown): readonly OfficerChange[] {
  const first: readonly unknown[] = Array.isArray(before) ? before : [];
  const second: readonly unknown[] = Array.isArray(after) ? after : [];
  const length = Math.max(first.length, second.length);
  return Array.from({ length }, (_, position) =>
    changeOf(first[position], second[position]),
  ).filter((change) => change !== null);
}
