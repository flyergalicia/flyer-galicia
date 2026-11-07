// Replaces pruebas/t44_franja_celular_pasos.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };

test("on a phone the window goes in two steps", async ({ openApp }) => {
  const app = await openApp({ viewport: { width: 390, height: 844 } });
  const strip = app.logoStrip;
  await strip.open(LOGOS_STRIP, { province: "" });

  const first = await strip.visibleParts();
  expect.soft(first.stepTabs, "step 1: the tabs of the steps").toBe(true);
  expect.soft(first.brandList, "step 1: the brands").toBe(true);
  expect.soft(first.preview, "step 1: no preview").toBe(false);
  expect.soft(first.selection, "step 1: no selection").toBe(false);
  expect.soft(first.next, 'step 1: "Siguiente" below').toBe(true);
  expect.soft(first.put, 'step 1: no "Poner logos"').toBe(false);

  await strip.tickNext(5);
  await app.page.waitForTimeout(800);
  expect.soft(await strip.nextStepLabel(), "the button counts the brands").toMatch(/\(5\)/);
  expect.soft(await strip.stepLabel(1), "and so does the tab of the step").toMatch(/\(5\)/);

  await strip.pressNextStep();
  await app.page.waitForTimeout(400);
  const second = await strip.visibleParts();
  expect.soft(second.brandList, "step 2: no brands").toBe(false);
  expect.soft(second.preview, "step 2: the preview").toBe(true);
  expect.soft(second.selection, 'step 2: "Tu selección"').toBe(true);
  const preview = await strip.previewSize();
  expect.soft(preview.width, "the preview shows wide on entering step 2").toBeGreaterThan(300);
  expect.soft(preview.height, "and tall enough").toBeGreaterThan(50);
  expect.soft(second.put, 'step 2: "Poner logos"').toBe(true);
  expect.soft(second.back, 'step 2: "← Elegir más"').toBe(true);
  expect.soft(second.cancel, "step 2: no Cancelar").toBe(false);
  expect.soft(await strip.pageFitsWidth(), "no sideways scroll").toBe(true);

  await strip.pressBackToBrands();
  await app.page.waitForTimeout(200);
  expect.soft((await strip.visibleParts()).brandList, '"← Elegir más" goes back').toBe(true);

  await strip.pressStep(2);
  await app.page.waitForTimeout(200);
  await strip.put();
  expect
    .soft((await strip.changes()).length, '"Poner logos" builds the strip')
    .toBeGreaterThanOrEqual(2);
});

test("on a computer there are no steps", async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await strip.open(LOGOS_STRIP, { province: "" });

  const parts = await strip.visibleParts();
  expect.soft(parts.stepTabs, "no tabs").toBe(false);
  expect.soft(parts.preview, "the preview").toBe(true);
  expect.soft(parts.brandList, "the brands").toBe(true);
  expect.soft(parts.put, '"Poner logos"').toBe(true);
  expect.soft(parts.next, 'no "Siguiente"').toBe(false);
});
