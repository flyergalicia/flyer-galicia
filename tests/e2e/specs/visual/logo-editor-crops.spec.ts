// Cambiar logos against the same part of the images of the current app, for as long as the React app
// has no form beside the flyer: `logo-editor` cannot be compared whole until flyer-editor arrives, and
// then this one is not needed anymore. On a computer: on a phone the flyer goes under the form.
import { PNG } from "pngjs";
import {
  allowedPixels,
  clipOf,
  crop,
  difference,
  referenceImage,
} from "../../support/design-system/images.ts";
import { expect, test } from "../../support/test.ts";
import { seedReferenceData } from "./reference-data.ts";

const DESKTOP = { width: 1366, height: 800 };

test.describe("Cambiar logos", { tag: ["@visual", "@react"] }, () => {
  for (const { name, dark } of [
    { name: "desktop-light", dark: false },
    { name: "desktop-dark", dark: true },
  ]) {
    test(`the preview on entering is the same as in the image: ${name}`, async ({
      cloud,
      openApp,
    }, testInfo) => {
      seedReferenceData(cloud);
      const app = await openApp({ viewport: DESKTOP });
      await app.screens.setAppearance({ dark, palette: "marfil" });
      await app.logoEditor.enter();
      await app.logoEditor.waitForBrandCatalog();

      const preview = await app.page
        .locator('[data-testid="flyer-preview"], .prev')
        .first()
        .boundingBox();
      const clip = preview && clipOf(preview, DESKTOP);
      if (!clip) throw new Error("The preview is not on screen");
      const actual = PNG.sync.read(
        await app.page.screenshot({ clip, animations: "disabled", caret: "hide" }),
      );
      const expected = crop(referenceImage(`logo-editor--${name}`), clip);
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
      expect(pixels).toBeLessThanOrEqual(allowedPixels(clip));
    });
  }
});
