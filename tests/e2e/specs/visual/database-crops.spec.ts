// Base de datos against the same part of the images of the current app, for as long as the React app
// has no flyer behind it: `database-companies` and `database-advisors` cannot be compared whole until
// flyer-editor arrives, and then this one is not needed anymore.
import { type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { type ReferenceScreen } from "../../support/driver/screens.ts";
import {
  allowedPixels,
  type Clip,
  clipOf,
  crop,
  difference,
  paintCorners,
  referenceImage,
} from "../../support/design-system/images.ts";
import { expect, test } from "../../support/test.ts";
import { seedReferenceData } from "./reference-data.ts";

const DESKTOP = { width: 1366, height: 800 };
const PHONE = { width: 390, height: 844 };
const WINDOW_RADIUS = 16;

interface CropCase {
  readonly name: string;
  readonly dark: boolean;
  readonly viewport: { width: number; height: number };
  readonly touch: boolean;
}

const CASES: readonly CropCase[] = [
  { name: "desktop-light", dark: false, viewport: DESKTOP, touch: false },
  { name: "desktop-dark", dark: true, viewport: DESKTOP, touch: false },
  { name: "phone-light", dark: false, viewport: PHONE, touch: true },
];

const SCREENS: readonly ReferenceScreen[] = ["database-companies", "database-advisors"];

async function windowClip(page: Page, viewport: CropCase["viewport"]): Promise<Clip> {
  const box = await page.getByRole("dialog", { name: /Base de datos/ }).boundingBox();
  const clip = box && clipOf(box, viewport);
  if (!clip) throw new Error("The window is not on screen");
  return clip;
}

test.describe("Base de datos", { tag: ["@visual", "@react"] }, () => {
  for (const screen of SCREENS) {
    for (const { name, dark, viewport, touch } of CASES) {
      test(`${screen} is the same as in the image: ${name}`, async ({
        cloud,
        openApp,
      }, testInfo) => {
        seedReferenceData(cloud);
        const app = await openApp({ viewport, touch });
        await app.screens.setAppearance({ dark, palette: "marfil" });
        await app.screens.open(screen);

        const clip = await windowClip(app.page, viewport);
        const actual = PNG.sync.read(
          await app.page.screenshot({ clip, animations: "disabled", caret: "hide" }),
        );
        const expected = crop(referenceImage(`${screen}--${name}`), clip);
        paintCorners(actual, clip, WINDOW_RADIUS, clip);
        paintCorners(expected, clip, WINDOW_RADIUS, clip);
        const { pixels, picture } = difference(expected, actual);
        await testInfo.attach("actual.png", {
          body: PNG.sync.write(actual),
          contentType: "image/png",
        });
        await testInfo.attach("expected.png", {
          body: PNG.sync.write(expected),
          contentType: "image/png",
        });
        await testInfo.attach("difference.png", { body: picture, contentType: "image/png" });
        expect.soft(pixels, screen).toBeLessThanOrEqual(allowedPixels(clip));
      });
    }
  }
});
