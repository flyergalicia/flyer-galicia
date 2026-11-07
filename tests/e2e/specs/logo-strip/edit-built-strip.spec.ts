// Replaces pruebas/t68_volver_a_la_franja.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const FAR_LOGO = { x: 140, y: 2000, width: 300, height: 110 };
const SIZE_PERCENT = 130;
const PER_ROW = 3;

test("a strip already built can be edited without marking it again", async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await app.logoEditor.enter();
  await strip.waitForCatalog();

  await strip.open(LOGOS_STRIP, { province: "" });
  const built = await strip.tickNextAvoiding(3, []);
  await strip.waitForPreviewLogos();
  await strip.clickBrandRow(1);
  await strip.setMarkedSize(SIZE_PERCENT);
  await strip.setPerRow(PER_ROW);
  await strip.put();

  const logosOf = async (): Promise<string[]> =>
    (await strip.state()).brands.map(({ logo }) => logo);

  // 1) The button over the flyer
  expect.soft(await strip.editStripButtons(), 'each strip has its "Editar franja"').toBe(1);
  await strip.pressEditStripOnFlyer();
  await strip.waitForWindow();
  const resumed = await strip.state();
  expect.soft(resumed.resuming, "the button resumes that strip, it is not a new one").toBe(true);
  expect.soft(await logosOf(), "with the same brands, in the same order").toEqual(built);
  expect.soft(resumed.brands[1]?.size, "the same size").toBeCloseTo(SIZE_PERCENT / 100, 3);
  expect.soft(resumed.perRow, "the same columns").toBe(PER_ROW);
  expect.soft(await strip.offersRestoreOriginal(), "and it offers to restore it").toBe(true);
  await strip.close();

  // 2) From the toolbar of a logo of the strip
  const stripLogo = (await strip.changes()).find(({ strip: id, isCover }) => id && !isCover)?.box;
  if (!stripLogo) throw new Error("The strip has no logos");
  await strip.clickFlyer({
    x: stripLogo.x + stripLogo.width / 2,
    y: stripLogo.y + stripLogo.height / 2,
  });
  await app.page.waitForTimeout(200);
  expect.soft(await strip.toolbarOffersEditStrip(), 'its toolbar has "Editar franja"').toBe(true);
  await strip.pressEditStripOnToolbar();
  await strip.waitForWindow();
  expect.soft(await logosOf(), "and it opens the same strip").toEqual(built);
  await strip.close();

  // A loose logo does not offer it
  await strip.placeBrandsOn([FAR_LOGO]);
  expect.soft(await strip.logoToolbarVisible(), "the new loose logo has its toolbar").toBe(true);
  expect.soft(await strip.toolbarOffersEditStrip(), "a loose logo does not offer it").toBe(false);

  // 3) While marking, a click on a built strip opens it
  await strip.releaseLogos();
  await strip.startMarking();
  const cover = (await strip.changes()).find(({ isCover }) => isCover)?.origin;
  if (!cover) throw new Error("The strip is not on the flyer");
  await strip.clickFlyer({ x: cover.x + cover.width / 2, y: cover.y + cover.height / 2 });
  await strip.waitForWindow();
  expect.soft(await strip.isOpen(), "a click on a built strip opens it").toBe(true);
  expect.soft((await strip.state()).resuming, "resuming it").toBe(true);
  expect.soft(await logosOf(), "with its brands").toEqual(built);
  expect.soft(await strip.isMarking(), "and it stops marking").toBe(false);

  // What changes there goes to that same strip, it does not duplicate it.
  await strip.removeBrand(2);
  await strip.put();
  const changes = await strip.changes();
  expect.soft(changes.filter(({ isCover }) => isCover).length, "a single strip remains").toBe(1);
  expect
    .soft(
      changes.filter(({ strip: id, isCover, kind }) => id && !isCover && kind !== "text").length,
      "with the new brands",
    )
    .toBe(2);
});
