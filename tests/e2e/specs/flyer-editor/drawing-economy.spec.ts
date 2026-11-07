// Measures what used to be protected only by reading how the code was written.
import { expect, test } from "../../support/test.ts";

const KEYSTROKES = 40;

test("a burst of changes draws the flyer once, not once per change", async ({ openApp }) => {
  const { flyerDrawing, flyerEditor } = await openApp();
  const oneDraw = await flyerDrawing.drawsWhile(() => flyerEditor.redrawFlyer(1));

  const draws = await flyerDrawing.drawsWhile(() => flyerEditor.typeCompanyInOneFrame(KEYSTROKES));

  expect.soft(oneDraw, "drawing is seen").toBeGreaterThan(0);
  expect.soft(draws, "in the same frame").toBeGreaterThan(0);
  expect.soft(draws).toBeLessThanOrEqual(oneDraw * 2);
});

test("changing the size of the window several times draws it once afterwards", async ({
  openApp,
}) => {
  const { flyerDrawing, flyerEditor, page } = await openApp();
  const oneDraw = await flyerDrawing.drawsWhile(() => flyerEditor.redrawFlyer(1));

  const draws = await flyerDrawing.drawsWhile(async () => {
    for (const width of [1200, 1250, 1300, 1350])
      await page.setViewportSize({ width, height: 800 });
  });

  expect.soft(draws).toBeGreaterThan(0);
  expect.soft(draws, "it waits for the window to settle").toBeLessThanOrEqual(oneDraw * 2);
});
