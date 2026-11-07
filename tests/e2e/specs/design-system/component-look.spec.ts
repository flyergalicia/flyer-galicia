// Each component against the same part of the old app, as frozen in
// tests/fixtures/design-system/reference-look.json: the values the browser computed for it, at rest and
// in the states that a person can reach, with the story in the place the part had.
import {
  type ScreenGroup,
  APPEARANCES,
  type AppearanceName,
  type LookCase,
  PROBE_CASES,
  SCREEN_GROUPS,
} from "../../support/design-system/cases.ts";
import { frozenLook, frozenState } from "../../support/design-system/reference-look.ts";
import {
  type ComputedLook,
  enterState,
  openStory,
  placeStory,
  readLook,
  storyUrl,
} from "../../support/design-system/look.ts";
import { type Page } from "@playwright/test";
import { expect, test } from "../../support/test.ts";

const PROBES_PER_TEST = 10;
/** The frozen values of the probes are under this name, whatever test reads them. */
const PROBE_GROUP = "states";

/** In tests of a few, because a story takes a moment to open. */
const PROBE_GROUPS: readonly ScreenGroup[] = Array.from(
  { length: Math.ceil(PROBE_CASES.length / PROBES_PER_TEST) },
  (_, part) => ({
    name: `${PROBE_GROUP} ${String(part + 1)}`,
    image: "",
    appearances: ["desktop-light", "desktop-dark"],
    cases: PROBE_CASES.slice(part * PROBES_PER_TEST, (part + 1) * PROBES_PER_TEST),
  }),
);

const SURFACE = "rgb(255, 255, 255)";
// Without a mouse there is no hover, and keys do not reach what is off the screen of a phone.
const STATES_ON_A_PHONE = ["rest"] as const;

/** Only the first family counts: it always loads, so the others never get used. */
function comparable(name: string, value: string | undefined): string | undefined {
  return name === "font-family" ? value?.split(",")[0]?.replaceAll('"', "") : value;
}

/** The color of a border that has no width paints nothing, and a gap without a flex row neither. */
function isVisible(name: string, look: ComputedLook, value: string): boolean {
  if (name === "column-gap") return value !== "normal";
  const side = /^border-(top|right|bottom|left)-(?:color|style)$/.exec(name)?.[1];
  return side === undefined || look[`border-${side}-width`] !== "0px";
}

async function differences(
  group: string,
  appearance: AppearanceName,
  page: Page,
  look: LookCase,
  isPhone: boolean,
): Promise<string[]> {
  const frozen = frozenLook(group, appearance, look);
  if (!frozen.box) return [`${look.selector} was not on the screen of the old app`];
  const { read } = await placeStory(page, look, frozen.box, SURFACE);
  const ignored = new Set(look.ignore ?? []);
  const found: string[] = [];
  for (const state of isPhone ? STATES_ON_A_PHONE : (look.states ?? ["rest"])) {
    await enterState(read, page, state);
    const expected = frozenState(frozen, state, look);
    const actual = await readLook(read);
    for (const [name, value] of Object.entries(expected)) {
      const mine = comparable(name, actual[name]);
      const counts = !ignored.has(name) && isVisible(name, expected, value);
      if (counts && mine !== comparable(name, value)) {
        found.push(
          `${look.story} (${look.selector}), ${state}: ${name} is ${String(mine)}, not ${value}`,
        );
      }
    }
  }
  return found;
}

for (const group of [...SCREEN_GROUPS, ...PROBE_GROUPS]) {
  const frozenGroup = PROBE_GROUPS.includes(group) ? PROBE_GROUP : group.name;
  for (const appearance of group.appearances) {
    test(`${group.name}, ${appearance}: the same computed values`, async ({
      browser,
      storybookUrl,
    }) => {
      const { viewport, touch } = APPEARANCES[appearance];
      const context = await browser.newContext({
        viewport,
        hasTouch: touch,
        isMobile: touch,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const found: string[] = [];
      for (const look of group.cases.filter(({ notOnPhone }) => !(touch && notOnPhone))) {
        await openStory(page, storyUrl(storybookUrl, look.story, appearance));
        found.push(...(await differences(frozenGroup, appearance, page, look, touch)));
      }
      await context.close();
      expect(found).toEqual([]);
    });
  }
}
