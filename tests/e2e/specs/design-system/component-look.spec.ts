// Each component against the same part of the current app, with the current app open: the values
// the browser computes for it, at rest and in the states that a person can reach.
import {
  type ScreenGroup,
  APPEARANCES,
  type AppearanceName,
  type LookCase,
  PROBE_CASES,
  SCREEN_GROUPS,
} from "../../support/design-system/cases.ts";
import {
  addProbe,
  type ComputedLook,
  enterState,
  legacyElement,
  openStory,
  placeStory,
  readLook,
  storyUrl,
  visibleBox,
} from "../../support/design-system/look.ts";
import { type Page } from "@playwright/test";
import { seedReferenceData } from "../visual/reference-data.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const PROBES_PER_TEST = 10;

/** In tests of a few, because a story takes a moment to open. */
const PROBE_GROUPS: readonly ScreenGroup[] = Array.from(
  { length: Math.ceil(PROBE_CASES.length / PROBES_PER_TEST) },
  (_, part) => ({
    name: `states ${String(part + 1)}`,
    screen: "flyer-editor",
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
  app: OpenedApp,
  page: Page,
  look: LookCase,
  isPhone: boolean,
): Promise<string[]> {
  const legacy = legacyElement(app.page, look);
  const box = await visibleBox(legacy);
  if (!box) return [`${look.legacy} is not on the screen of the current app`];
  const { read } = await placeStory(page, look, box, SURFACE);
  const ignored = new Set(look.ignore ?? []);
  const found: string[] = [];
  for (const state of isPhone ? STATES_ON_A_PHONE : (look.states ?? ["rest"])) {
    await enterState(legacy, app.page, state);
    await enterState(read, page, state);
    const expected = await readLook(legacy);
    const actual = await readLook(read);
    for (const [name, value] of Object.entries(expected)) {
      const mine = comparable(name, actual[name]);
      const counts = !ignored.has(name) && isVisible(name, expected, value);
      if (counts && mine !== comparable(name, value)) {
        found.push(
          `${look.story} (${look.legacy}), ${state}: ${name} is ${String(mine)}, not ${value}`,
        );
      }
    }
  }
  return found;
}

function optionsOf(group: ScreenGroup, appearance: AppearanceName) {
  const { viewport, touch } = APPEARANCES[appearance];
  return {
    viewport,
    touch,
    commercialActions: Boolean(group.commercialActions),
    waitUntilReady: !group.noFlyer,
    signedOut: Boolean(group.signedOut),
    ...(group.user === undefined ? {} : { user: group.user }),
  };
}

for (const group of [...SCREEN_GROUPS, ...PROBE_GROUPS]) {
  for (const appearance of group.appearances) {
    test(`${group.name}, ${appearance}: the same computed values`, async ({
      cloud,
      openApp,
      browser,
      storybookUrl,
    }) => {
      seedReferenceData(cloud);
      const app = await openApp(optionsOf(group, appearance));
      const { dark, palette, viewport, touch } = APPEARANCES[appearance];
      await app.page.emulateMedia({ reducedMotion: "reduce" });
      await app.screens.setAppearance({ dark, palette });
      await app.screens.open(group.screen);

      const context = await browser.newContext({
        viewport,
        hasTouch: touch,
        isMobile: touch,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const found: string[] = [];
      for (const look of group.cases.filter(({ notOnPhone }) => !(touch && notOnPhone))) {
        if (look.probe) await addProbe(app.page, look.probe);
        await openStory(page, storyUrl(storybookUrl, look.story, appearance));
        found.push(...(await differences(app, page, look, touch)));
      }
      await context.close();
      expect(found).toEqual([]);
    });
  }
}
