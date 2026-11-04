// The header and the name menu against the same parts of the images of the current app, for as long
// as the React app has no flyer behind them: `user-menu` cannot be compared whole until flyer-editor
// arrives, and then this one is not needed anymore.
import { type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import {
  type Clip,
  allowedPixels,
  crop,
  referenceImage,
} from "../../support/design-system/images.ts";
import { expect, test } from "../../support/test.ts";
import { seedReferenceData } from "./reference-data.ts";

const PIXEL_THRESHOLD = 0.2;
const DESKTOP = { width: 1366, height: 800 };
const PHONE = { width: 390, height: 844 };
const DESKTOP_HEADER: Clip = { x: 0, y: 0, width: 1366, height: 62 };
const DESKTOP_MENU: Clip = { x: 1140, y: 60, width: 208, height: 358 };

interface CropCase {
  readonly name: string;
  readonly image: string;
  readonly dark: boolean;
  readonly viewport: { width: number; height: number };
  readonly touch: boolean;
  readonly parts: Readonly<Record<string, Clip>>;
}

const CASES: readonly CropCase[] = [
  {
    name: "desktop-light",
    image: "user-menu--desktop-light",
    dark: false,
    viewport: DESKTOP,
    touch: false,
    parts: { header: DESKTOP_HEADER, menu: DESKTOP_MENU },
  },
  {
    name: "desktop-dark",
    image: "user-menu--desktop-dark",
    dark: true,
    viewport: DESKTOP,
    touch: false,
    parts: { header: DESKTOP_HEADER, menu: DESKTOP_MENU },
  },
  {
    name: "phone-light",
    image: "user-menu--phone-light",
    dark: false,
    viewport: PHONE,
    touch: true,
    parts: {
      "first row": { x: 0, y: 0, width: 390, height: 50 },
      "first tab": { x: 0, y: 50, width: 160, height: 32 },
      menu: { x: 165, y: 60, width: 206, height: 356 },
    },
  },
];

async function pixelsOf(page: Page, clip: Clip): Promise<PNG> {
  return PNG.sync.read(await page.screenshot({ clip, animations: "disabled", caret: "hide" }));
}

function differences(actual: PNG, expected: PNG): number {
  const { width, height } = expected;
  return pixelmatch(actual.data, expected.data, null, width, height, {
    threshold: PIXEL_THRESHOLD,
  });
}

test.describe("the header and the name menu", { tag: ["@visual", "@react"] }, () => {
  for (const { name, image, dark, viewport, touch, parts } of CASES) {
    test(`are the same as in the images: ${name}`, async ({ cloud, openApp }, testInfo) => {
      seedReferenceData(cloud);
      const app = await openApp({ viewport, touch });
      await app.screens.setAppearance({ dark, palette: "marfil" });
      await app.screens.open("user-menu");

      const reference = referenceImage(image);
      for (const [part, clip] of Object.entries(parts)) {
        const actual = await pixelsOf(app.page, clip);
        const expected = crop(reference, clip);
        await testInfo.attach(`${part}-actual.png`, {
          body: PNG.sync.write(actual),
          contentType: "image/png",
        });
        await testInfo.attach(`${part}-expected.png`, {
          body: PNG.sync.write(expected),
          contentType: "image/png",
        });
        expect.soft(differences(actual, expected), part).toBeLessThanOrEqual(allowedPixels(clip));
      }
    });
  }
});
