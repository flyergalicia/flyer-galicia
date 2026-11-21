// What the design-system project used to read from the old app opened live, frozen on 6-nov-2026
// in tests/fixtures/design-system/reference-look.json, so that shared is still compared with it after
// the old app is deleted (stage 6 of docs/PLAN_MIGRACION_REACT.md).
//
// It was recorded once, by opening the old app exactly as these specs did (same user, screen,
// window, palette and mode, the same reference data and the same probes), and the recording mode
// was removed afterwards: the old app no longer exists, so the file cannot be recorded again and
// must not be edited by hand. It holds:
// - tokens: the custom properties on <html> of the old app, per palette and mode.
// - computedLooks: per screen group (`states` for the probes), appearance and case, the box of the
//   element in the old app, where the story is placed, and its computed values in each state.
// - referenceBoxes: per screen group, appearance and case, the box of the element in the reference
//   image (which crops it), the box that gives the place (`placeFrom`) and the masked boxes.
// A case added to cases.ts has nothing frozen and fails: compare it with something else.
import { readFileSync } from "node:fs";
import { type AppearanceName, type LookCase, type LookState } from "./cases.ts";
import { type Box } from "./images.ts";
import { type ComputedLook } from "./look.ts";

const FIXTURE = new URL("../../../fixtures/design-system/reference-look.json", import.meta.url);

export interface FrozenLook {
  /** Where the element was on the screen of the old app, or null if it was not on it. */
  box: Box | null;
  states: Partial<Record<LookState, ComputedLook>>;
}

export interface FrozenReferenceBoxes {
  box: Box | null;
  placeFrom?: Box | null;
  mask?: Box[];
}

type PerCase<T> = Record<string, Record<string, Record<string, T>>>;

interface ReferenceLook {
  tokens: Record<string, Record<string, string>>;
  computedLooks: PerCase<FrozenLook>;
  referenceBoxes: PerCase<FrozenReferenceBoxes>;
}

let loaded: ReferenceLook | undefined;

function referenceLook(): ReferenceLook {
  if (!loaded) {
    const parsed: ReferenceLook = JSON.parse(readFileSync(FIXTURE, "utf8"));
    loaded = parsed;
  }
  return loaded;
}

function caseKey(look: LookCase): string {
  return `${look.story} @ ${look.selector}`;
}

function frozen<T>(found: T | undefined, what: string): T {
  if (found === undefined) throw new Error(`${what} was not frozen from the old app`);
  return found;
}

/** The custom properties on <html> of the old app, in that palette and mode. */
export function frozenTokens(palette: string, dark: boolean): Record<string, string> {
  const look = `${palette}-${dark ? "dark" : "light"}`;
  return frozen(referenceLook().tokens[look], `The tokens of ${look}`);
}

export function frozenLook(group: string, appearance: AppearanceName, look: LookCase): FrozenLook {
  const where = `${group}, ${appearance}, ${caseKey(look)}`;
  return frozen(referenceLook().computedLooks[group]?.[appearance]?.[caseKey(look)], where);
}

export function frozenState(found: FrozenLook, state: LookState, look: LookCase): ComputedLook {
  return frozen(found.states[state], `${caseKey(look)}, ${state}`);
}

export function frozenReferenceBoxes(
  group: string,
  appearance: AppearanceName,
  look: LookCase,
): FrozenReferenceBoxes {
  const where = `${group}, ${appearance}, ${caseKey(look)}`;
  return frozen(referenceLook().referenceBoxes[group]?.[appearance]?.[caseKey(look)], where);
}
