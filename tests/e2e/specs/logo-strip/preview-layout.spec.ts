// Replaces pruebas/t33_franja_vista_previa.cjs.
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const MIN_PREVIEW_HEIGHT = 180;

async function checkPreviewIsStableAndTiedToSelection(app: OpenedApp): Promise<number> {
  const strip = app.logoStrip;
  await app.logoEditor.enter();
  await strip.open(LOGOS_STRIP, { province: "" });
  await app.page.waitForTimeout(300);

  const empty = await strip.previewSize();
  await strip.tickNext(1);
  const one = await strip.previewSize();
  await strip.tickNext(7);
  const eight = await strip.previewSize();
  await strip.tickNext(12);
  const twenty = await strip.previewSize();
  await strip.scrollLists();
  const scrolled = await strip.previewSize();
  for (const size of [one, eight, twenty, scrolled]) {
    expect.soft(size, "ticking or scrolling does not change the preview").toEqual(empty);
  }
  expect
    .soft(empty.height, `the preview is at least ${String(MIN_PREVIEW_HEIGHT)} px tall`)
    .toBeGreaterThanOrEqual(MIN_PREVIEW_HEIGHT);
  expect.soft(await strip.pageFitsWidth(), "no sideways scroll").toBe(true);

  await strip.waitForPreviewLogos();
  const count = (await strip.state()).brands.length;
  expect.soft(count, "the 20 logos downloaded").toBe(20);
  const rows = await strip.selectionRows();
  expect
    .soft(
      rows.map(({ number }) => number),
      "the list numbers them 1..N",
    )
    .toEqual(Array.from({ length: count }, (_, index) => index + 1));
  expect
    .soft((await strip.previewPlacement()).boxes.filter(Boolean).length, "the N boxes are drawn")
    .toBe(count);
  expect
    .soft(
      rows.filter(({ hasThumbnail }) => hasThumbnail).length,
      "each row has the thumbnail of the logo",
    )
    .toBe(count);

  await strip.clickBrandRow(4);
  await app.page.waitForTimeout(150);
  expect.soft((await strip.state()).marked, "touching row 5 marks logo 5").toBe(4);
  expect
    .soft(
      (await strip.selectionRows()).findIndex(({ highlighted }) => highlighted),
      "row 5 stays highlighted",
    )
    .toBe(4);

  const lastLogo = count - 1;
  await strip.clickPreviewLogo(lastLogo);
  await app.page.waitForTimeout(150);
  expect.soft((await strip.state()).marked, "touching the last logo marks it").toBe(lastLogo);
  expect
    .soft(
      (await strip.selectionRows()).findIndex(({ highlighted }) => highlighted),
      "and highlights its row",
    )
    .toBe(lastLogo);

  const lastTitle = (await strip.state()).brands[lastLogo]?.title;
  await strip.moveBrandUp(lastLogo);
  await app.page.waitForTimeout(150);
  const moved = await strip.state();
  expect.soft(moved.marked, "with the arrow the logo goes up and stays marked").toBe(lastLogo - 1);
  expect.soft(moved.brands[lastLogo - 1]?.title, "that same logo").toBe(lastTitle);

  await strip.removeBrand(0);
  await app.page.waitForTimeout(150);
  const afterRemoval = await strip.state();
  expect
    .soft(afterRemoval.brands[afterRemoval.marked]?.title, "removing another keeps the mark on it")
    .toBe(lastTitle);
  return empty.height;
}

test("on a 1366x768 screen the preview is stable, tied to the selection and can grow", async ({
  openApp,
}) => {
  const app = await openApp({ viewport: { width: 1366, height: 768 } });
  const strip = app.logoStrip;
  const normalHeight = await checkPreviewIsStableAndTiedToSelection(app);

  expect.soft(await strip.offersLargePreview(), '"Ampliar" is offered').toBe(true);
  await strip.pressLargePreview();
  await app.page.waitForTimeout(200);
  expect
    .soft((await strip.previewSize()).height, '"Ampliar" makes the preview taller')
    .toBeGreaterThan(normalHeight);
  expect
    .soft(await strip.largePreviewLabel(), 'the button turns into "Achicar"')
    .toContain("Achicar");

  await strip.pressLargePreview();
  await app.page.waitForTimeout(200);
  expect
    .soft((await strip.previewSize()).height, '"Achicar" goes back to the size before')
    .toBe(normalHeight);
});

test("on a 1920x1080 screen the preview is stable and tied to the selection", async ({
  openApp,
}) => {
  const app = await openApp({ viewport: { width: 1920, height: 1080 } });
  await checkPreviewIsStableAndTiedToSelection(app);

  // The strip already takes all the width of this window.
  expect
    .soft(await app.logoStrip.offersLargePreview(), '"Ampliar" is hidden: it would not grow')
    .toBe(false);
});

test("on a phone the preview stays in sight while scrolling the second step", async ({
  openApp,
}) => {
  const app = await openApp({ viewport: { width: 390, height: 844 } });
  const strip = app.logoStrip;
  await strip.open(LOGOS_STRIP, { province: "" });
  await strip.tickNext(6);
  await strip.waitForPreviewLogos();

  await strip.pressNextStep();
  await app.page.waitForTimeout(300);
  await strip.scrollWindow(700);
  await app.page.waitForTimeout(200);

  const preview = await strip.previewInWindow();
  expect.soft(preview.top, "it does not go off the top").toBeGreaterThanOrEqual(0);
  expect.soft(preview.top, "it stays near the top").toBeLessThan(260);
  expect.soft(preview.height, "it can be seen").toBeGreaterThan(50);
  expect.soft(await strip.pageFitsWidth(), "the page does not scroll sideways").toBe(true);
  expect.soft(await strip.windowFitsWidth(), "the window does not scroll sideways").toBe(true);
});
