// Replaces pruebas/t52_mover_original_sin_deformar.cjs.
import { expect, test } from "../../support/test.ts";
import { button } from "./editor-toolbars.ts";

// A box with uneven margins around the logos of the strip.
const BOX_AROUND_LOGOS = { x: 120, y: 2630, width: 420, height: 170 };

test(
  "a logo of the flyer that is moved keeps its exact proportions",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();

    await app.logoEditor.drawBox(BOX_AROUND_LOGOS);
    await button(app.page, "Mover o agrandar lo que hay").click();

    // And it is moved
    await app.page.keyboard.press("Shift+ArrowRight");
    await app.page.keyboard.press("Shift+ArrowDown");
    await app.logoEditor.waitUntilSettled();

    const [moved] = await app.logoEditor.placements();
    const image = await app.logoEditor.placedImageSize(0);
    const box = moved?.box;
    const marked = moved?.place;
    if (!box || !marked) throw new Error("The logo of the flyer did not become a change");
    expect
      .soft(
        Math.abs(box.width / box.height - image.width / image.height),
        "the image has the same proportion as its box",
      )
      .toBeLessThan(0.01);
    expect.soft(image.width, "the image is as wide as the box marked").toBe(marked.width);
    expect.soft(image.height, "and as tall").toBe(marked.height);
  },
);
