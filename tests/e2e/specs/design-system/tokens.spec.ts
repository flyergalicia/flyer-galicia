// The design tokens against the current app: the same value for each one, in each look.
import {
  type AppearanceName,
  NOT_TOKENS,
  RENAMED_TOKENS,
} from "../../support/design-system/cases.ts";
import {
  customProperties,
  normalizeToken,
  openStory,
  storyUrl,
} from "../../support/design-system/look.ts";
import { type Palette } from "../../support/driver/screens.ts";
import { expect, test } from "../../support/test.ts";

const PALETTES: readonly Palette[] = ["marfil", "marino", "grafito", "cielo"];
const TOKENS_STORY = "Tokens/InTheCurrentLook";
// Only for labels in capitals, where 11px is allowed.
const LABEL_TOKENS = new Set(["--text-label", "--text-panel"]);

async function storyTokens(
  page: import("@playwright/test").Page,
  url: string,
): Promise<Record<string, string>> {
  await openStory(page, url);
  return customProperties(page);
}

for (const palette of PALETTES) {
  for (const dark of [false, true]) {
    test(`${palette}, ${dark ? "dark" : "light"}: every token of the app has its value`, async ({
      openApp,
      storybookUrl,
      browser,
    }) => {
      const app = await openApp();
      await app.screens.setAppearance({ dark, palette });
      const legacy = await customProperties(app.page);

      const story = await browser.newPage();
      // The names of the looks that matter here are the palette and the mode, not the window.
      const url = storyUrl(storybookUrl, TOKENS_STORY, "desktop-light").replace(
        /globals=[^&]*/,
        `globals=${encodeURIComponent(`palette:${palette};dark:${String(dark)}`)}`,
      );
      const tokens = await storyTokens(story, url);
      await story.close();

      const names = Object.keys(legacy).filter((name) => !NOT_TOKENS.test(name));
      expect(names.length, "the app was read").toBeGreaterThan(40);
      for (const name of names) {
        const inStory = tokens[RENAMED_TOKENS[name] ?? name];
        expect
          .soft(normalizeToken(inStory ?? "(missing)"), name)
          .toBe(normalizeToken(legacy[name] ?? ""));
      }
    });
  }
}

test("no font size token is below the agreed minimum", async ({ browser, storybookUrl }) => {
  const page = await browser.newPage();
  await openStory(
    page,
    storyUrl(storybookUrl, TOKENS_STORY, "desktop-light" satisfies AppearanceName),
  );
  const tokens = await customProperties(page);
  await page.close();
  const sizes = Object.entries(tokens).filter(([name]) => name.startsWith("--text-"));
  expect(sizes.length).toBeGreaterThan(5);
  for (const [name, value] of sizes) {
    const pixels = Number.parseFloat(value) * 16;
    expect.soft(pixels, name).toBeGreaterThanOrEqual(LABEL_TOKENS.has(name) ? 11 : 12);
  }
});
