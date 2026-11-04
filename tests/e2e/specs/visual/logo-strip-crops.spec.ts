// The window of Armar franja against the same part of the images of the current app: behind the
// window there is the form of the flyer, which the React app does not have until flyer-editor arrives.
// When it does, `logo-strip-window` of reference-screens gets its tag, and this one is not needed.
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
const PHONE = { width: 390, height: 844 };

test.describe("Armar franja", { tag: ["@visual", "@react"] }, () => {
  for (const { name, dark, viewport, touch } of [
    { name: "desktop-light", dark: false, viewport: DESKTOP, touch: false },
    { name: "desktop-dark", dark: true, viewport: DESKTOP, touch: false },
    { name: "phone-light", dark: false, viewport: PHONE, touch: true },
  ]) {
    test(`the window on opening is the same as in the image: ${name}`, async ({
      cloud,
      openApp,
    }, testInfo) => {
      seedReferenceData(cloud);
      const app = await openApp({ viewport, touch });
      await app.screens.setAppearance({ dark, palette: "marfil" });
      await app.screens.open("logo-strip-window");

      const shown = await app.page.getByRole("dialog", { name: "Armar franja" }).boundingBox();
      const clip = shown && clipOf(shown, viewport);
      if (!clip) throw new Error("The window is not on screen");
      const actual = PNG.sync.read(
        await app.page.screenshot({ clip, animations: "disabled", caret: "hide" }),
      );
      const expected = crop(referenceImage(`logo-strip-window--${name}`), clip);
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
