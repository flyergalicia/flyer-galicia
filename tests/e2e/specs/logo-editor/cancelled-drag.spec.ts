// Replaces pruebas/t35_arrastre_cancelado.cjs.
import { expect, test } from "../../support/test.ts";

test("a drag the browser cancels leaves nothing hanging", async ({ openApp }) => {
  const app = await openApp();
  await app.logoEditor.enter();
  await app.logoEditor.placeBrands([{ x: 600, y: 2690, width: 140, height: 60 }]);
  await app.logoEditor.bringIntoView({ x: 600, y: 2720 });

  await app.logoEditor.cancelDragOnPlaced(0);
  expect
    .soft(await app.logoEditor.isDragging(), "a cancelled gesture does not leave the drag hanging")
    .toBe(false);
  await app.logoEditor.waitUntilSettled();

  const steps = (await app.logoEditor.undoSteps()).length;
  await app.logoEditor.touchPlaced(0);
  await app.page.keyboard.press("Shift+ArrowRight");
  await app.logoEditor.waitUntilSettled();
  expect
    .soft(await app.logoEditor.undoSteps(), "the next change is written down in Deshacer")
    .toHaveLength(steps + 1);
});
